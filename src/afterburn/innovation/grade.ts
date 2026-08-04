// GRADING — the engine marking its own homework, in public.
//
// A prescription is the first thing this app has ever produced that is
// FALSIFIABLE at the moment it is given: it names a weight you are about to
// test. Everything else here — the volume status, the returns ledger, the
// pre-session brief — is an opinion about the past, and an opinion about the
// past can be wrong forever without anybody noticing.
//
// So the prescription is snapshotted when the session starts and scored against
// what was actually lifted. Two things follow, and the second matters more:
//
//   1. You can see whether to trust it. A number with a track record is a
//      different object from a number without one.
//   2. It produces GROUND TRUTH, automatically. Every other engine in Afterburn
//      was calibrated against simulated lifters because real ground truth did
//      not exist. This makes it exist, from ordinary use, with nothing extra to
//      tap — which is strictly better than the self-reported cue verdicts.
//
// ---------------------------------------------------------------------------
// THE ONE NUMBER
//
// A prescription targets a weight for N reps at a given RPE. It can miss in two
// directions at once — you might get fewer reps AND rate it harder — so the two
// have to collapse into a single signed quantity or nothing can be averaged.
//
// One rep is worth roughly one RPE point: that is the definition of the scale
// (RPE 8 = two reps left, RPE 9 = one). So:
//
//     miss = (RPE you gave − RPE asked for) + (reps asked for − reps you got)
//
// Positive means the prescription was **too heavy**. Negative means too light.
// Both channels push the same way when they agree, and cancel honestly when they
// disagree — 12 reps at RPE 9 against a target of 10 at RPE 8 is a wash, and it
// should be, because you did more work at proportionally more effort.
import type { LoggedSet, WorkoutSession } from '../types';

