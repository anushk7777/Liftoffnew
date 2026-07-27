// Which exercises are actually working on YOUR body.
//
// Every training app can tell you what you lifted. None of them tell you which
// lifts earned their place. A bodybuilder invests a fixed, scarce budget — sets
// you can recover from — and spreads it across ten or twelve movements. Some of
// those pay; some have paid nothing for two months and nobody notices, because
// the only thing being tracked is that the sets got done.
//
// This ranks each lift by strength gained per set invested, and where a lift
// has returned nothing it names the swaps the program itself already sanctions.
//
// It is deliberately hard to convince. A ranking built on noise is worse than
// no ranking, because it would have you drop exercises for no reason:
//
//   * fewer than MIN_SESSIONS sessions, or a span under MIN_SPAN_DAYS -> the
//     verdict is 'unknown', not 'flat'. Absence of evidence is said plainly.
//   * the trend is a least-squares slope over TIME, not last-minus-first, so
//     one bad day at either end cannot decide a lift's fate, and unevenly
//     spaced sessions are handled correctly.
//   * a gain only counts once it clears a noise floor scaled to the weights
//     actually used — e1RM is an estimate, and small numbers wobble.
//   * sessions flagged as a rough day are excluded, exactly as the load model
//     excludes them.
import type { WorkoutProgram, WorkoutSession } from './types';
import { exerciseProgress } from './store';

/** Not enough points to fit a line worth trusting. */
const MIN_SESSIONS = 3;
/** Two weeks is the least that can show a trend rather than a mood. */
const MIN_SPAN_DAYS = 14;
/** e1RM is an estimate; below this a "gain" is arithmetic, not strength. */
const MIN_MEANINGFUL_KG = 2.5;
const NOISE_SHARE = 0.02; // 2% of the working weight
const DAY_MS = 86_400_000;

export type ReturnVerdict = 'unknown' | 'declining' | 'flat' | 'working' | 'strong';

export interface LiftReturn {
  name: string;
  /** Hard sets invested across the window. */
  sets: number;
  sessions: number;
  spanDays: number;
  /** Estimated 1RM at the start and end of the fitted line. */
  from: number;
  to: number;
  /** Kilos of e1RM the fit says were gained across the window. */
  gain: number;
  /** The comparable number: kilos gained per ten sets invested. */
  perTenSets: number;
  verdict: ReturnVerdict;
  /** What the program offers instead, when this one has stopped paying. */
  substitutions: string[];
}

/** Least-squares slope of y against x. Null when x never varies. */
function slope(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

/**
 * What the program offers instead of a given lift.
 *
 * Indexed for every member of a slot's family, not just the name printed on the
 * sheet. A substitution is not itself a program slot, so once you swap to
 * "DB Flye" that name appears nowhere as a key — and the lift you are actually
 * doing would be the one lift that never gets alternatives suggested. Each
 * member maps to its siblings, the original included.
 */
export function substitutionIndex(program: WorkoutProgram | null | undefined): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const w of program?.weeks ?? [])
    for (const d of w.days)
      for (const e of d.exercises) {
        if (!e.substitutions?.length) continue;
        const family = [e.name, ...e.substitutions];
        for (const member of family) {
          if (out.has(member)) continue;
          out.set(member, family.filter((x) => x !== member));
        }
      }
  return out;
}

/**
 * Rank every lift by strength returned per set invested.
 *
 * `sinceDays` bounds the window — a lift that stopped paying two blocks ago and
 * has since been fixed should not be condemned by ancient history.
 */
export function liftReturns(
  sessions: WorkoutSession[],
  program?: WorkoutProgram | null,
  sinceDays = 90,
  now: Date = new Date(),
): LiftReturn[] {
  const cutoff = now.getTime() - sinceDays * DAY_MS;
  // A rough day makes every lift read heavy; it says nothing about the exercise.
  const usable = sessions.filter((s) => {
    if (s.roughDay) return false;
    const t = Date.parse(s.completedAt ?? s.date);
    return !Number.isNaN(t) && t >= cutoff;
  });

  const subs = substitutionIndex(program);
  const names = new Set<string>();
  for (const s of usable) for (const e of s.entries) names.add(e.name);

  const out: LiftReturn[] = [];
  for (const name of names) {
    // Hard sets invested — the cost side of the ledger.
    let sets = 0;
    for (const s of usable)
      for (const e of s.entries)
        if (e.name === name)
          for (const st of e.sets) {
            const r = parseInt(st.reps, 10);
            if ((Number.isFinite(r) && r > 0) || st.done) sets++;
          }

    const series = exerciseProgress(usable, name);
    const base: Omit<LiftReturn, 'gain' | 'perTenSets' | 'verdict' | 'from' | 'to'> = {
      name,
      sets,
      sessions: series.length,
      spanDays: 0,
      substitutions: subs.get(name) ?? [],
    };

    if (series.length < MIN_SESSIONS) {
      out.push({ ...base, from: 0, to: 0, gain: 0, perTenSets: 0, verdict: 'unknown' });
      continue;
    }

    const ts = series.map((p) => Date.parse(p.date));
    const spanDays = Math.round((Math.max(...ts) - Math.min(...ts)) / DAY_MS);
    const ys = series.map((p) => p.est1RM);

    if (spanDays < MIN_SPAN_DAYS) {
      out.push({ ...base, spanDays, from: 0, to: 0, gain: 0, perTenSets: 0, verdict: 'unknown' });
      continue;
    }

    // Slope per day, then read the fitted line at each end of the window.
    const days = ts.map((t) => (t - Math.min(...ts)) / DAY_MS);
    const m = slope(days, ys);
    if (m == null) {
      out.push({ ...base, spanDays, from: 0, to: 0, gain: 0, perTenSets: 0, verdict: 'unknown' });
      continue;
    }
    const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
    const meanX = days.reduce((a, b) => a + b, 0) / days.length;
    const intercept = meanY - m * meanX;
    const from = Math.round((intercept + m * Math.min(...days)) * 10) / 10;
    const to = Math.round((intercept + m * Math.max(...days)) * 10) / 10;
    const gain = Math.round((to - from) * 10) / 10;

    // A gain has to clear the wobble in an e1RM estimate before it is called one.
    const noise = Math.max(MIN_MEANINGFUL_KG, meanY * NOISE_SHARE);
    const verdict: ReturnVerdict =
      gain < -noise ? 'declining' : gain <= noise ? 'flat' : gain > noise * 2 ? 'strong' : 'working';

    out.push({
      ...base,
      spanDays,
      from,
      to,
      gain,
      perTenSets: sets > 0 ? Math.round((gain / sets) * 10 * 10) / 10 : 0,
      verdict,
    });
  }

  // Best return first; the ones with no verdict sink to the bottom rather than
  // sitting among real results with a misleading zero.
  const rank: Record<ReturnVerdict, number> = { strong: 0, working: 1, flat: 2, declining: 2, unknown: 3 };
  return out.sort(
    (a, b) =>
      rank[a.verdict] - rank[b.verdict] ||
      b.perTenSets - a.perTenSets ||
      b.sets - a.sets ||
      a.name.localeCompare(b.name),
  );
}

/** The lifts worth acting on: paying nothing, and expensive enough to matter. */
export function deadWeight(returns: LiftReturn[], minSets = 6): LiftReturn[] {
  return returns.filter((r) => (r.verdict === 'flat' || r.verdict === 'declining') && r.sets >= minSets);
}
