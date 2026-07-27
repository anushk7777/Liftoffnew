// What weight does THIS lifter move at a given effort?
//
// Published RPE charts are population averages. The relationship between load,
// reps and how hard a set feels is individual, and this app already collects
// the exact three numbers needed to learn it — weight, reps and RPE, on every
// set. That data is sitting unused.
//
// The idea
// --------
// RPE is reps in reserve inverted: RPE 8 means about 2 left. So a set of 5 at
// RPE 8 says "I could have done about 7". Call that estimated reps to failure.
// Across the working range, weight falls roughly linearly as reps-to-failure
// rises, so fitting weight against it gives a personal curve — and reading
// "5 reps at RPE 8" off that curve answers the question asked at the bar.
//
// The slope of that line IS the lifter's kilos-per-RPE-point, measured rather
// than assumed at the textbook 3%.
//
// Why this is not a neural network
// --------------------------------
// A few hundred sets is nowhere near enough to train one, and a net would
// memorise the history rather than generalise from it. A weighted line fit on
// the lifter's own recent sets is both more accurate here and explainable,
// which matters when it is telling someone what to put on a bar.
import type { WorkoutSession, LoggedSet } from '../types';

const DAY_MS = 86_400_000;

/**
 * Warm-ups are excluded by EFFORT, not by distance from failure.
 *
 * Capping reps-to-failure would have thrown away legitimate high-rep work — 15
 * reps at RPE 8 is 17 from failure and is a real working set. What actually
 * marks a warm-up is a low rating, and self-rated effort is unreliable down
 * there anyway, so RPE 5 is the floor. The rtf cap stays only as a guard
 * against nonsense input.
 */
const MIN_WORKING_RPE = 5;
const MAX_RTF = 22;
/** Below this, a "set" is not carrying information about a working weight. */
const MIN_WEIGHT = 2.5;

/**
 * Older sets count for less, halving every six weeks.
 *
 * This is the answer to "my bad patches and my old strength level should not
 * decide today's weight". A layoff or a rough month fades out on its own, and
 * the model tracks who the lifter is now rather than who they were.
 */
const HALF_LIFE_DAYS = 42;

/** A logged set reduced to what the model needs. */
export interface Observation {
  sessionId: string;
  /** Days before the most recent session. */
  ageDays: number;
  /** reps + (10 - RPE): how many reps were probably available in total. */
  rtf: number;
  weight: number;
}

