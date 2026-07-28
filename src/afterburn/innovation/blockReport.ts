// The report you get at the end of a training block.
//
// A block ends and nothing happens. You close the app on the last session of
// week 10 exactly as you closed it on the first session of week 1, and ten weeks
// of work leaves no mark. Every number needed to say what actually happened is
// already in the log — it has just never been added up.
//
// Nothing here is a new measurement. It reads the engines that already exist —
// the strength verdict, the volume analyser, PR detection, adherence — and
// assembles them into one answer to "what did those ten weeks buy me?".
//
// Two rules it follows, both learned the hard way elsewhere in this folder:
//
//   * It reports what it can support and stays quiet otherwise. A block with
//     one logged session gets a headline and nothing else, rather than a
//     confident-looking "biggest gain" computed from noise.
//   * A stalled lift is named but not condemned. The ledger's own diagnosis
//     decides whether that was effort, load, or the movement — and this only
//     passes the answer along.
import type { WorkoutProgram, WorkoutSession } from '../types';
import { completionMap, dayCompletionKey, detectPRs, volumeByProgramWeek } from '../store';
import type { PRHit } from '../store';
import { liftReturns } from './returns';
import type { LiftReturn } from './returns';

const DAY_MS = 86_400_000;

/** Does the sheet call this week a deload? Reading the program's own label —
 *  the app never infers one. */
export const isDeloadWeek = (weekName: string | undefined): boolean =>
  !!weekName && /deload/i.test(weekName);

export interface WeekLine {
  id: string;
  name: string;
  /** Days logged, and days the sheet prescribes. */
  done: number;
  planned: number;
  tonnage: number;
  sets: number;
  /** ISO of the first session in the week, for ordering and charting. */
  start: string | null;
}

export interface BlockReport {
  /** False when there is nothing logged for this program at all. */
  hasData: boolean;
  programName: string;
  /** Every program week with at least one logged session, oldest first. */
  weeks: WeekLine[];
  /** True once every prescribed day of every program week has been logged. */
  complete: boolean;
  firstDate: string | null;
  lastDate: string | null;
  spanDays: number;
  sessions: number;
  /** Days logged across the block, and days prescribed for the weeks touched. */
  daysDone: number;
  daysPlanned: number;
  adherencePct: number;
  tonnage: number;
  sets: number;
  /** Distinct exercises trained. */
  lifts: number;
  /** Sets logged at RPE 10 — taken to failure. */
  failureSets: number;
  /** Distinct exercises taken to failure at least once. */
  failureLifts: number;
  /** Failure sets as a share of every set that had an RPE logged at all.
   *  Measured against RATED sets, not all sets: an unrated set says nothing
   *  about how hard it was, and counting it as "not to failure" would punish
   *  you for not filling in a box. */
  failureRate: number;
  /** Best PRs of the block, biggest jump first. */
  prs: PRHit[];
  /** The lift that gained most, when one can be named with confidence. */
  bestLift: LiftReturn | null;
  /** The most expensive lift that went nowhere. Null when nothing qualifies. */
  stalledLift: LiftReturn | null;
  /** Sets that bought nothing, across every stalled lift. */
  wastedSets: number;
}

const empty = (programName: string): BlockReport => ({
  hasData: false,
  programName,
  weeks: [],
  complete: false,
  firstDate: null,
  lastDate: null,
  spanDays: 0,
  sessions: 0,
  daysDone: 0,
  daysPlanned: 0,
  adherencePct: 0,
  tonnage: 0,
  sets: 0,
  lifts: 0,
  failureSets: 0,
  failureLifts: 0,
  failureRate: 0,
  prs: [],
  bestLift: null,
  stalledLift: null,
  wastedSets: 0,
});

/**
 * Summarise everything logged against a program.
 *
 * `sinceDays` for the strength verdicts is deliberately wide — a block runs ten
 * weeks and the ledger's usual 90-day window would clip the start of it.
 */