const num = (s: string | undefined | null): number | null => {
  if (s == null || !String(s).trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export type { PrescribedSet } from '../types';

/** One prescribed set, scored. */
export interface GradedSet {
  exercise: string;
  index: number;
  basis: string;
  /** ISO date of the session it was tested in. */
  date: string;
  t: number;
  prescribedWeight: number;
  prescribedReps: number;
  prescribedRpe: number;
  actualWeight: number;
  actualReps: number;
  actualRpe: number;
  /** Signed, in RPE points. Positive = the prescription was too heavy. */
  miss: number;
  /** The learned correction in force when this set was prescribed (1 = none).
   *  Carried through so the calibrator can compare a set prescribed under a
   *  correction with one prescribed without — see `calibrate.ts`. */
  correction: number;
  /** Whether the lifter used the weight they were given. A set done at a
   *  different weight still grades — the point is whether the PRESCRIPTION was
   *  right, not whether it was obeyed — but the two must be separable. */
  followed: boolean;
}

/** Within one RPE point is a hit: that is the resolution of the scale itself,
 *  and no honest prescription can claim better than the instrument. */
export const HIT_WITHIN = 1;

/**
 * Score one session's prescriptions against what was logged in it.
 *
 * A set only grades when the prescription and the result are both complete —
 * weight, reps and RPE on each side. A set logged without an RPE cannot say
 * whether the load was right, and guessing would poison the very dataset this
 * exists to build.
 */
export function gradeSession(session: WorkoutSession | null | undefined): GradedSet[] {
  if (!session) return [];
  const prescribed = session.prescribed;
  if (!Array.isArray(prescribed) || !prescribed.length) return [];
  const t = Date.parse(session?.completedAt ?? session?.date ?? '');
  if (Number.isNaN(t)) return [];
  // A day the lifter flagged as rough says nothing about the prescription: the
  // load was fine, the day was not. Excluded for the same reason the load model
  // excludes them.
  if (session?.roughDay) return [];

  const out: GradedSet[] = [];
  for (const p of prescribed) {
    if (!p?.exercise || p.weight == null || p.reps == null || p.rpe == null) continue;
    const entry = (session.entries ?? []).find((e) => e?.name === p.exercise);
    // By id when there is one. Finishing a session prunes the blank sets and
    // closes the gap, so a positional lookup can hand back a DIFFERENT set than
    // the one that was predicted for — and grade the engine on it. Only records
    // written before `setId` existed fall back to position.
    const actual: LoggedSet | undefined = p.setId
      ? entry?.sets?.find((st) => st?.id === p.setId)
      : entry?.sets?.[p.index];
    const aw = num(actual?.weight);
    const ar = num(actual?.reps);
    const ae = num(actual?.rpe);
    if (aw == null || ar == null || ae == null || aw <= 0 || ar <= 0) continue;

    out.push({
      exercise: p.exercise,
      index: p.index,
      basis: p.basis,
      date: new Date(t).toISOString(),
      t,
      prescribedWeight: p.weight,
      prescribedReps: p.reps,
      prescribedRpe: p.rpe,
      actualWeight: aw,
      actualReps: ar,
      actualRpe: ae,
      miss: Math.round((ae - p.rpe + (p.reps - ar)) * 10) / 10,
      correction: Number.isFinite(p.correction) && p.correction ? p.correction : 1,
      followed: Math.abs(aw - p.weight) < 0.01,
    });
  }
  return out;
}

/** Every graded set across a history, oldest first. */
export function gradeAll(sessions: WorkoutSession[] | null | undefined): GradedSet[] {
  const out: GradedSet[] = [];
  for (const s of sessions ?? []) out.push(...gradeSession(s));
  return out.sort((a, b) => a.t - b.t);
}

export interface Accuracy {
  /** Sets scored. */
  n: number;
  /** Median absolute miss, in RPE points. The headline: lower is better. */
  medianMiss: number;
  /** Median SIGNED miss — the bias. Positive means it runs heavy. */
  bias: number;
  /** Share landing within one RPE point. */
  hitRate: number;
  /** Share where the lifter used the weight given. */
  followRate: number;
}

/** Robust because a single mis-typed weight can be a 5-point outlier, and a mean
 *  would let one fat finger rewrite the engine's opinion of itself. */
export function accuracy(graded: GradedSet[]): Accuracy {
  const n = graded.length;
  if (!n) return { n: 0, medianMiss: 0, bias: 0, hitRate: 0, followRate: 0 };
  return {
    n,
    medianMiss: Math.round(median(graded.map((g) => Math.abs(g.miss))) * 100) / 100,
    bias: Math.round(median(graded.map((g) => g.miss)) * 100) / 100,
    hitRate: Math.round((graded.filter((g) => Math.abs(g.miss) <= HIT_WITHIN).length / n) * 100) / 100,
    followRate: Math.round((graded.filter((g) => g.followed).length / n) * 100) / 100,
  };
}

export type Direction = 'improving' | 'steady' | 'worsening' | 'unknown';

export interface Trend {
  direction: Direction;
  /** Median absolute miss over the recent window, and the one before it. */
  recent: number;
  previous: number;
  /** Sets in each window. */
  window: number;
}

/** Below this there is no window to compare, and any "trend" would be one
 *  session's mood. */
export const MIN_TREND_SETS = 12;
/** A change smaller than this is inside the noise of self-rating and must not be
 *  reported as movement. Deliberately generous: the whole point of this file is
 *  that the engine cannot flatter itself. */
export const TREND_NOISE = 0.15;

/**
 * Is it getting better?
 *
 * Splits the graded history in half by time and compares median absolute miss.
 * Not a fit and not a significance test — with tens of points a fitted slope
 * would be over-reading — just an honest before-and-after with a dead band.
 */
export function trend(graded: GradedSet[]): Trend {
  const n = graded.length;
  if (n < MIN_TREND_SETS * 2) return { direction: 'unknown', recent: 0, previous: 0, window: 0 };
  const half = Math.floor(n / 2);
  const previous = median(graded.slice(0, half).map((g) => Math.abs(g.miss)));
  const recent = median(graded.slice(half).map((g) => Math.abs(g.miss)));
  const delta = recent - previous;
  return {
    direction: delta < -TREND_NOISE ? 'improving' : delta > TREND_NOISE ? 'worsening' : 'steady',
    recent: Math.round(recent * 100) / 100,
    previous: Math.round(previous * 100) / 100,
    window: n - half,
  };
}

/** Accuracy split by which rung of the ladder produced the number. This is how
 *  you find out whether the personal curve is actually beating the rule of
 *  thumb, rather than assuming it must. */
export function accuracyByBasis(graded: GradedSet[]): Record<string, Accuracy> {
  const groups = new Map<string, GradedSet[]>();
  for (const g of graded) {
    const arr = groups.get(g.basis) ?? [];
    arr.push(g);
    groups.set(g.basis, arr);
  }
  const out: Record<string, Accuracy> = {};
  for (const [basis, arr] of groups) out[basis] = accuracy(arr);
  return out;
}