const num = (s: string | undefined): number | null => {
  if (!s || !s.trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Reps the lifter could probably have managed, from what they did and felt. */
export function repsToFailure(reps: number, rpe: number): number {
  return reps + (10 - rpe);
}

/**
 * Pull the usable sets for one exercise out of the history.
 *
 * Skips anything that cannot inform a working weight: no weight or reps, no
 * rated effort, warm-up-distance efforts, and sessions the lifter marked rough.
 */
export function observationsFor(
  sessions: WorkoutSession[],
  exerciseName: string,
  now = Date.now(),
): Observation[] {
  const out: Observation[] = [];
  for (const s of sessions) {
    // A session the lifter flagged as an off day is history, not evidence.
    if (s.roughDay) continue;
    const t = Date.parse(s.completedAt ?? s.date);
    if (Number.isNaN(t)) continue;
    const ageDays = Math.max(0, (now - t) / DAY_MS);
    for (const e of s.entries) {
      if (e.name !== exerciseName) continue;
      for (const st of e.sets as LoggedSet[]) {
        const w = num(st.weight);
        const r = num(st.reps);
        const rpe = num(st.rpe);
        if (w == null || r == null || rpe == null) continue;
        if (w < MIN_WEIGHT || r <= 0 || rpe < MIN_WORKING_RPE || rpe > 10) continue;
        const rtf = repsToFailure(r, rpe);
        if (rtf <= 0 || rtf > MAX_RTF) continue;
        out.push({ sessionId: s.id, ageDays, rtf, weight: w });
      }
    }
  }
  return out;
}

export type ModelConfidence = 'good' | 'low' | 'none';

export interface LoadModel {
  confidence: ModelConfidence;
  /** Why it will not answer, when confidence is 'none'. */
  reason?: 'no-data' | 'too-few' | 'no-spread' | 'stale' | 'erratic';
  /** Predict the weight for a target reps/RPE. Null when not confident. */
  predict: (reps: number, rpe: number) => number | null;
  /** The lifter's own kilos per RPE point, or null. */
  kgPerRpe: number | null;
  /** Sets that informed the fit, after filtering. */
  samples: number;
  /** Days since the newest set used. */
  freshnessDays: number;
  /** Sessions whose whole performance sat off the curve — likely off days. */
  offDays: string[];
  /** Typical miss of the fit, in kg. Larger means less trustworthy. */
  spreadKg: number;
}

const NO_MODEL = (reason: LoadModel['reason']): LoadModel => ({
  confidence: 'none',
  reason,
  predict: () => null,
  kgPerRpe: null,
  samples: 0,
  freshnessDays: Infinity,
  offDays: [],
  spreadKg: 0,
});

/** Weighted least squares of weight against reps-to-failure. */
function fit(obs: Observation[], weights: number[]): { a: number; b: number } | null {
  let sw = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < obs.length; i++) {
    sw += weights[i];
    sx += weights[i] * obs[i].rtf;
    sy += weights[i] * obs[i].weight;
  }
  if (sw <= 0) return null;
  const mx = sx / sw;
  const my = sy / sw;
  let num2 = 0;
  let den = 0;
  for (let i = 0; i < obs.length; i++) {
    num2 += weights[i] * (obs[i].rtf - mx) * (obs[i].weight - my);
    den += weights[i] * (obs[i].rtf - mx) ** 2;
  }
  if (den === 0) return null;
  const b = num2 / den;
  return { a: my - b * mx, b };
}

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((p, q) => p - q);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Build the model for one exercise.
 *
 * Bad days are handled without throwing the data away. A rough day is not a
 * lie — the effort reported was honest, the day was just worse — so what the
 * set is missing is context, not accuracy. Since a bad day makes EVERY lift
 * feel heavy, it shows up as a whole session sitting on one side of the curve,
 * while a genuine strength change shows on one lift and persists. Sessions that
 * sit consistently off are down-weighted rather than deleted, so one miserable
 * Tuesday cannot drag next week's prescription down, and three in a row still
 * move it because by then it is real.
 */
export function buildLoadModel(
  sessions: WorkoutSession[],
  exerciseName: string,
  now = Date.now(),
): LoadModel {
  const obs = observationsFor(sessions, exerciseName, now);
  if (obs.length === 0) return NO_MODEL('no-data');

  const freshnessDays = Math.min(...obs.map((o) => o.ageDays));
  // After a long layoff the old curve describes a different lifter.
  if (freshnessDays > 35) return { ...NO_MODEL('stale'), samples: obs.length, freshnessDays };
  if (obs.length < 6) return { ...NO_MODEL('too-few'), samples: obs.length, freshnessDays };

  // Every set needs to have been at a different distance from failure, or there
  // is no curve to read — only a single point repeated.
  const rtfs = new Set(obs.map((o) => Math.round(o.rtf)));
  if (rtfs.size < 3) return { ...NO_MODEL('no-spread'), samples: obs.length, freshnessDays };

  const recency = obs.map((o) => Math.pow(0.5, o.ageDays / HALF_LIFE_DAYS));

  const first = fit(obs, recency);
  if (!first) return { ...NO_MODEL('no-spread'), samples: obs.length, freshnessDays };

  // Residuals grouped by session: a day where everything sat off the curve is
  // the day, not the lifter.
  const resid = obs.map((o) => o.weight - (first.a + first.b * o.rtf));
  const bySession = new Map<string, number[]>();
  obs.forEach((o, i) => bySession.set(o.sessionId, [...(bySession.get(o.sessionId) ?? []), resid[i]]));

  // "Twice the typical miss" needs a floor, or it collapses on clean data: a
  // lifter whose sets sit close to the curve has a typical residual near zero,
  // so twice nothing flags ordinary sessions as off days and down-weights them.
  // A session has to be off by a real amount — 2% of working weight, and at
  // least a plate step — before it counts as one.
  const meanW = obs.reduce((sum, o) => sum + o.weight, 0) / obs.length;
  const typical = Math.max(median(resid.map(Math.abs)), meanW * 0.02, 2.5);
  const offDays: string[] = [];
  const sessionBias = new Map<string, number>();
  for (const [id, rs] of bySession) {
    const m = median(rs);
    sessionBias.set(id, m);
    // Needs more than one set to be a pattern rather than a single bad rep.
    if (rs.length >= 2 && Math.abs(m) > 2 * typical) offDays.push(id);
  }

  const adjusted = recency.map((w, i) =>
    offDays.includes(obs[i].sessionId) ? w * 0.15 : w,
  );
  const second = fit(obs, adjusted) ?? first;

  const resid2 = obs.map((o) => o.weight - (second.a + second.b * o.rtf));
  const spreadKg = Math.round(median(resid2.map(Math.abs)) * 10) / 10;

  // Slope must point the right way: heavier weights sit closer to failure. A
  // positive slope means the data is contradictory, so it says nothing.
  if (second.b >= 0) return { ...NO_MODEL('erratic'), samples: obs.length, freshnessDays };

  const kgPerRpe = Math.round(Math.abs(second.b) * 100) / 100;
  const effective = obs.filter((o) => !offDays.includes(o.sessionId)).length;
  const meanWeight = meanW;

  // Spread past a tenth of working weight means recent sessions disagree too
  // much to name a number from.
  const tooNoisy = spreadKg > meanWeight * 0.1;
  const confidence: ModelConfidence =
    tooNoisy || effective < 8 || freshnessDays > 21 ? 'low' : 'good';

  return {
    confidence,
    predict: (reps, rpe) => {
      if (!Number.isFinite(reps) || !Number.isFinite(rpe)) return null;
      const w = second.a + second.b * repsToFailure(reps, rpe);
      return w > 0 ? Math.round(w * 10) / 10 : null;
    },
    kgPerRpe,
    samples: obs.length,
    freshnessDays: Math.round(freshnessDays),
    offDays,
    spreadKg,
  };
}
