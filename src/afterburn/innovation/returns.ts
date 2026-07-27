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
//   * the trend is a Theil-Sen slope over TIME — the median of every pairwise
//     slope — so one bad day cannot decide a lift's fate and unevenly spaced
//     sessions are handled correctly.
//   * a gain only counts once it clears a floor that grows with rep drift,
//     because drift alone manufactures fake e1RM movement.
//   * when the lift's scatter is wider than a gain worth finding, the verdict
//     is 'unknown' rather than 'flat' — see `underpowered` in strength.ts.
//   * sessions flagged as a rough day are excluded, exactly as the load model
//     excludes them.
import type { WorkoutProgram, WorkoutSession } from '../types';
import { sessionPoints, fitTrend, diagnoseFlat, MIN_SESSIONS_FOR_VERDICT } from './strength';
import type { Diagnosis } from './strength';

/** Not enough points to fit a line worth trusting. Four, not three: the
 *  significance test cannot reach its threshold from three sessions however
 *  cleanly they climb — see MIN_SESSIONS_FOR_VERDICT. */
const MIN_SESSIONS = MIN_SESSIONS_FOR_VERDICT;
/** Two weeks is the least that can show a trend rather than a mood. */
const MIN_SPAN_DAYS = 14;
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
  /** This lift's own scatter, in kilos — what it has to beat to count. */
  typicalError: number;
  /** How far the rep count moved; drift manufactures fake e1RM change. */
  repDrift: number;
  /** The bar the gain had to clear. */
  threshold: number;
  /** Why it is flat, when it is. Effort and load are checked before the
   *  exercise itself is blamed. */
  diagnosis: Diagnosis | null;
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
  // Every level is guarded, not just the outermost. The program is persisted to
  // localStorage and restored verbatim, so a partial write, an older schema or
  // a bad sync can hand back an object whose `days` or `exercises` is missing.
  // Fuzzing found both cases throwing "is not iterable", which would take down
  // the whole Progress screen rather than degrade one section.
  for (const w of program?.weeks ?? [])
    for (const d of w?.days ?? [])
      for (const e of d?.exercises ?? []) {
        if (!e?.name || !e.substitutions?.length) continue;
        const family = [e.name, ...e.substitutions];
        for (const member of family) {
          if (out.has(member)) continue;
          out.set(member, family.filter((x) => x !== member));
        }
      }
  return out;
}

/** The RPE the sheet asks for, per exercise. Needed to judge whether a flat
 *  lift was actually being trained hard enough to expect anything from it.
 *  A ranged value ("~9-10") is read at its lower bound, so a lifter is never
 *  told they under-performed a target they in fact met. */
export function targetRpeIndex(program: WorkoutProgram | null | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const w of program?.weeks ?? [])
    for (const d of w?.days ?? [])
      for (const e of d?.exercises ?? []) {
        if (!e?.name || out.has(e.name) || !e.rpe) continue;
        const first = parseFloat(String(e.rpe).replace(/[^0-9.\-–]/g, '').split(/[-–]/)[0]);
        if (Number.isFinite(first) && first > 0) out.set(e.name, first);
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
  const targets = targetRpeIndex(program);
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

    const points = sessionPoints(usable, name);
    const unknown = (spanDays = 0): LiftReturn => ({
      name,
      sets,
      sessions: points.length,
      spanDays,
      substitutions: subs.get(name) ?? [],
      from: 0,
      to: 0,
      gain: 0,
      perTenSets: 0,
      verdict: 'unknown',
      typicalError: 0,
      repDrift: 0,
      threshold: 0,
      diagnosis: null,
    });

    if (points.length < MIN_SESSIONS) {
      out.push(unknown());
      continue;
    }
    const spanDays = Math.round((points[points.length - 1].t - points[0].t) / DAY_MS);
    if (spanDays < MIN_SPAN_DAYS) {
      out.push(unknown(spanDays));
      continue;
    }

    const trend = fitTrend(points);
    if (!trend) {
      out.push(unknown(spanDays));
      continue;
    }

    // Three outcomes, not two. `real` is the two-part test — distinguishable
    // from this lift's own scatter AND bigger than rep drift could have
    // manufactured. Failing it splits: if the scatter is small enough that a
    // gain worth having would have shown, "flat" is a finding. If the scatter
    // swamps that, nothing could have been seen, and saying "flat" would be a
    // bluff — so it stays unknown and no swap is suggested.
    const verdict: ReturnVerdict = trend.real
      ? trend.gain < 0
        ? 'declining'
        : trend.gain > trend.threshold * 2
          ? 'strong'
          : 'working'
      : trend.underpowered
        ? 'unknown'
        : 'flat';

    out.push({
      name,
      sets,
      sessions: points.length,
      spanDays: trend.spanDays,
      substitutions: subs.get(name) ?? [],
      from: trend.from,
      to: trend.to,
      gain: trend.gain,
      perTenSets: sets > 0 ? Math.round((trend.gain / sets) * 10 * 10) / 10 : 0,
      verdict,
      typicalError: trend.typicalError,
      repDrift: trend.repDrift,
      threshold: trend.threshold,
      // Only worth diagnosing when it is not moving. A lift that is working
      // needs no explanation.
      diagnosis: verdict === 'flat' || verdict === 'declining' ? diagnoseFlat(points, targets.get(name) ?? null) : null,
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