export function blockReport(
  sessions: WorkoutSession[],
  program: WorkoutProgram | null | undefined,
  now: Date = new Date(),
): BlockReport {
  const name = program?.name ?? 'Your program';
  if (!program?.weeks?.length) return empty(name);

  // Only sessions belonging to this program's weeks count towards the block.
  const weekIds = new Set(program.weeks.map((w) => w.id));
  const mine = sessions.filter((s) => s.weekId && weekIds.has(s.weekId));
  if (!mine.length) return empty(name);

  const stamped = mine
    .map((s) => ({ s, t: Date.parse(s.completedAt ?? s.date) }))
    .filter((x) => !Number.isNaN(x.t))
    .sort((a, b) => a.t - b.t);
  if (!stamped.length) return empty(name);

  // Per-week tonnage and sets come from the existing program-week grouping, so
  // the report and the chart can never disagree about the same number.
  const vol = new Map(volumeByProgramWeek(mine).map((v) => [v.weekId ?? '', v]));
  const done = completionMap(mine);

  const weeks: WeekLine[] = [];
  for (const w of program.weeks) {
    const v = vol.get(w.id);
    const logged = (w.days ?? []).filter((d) => done.has(dayCompletionKey(w.id, d.id))).length;
    // A week nobody has touched is not part of the block yet.
    if (!v && logged === 0) continue;
    weeks.push({
      id: w.id,
      name: w.name,
      done: logged,
      planned: (w.days ?? []).length,
      tonnage: v?.volume ?? 0,
      sets: v?.sets ?? 0,
      start: v?.start ?? null,
    });
  }

  const daysDone = weeks.reduce((n, w) => n + w.done, 0);
  const daysPlanned = weeks.reduce((n, w) => n + w.planned, 0);
  // Complete means every week of the PROGRAM is finished, not just the ones
  // touched so far — otherwise a single finished week would read as a finished
  // block.
  const complete =
    program.weeks.length === weeks.length && weeks.every((w) => w.planned > 0 && w.done >= w.planned);

  const firstT = stamped[0].t;
  const lastT = stamped[stamped.length - 1].t;

  // PRs across the block: each session judged against everything before it.
  const prs: PRHit[] = [];
  for (const { s } of stamped) prs.push(...detectPRs(mine, s));
  prs.sort((a, b) => b.value - b.prev - (a.value - a.prev));

  // Strength verdicts over a window wide enough to hold the whole block, with
  // the sheet's own deload weeks left out.
  //
  // This is NOT deload detection — nothing is inferred. The program names those
  // weeks itself ("Week 5 · Deload") and deliberately drops the load in them,
  // so a strength trend spanning one measures the taper rather than the block.
  // Pure Bodybuilding ends BOTH of its blocks with a deload, so without this the
  // report would show no "biggest gain" at the end of any block at all —
  // verified by seeding four weeks (a gain is found) and then five (it vanishes).
  //
  // Deloads still count everywhere else: tonnage, sets, adherence and the weekly
  // bars all include them, because that work was done and should be shown.
  const windowDays = Math.max(90, Math.ceil((now.getTime() - firstT) / DAY_MS) + 1);
  // Resolved from the PROGRAM by weekId, not from the session's stored copy of
  // the name. A session keeps whatever `weekName` it was stamped with when it
  // was logged, which can be missing, stale, or from an older revision of the
  // sheet — and then this filter would silently do nothing. The program is the
  // source of truth for what the week is called.
  const deloadIds = new Set(
    program.weeks.filter((w) => isDeloadWeek(w?.name)).map((w) => w.id),
  );
  const working = mine.filter((s) => !(s.weekId && deloadIds.has(s.weekId)));
  // Falling back to everything guards a program made entirely of deload weeks,
  // or one whose naming this cannot read.
  const returns = liftReturns(working.length >= 4 ? working : mine, program, windowDays, now);
  const bestLift =
    returns.find((r) => (r.verdict === 'strong' || r.verdict === 'working') && r.gain > 0) ?? null;
  const stalled = returns.filter((r) => r.verdict === 'flat' || r.verdict === 'declining');
  // Named only when it actually cost something — a stalled lift you did twice
  // is not a finding.
  const stalledLift = [...stalled].sort((a, b) => b.sets - a.sets).find((r) => r.sets >= 6) ?? null;

  const liftNames = new Set<string>();
  const failureNames = new Set<string>();
  let failureSets = 0;
  let ratedSets = 0;
  for (const { s } of stamped)
    for (const e of s.entries) {
      liftNames.add(e.name);
      for (const st of e.sets) {
        const rpe = parseFloat(st.rpe ?? '');
        if (!Number.isFinite(rpe) || rpe <= 0) continue;
        ratedSets++;
        // RPE 10 is failure by definition — nothing left in the tank. This
        // program asks for it on the last set of 75 of its exercises, so it is
        // the sheet's own measure of whether you actually did the work.
        if (rpe >= 10) {
          failureSets++;
          failureNames.add(e.name);
        }
      }
    }

  return {
    hasData: true,
    programName: name,
    weeks,
    complete,
    firstDate: new Date(firstT).toISOString(),
    lastDate: new Date(lastT).toISOString(),
    spanDays: Math.round((lastT - firstT) / DAY_MS) + 1,
    sessions: stamped.length,
    daysDone,
    daysPlanned,
    adherencePct: daysPlanned > 0 ? Math.round((daysDone / daysPlanned) * 100) : 0,
    tonnage: weeks.reduce((n, w) => n + w.tonnage, 0),
    sets: weeks.reduce((n, w) => n + w.sets, 0),
    lifts: liftNames.size,
    failureSets,
    failureLifts: failureNames.size,
    failureRate: ratedSets > 0 ? Math.round((failureSets / ratedSets) * 100) : 0,
    prs: prs.slice(0, 5),
    bestLift,
    stalledLift,
    wastedSets: stalled.reduce((n, r) => n + r.sets, 0),
  };
}
