// CODE RECALL — the pre-session briefing.
//
// Everything the app knows is currently delivered AFTER the fact: the volume
// card, the returns ledger, the block report. All of it is retrospective, and
// none of it is in front of you at the one moment it could change what you do —
// standing in the gym doorway about to start.
//
// Code Recall reads the lifter's own history and answers a single question:
// "given what actually happened, how should I approach THIS session?" Three
// cues at most, each one an instruction with the numbers that produced it.
//
// ---------------------------------------------------------------------------
// THE RULES IT PLAYS BY
//
// 1. Every cue is grounded in this lifter's data. No generic coaching. If the
//    evidence is not there, the cue does not appear — an app that always has
//    three tips is an app whose tips mean nothing.
// 2. Nothing is prescribed that the lifter cannot act on in the next hour.
//    "Improve your sleep" is true and useless at 6pm.
// 3. It never modifies the program. The sheet is read exactly as authored.
// 4. It does not detect deloads. The lifter plans their own.
// 5. Pure, and takes `now`, so the whole brief is testable without a clock.
//
// ---------------------------------------------------------------------------
// THE SIGNAL NOBODY WAS READING
//
// Every logged set carries a 1-5 star `rating`, and until now literally nothing
// in the app read it — it was written to storage and never looked at again.
// It is the only subjective channel separate from RPE, and that separation is
// exactly what makes it useful: RPE says how HARD a set was, the rating says how
// WELL it went. A set at the prescribed RPE that consistently gets one star is
// not a loading problem, and adding weight to it is the wrong answer.
import type {
  LoggedSet,
  ProgramDay,
  RecoveryEntry,
  WeightUnit,
  WorkoutProgram,
  WorkoutSession,
} from '../types';
import { recoveryReadiness } from '../recovery';
import { analyzeVolume, classifyExercise, isPlaceholderExercise, MUSCLE_LABEL } from '../volume';
import type { Muscle } from '../volume';
import { liftReturns } from './returns';
import { learnedLoadHint } from '../progression';
import { buildLoadModel } from './loadModel';
import { equipmentOf, loadStep } from './equipment';
import { sessionPoints, fitTrend, MIN_SESSIONS_FOR_VERDICT } from './strength';
import { noteForExercise } from './recall';

const DAY_MS = 86_400_000;

/** First number out of a loosely written sheet value: "8", "8.5", "7-8". */
const firstNumber = (v: string | undefined | null): number | null => {
  if (!v) return null;
  const n = parseFloat(String(v).replace(/[^0-9.\-–]/g, '').split(/[-–]/)[0]);
  return Number.isFinite(n) ? n : null;
};

const num = (s: string | undefined): number | null => {
  if (!s || !s.trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

export type CueKind =
  | 'readiness'
  | 'load'
  | 'rating'
  | 'volume'
  | 'order'
  | 'note'
  | 'calibration'
  | 'technique'
  | 'restart';

export interface RecallCue {
  id: string;
  kind: CueKind;
  /** The instruction. Imperative, specific, doable in the next hour. */
  headline: string;
  /** The lifter's own numbers that produced it — never a claim without one. */
  evidence: string;
  /** The principle behind it, in one line. */
  basis: string;
  /** Lower sorts first. */
  priority: number;
  /** The lift it concerns, when it concerns one. */
  exercise?: string;
}

export type SparkKind = 'gain' | 'proximity' | 'consistency' | 'first';

export interface Spark {
  kind: SparkKind;
  headline: string;
  detail: string;
}

export interface RecallBrief {
  dayName: string | null;
  /** The best few, for the card read in the doorway. */
  cues: RecallCue[];
  /**
   * Every cue that fired, sorted, uncapped and un-deduplicated.
   *
   * The three-cue card is the right shape for the ten seconds before a session.
   * It is the wrong shape once the session is under way: a cue about the fifth
   * exercise is out of context in a banner at the top, and belongs on that
   * exercise's own card at the moment you reach it. The logger reads this list to
   * find the cue for whatever it is rendering, so a lift crowded out of the
   * headline three still speaks when you are standing in front of it.
   */
  all: RecallCue[];
  spark: Spark | null;
  /** How much history stands behind this brief. `none` means the cues are the
   *  sheet's own targets rather than anything measured, and the UI should say so
   *  rather than dressing them up as analysis. */
  depth: 'none' | 'thin' | 'solid';
}

/**
 * What the lifter said about a cue.
 *
 * Every other engine in Afterburn has a backtest; this one cannot have one,
 * because nothing anywhere records whether a pre-session instruction was
 * followed or whether it helped. There is no ground truth to fit against and no
 * way to manufacture one after the fact.
 *
 * So this is the seed of it. One tap per cue, stored against the cue's stable id
 * and the day it briefed, joinable to whatever session was logged for that day.
 * It buys nothing today beyond hiding a cue you have answered — and in a few
 * months it is the only dataset that could tell us which of these nine rules
 * actually earns its place.
 */
export interface CueOutcome {
  /** The cue's stable id, e.g. `load-light-Incline DB Press`. */
  cueId: string;
  kind: CueKind;
  /** The program day it briefed — the join key to the session that followed. */
  dayId: string;
  /** When the lifter answered, ISO. */
  answeredAt: string;
  /** `did` = acted on it. `skipped` = read it and chose not to. */
  verdict: 'did' | 'skipped';
}

export interface RecallInput {
  /** The session about to be done. */
  day: ProgramDay | null | undefined;
  sessions: WorkoutSession[];
  program?: WorkoutProgram | null;
  recovery?: RecoveryEntry[];
  unit?: WeightUnit;
  /** Days of history a note stays relevant — mirrors the notes setting. */
  noteRecallDays?: number;
  now?: Date;
}

/** At most this many cues. The whole thing has to be readable in the ten
 *  seconds a person will actually give it; a list of eight is a list nobody
 *  reads, and the fourth-best tip is not worth the first three being skipped. */
export const MAX_CUES = 3;

/** A CO2 reading older than this says nothing about how recovered you are now,
 *  and quoting it would be worse than saying nothing. */
const READINESS_FRESH_HOURS = 36;

/** How far back a lift's own history is read for the load and rating cues. One
 *  block, so a lift fixed two blocks ago is not still being blamed. */
const LOOKBACK_DAYS = 90;

// ---------------------------------------------------------------------------
// Reading the day
// ---------------------------------------------------------------------------

interface DayLift {
  name: string;
  targetRpe: number | null;
  lastSetRpe: number | null;
  lastSetTechnique: string | null;
  reps: string;
}

/** The real movements in a day. Placeholder slots ("Weak Point Exercise 2
 *  (optional)") are names for a gap in the sheet, not lifts, and briefing
 *  someone about one tells them nothing they can act on. */
function liftsOf(day: ProgramDay | null | undefined): DayLift[] {
  return (day?.exercises ?? [])
    .filter((e) => e?.name && !isPlaceholderExercise(e.name))
    .map((e) => ({
      name: e.name,
      targetRpe: firstNumber(e.rpe),
      lastSetRpe: firstNumber(e.lastSetRpe),
      lastSetTechnique: e.lastSetTechnique?.trim() || null,
      reps: e.reps ?? '',
    }));
}

/** Every set of `name` that was actually performed, newest session first. */
function recentSets(
  sessions: WorkoutSession[],
  name: string,
  now: Date,
  sinceDays = LOOKBACK_DAYS,
): { date: string; t: number; sets: LoggedSet[]; roughDay: boolean }[] {
  const cutoff = now.getTime() - sinceDays * DAY_MS;
  const out: { date: string; t: number; sets: LoggedSet[]; roughDay: boolean }[] = [];
  for (const s of sessions ?? []) {
    const t = Date.parse(s?.completedAt ?? s?.date ?? '');
    if (Number.isNaN(t) || t < cutoff) continue;
    for (const e of s.entries ?? []) {
      if (e?.name !== name) continue;
      const sets = (e.sets ?? []).filter((st) => num(st?.weight) != null && num(st?.reps) != null);
      if (sets.length) out.push({ date: new Date(t).toISOString(), t, sets, roughDay: !!s.roughDay });
    }
  }
  return out.sort((a, b) => b.t - a.t);
}

// ---------------------------------------------------------------------------
// Rule 1 — readiness
// ---------------------------------------------------------------------------

/**
 * The CO2 test already produces a readiness verdict; what it has never done is
 * turn that into an instruction for the session in front of you.
 *
 * Deliberately silent on a stale reading. A score from four days ago describes
 * a Tuesday, and telling someone to cut their sets on Saturday's evidence is
 * worse than saying nothing.
 */
function readinessCue(recovery: RecoveryEntry[], now: Date): RecallCue | null {
  const r = recoveryReadiness(recovery ?? []);
  if (r.verdict === 'na' || r.latest == null || !r.latestDate) return null;

  const age = (now.getTime() - Date.parse(r.latestDate)) / 3_600_000;
  if (!Number.isFinite(age) || age < 0 || age > READINESS_FRESH_HOURS) return null;

  const base = r.baseline != null ? ` against your ${r.baseline}s baseline` : '';
  // A real minus sign, matching the set verdict chips rather than a hyphen.
  const delta =
    r.deltaPct != null ? ` (${r.deltaPct > 0 ? '+' : r.deltaPct < 0 ? '−' : ''}${Math.abs(r.deltaPct)}%)` : '';
  const evidence = `CO2 ${r.latest}s${base}${delta}, ${Math.round(age)}h ago.`;

  if (r.verdict === 'under') {
    return {
      id: 'readiness-under',
      kind: 'readiness',
      priority: 10,
      headline: 'Autoregulate today — hold your top sets a point below target and drop the last set of each accessory.',
      evidence,
      basis:
        'Under-recovery raises the fatigue cost of the same work without raising the stimulus. Trimming beats skipping: the session still counts.',
    };
  }
  if (r.verdict === 'recovered' && (r.deltaPct ?? 0) >= 5) {
    return {
      id: 'readiness-green',
      kind: 'readiness',
      priority: 12,
      headline: 'Green light — this is a day to chase the top set rather than play it safe.',
      evidence,
      basis: 'Readiness above your own baseline is the cheapest opportunity to add load there is.',
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rule 2 — the load, from the RPE actually logged
// ---------------------------------------------------------------------------

/**
 * The sheet names an RPE for a reason. When the last outing on a lift came in
 * well over or well under that number, the correction belongs BEFORE the first
 * set, not after it — by the time the logger can suggest anything, the working
 * weight has already been chosen.
 *
 * The threshold is a point and a half, the same one the in-workout hint uses:
 * less than that is inside the noise of rating your own effort.
 */
const RPE_GAP = 1.5;

function loadCue(
  lift: DayLift,
  sessions: WorkoutSession[],
  unit: WeightUnit,
  now: Date,
  note: LiftNote | null,
  permission: Permission,
): RecallCue | null {
  const target = lift.targetRpe;
  if (target == null) return null;

  // A rough day makes everything read heavy; it says nothing about the load.
  const history = recentSets(sessions, lift.name, now).filter((h) => !h.roughDay);

  /** The heaviest set of an outing that carries an RPE — the one the
   *  prescription is actually about. Back-off sets are lighter and easier by
   *  design, and judging the load on them would tell everyone to add weight
   *  after every session. */
  const topOf = (h: (typeof history)[number]) => {
    const rated = h.sets.filter((s) => num(s.rpe) != null);
    if (!rated.length) return null;
    return rated.reduce((a, b) => ((num(b.weight) ?? 0) > (num(a.weight) ?? 0) ? b : a));
  };

  const last = history.find((h) => topOf(h) != null);
  if (!last) return null;
  const top = topOf(last)!;

  const rpe = num(top.rpe)!;
  const weight = num(top.weight)!;
  const reps = num(top.reps)!;
  const gap = round1(rpe - target);

  // One session is not a pattern, and this rule used to act on exactly one —
  // while the rating rule next door demanded two sessions and four sets. An
  // unflagged bad day could therefore flip the opening weight on its own.
  //
  // The previous outing does not have to AGREE, but it must not contradict:
  // RPE 10 last time and RPE 6 the time before is not a lift that has got
  // heavier, it is one bad session. A single outing still speaks, because it is
  // the only evidence there is and it is genuinely what happened last time.
  const prior = history.slice(history.indexOf(last) + 1).find((h) => topOf(h) != null);
  const priorTop = prior ? topOf(prior)! : null;
  const priorGap = priorTop ? round1(num(priorTop.rpe)! - target) : null;
  const contradicted =
    priorGap != null && ((gap >= RPE_GAP && priorGap <= -RPE_GAP) || (gap <= -RPE_GAP && priorGap >= RPE_GAP));
  if (contradicted) return null;

  const agrees = priorGap != null && Math.sign(priorGap) === Math.sign(gap) && Math.abs(priorGap) >= RPE_GAP;
  const days = Math.max(0, Math.round((now.getTime() - last.t) / DAY_MS));
  const ago = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  const when = agrees ? `Both of your last two outings, most recently ${ago}` : `Last time, ${ago}`;
  const evidence = `${when}: ${weight}${unit} × ${reps} @ RPE ${rpe}. The sheet asks for RPE ${target}.`;

  if (gap >= RPE_GAP) {
    // A note about form going corroborates the overshoot and sharpens it: the
    // set was not merely heavy, it stopped being the movement.
    const corroboration = note?.signals.includes('form') ? ` You noted: “${note.text}”.` : '';
    return {
      id: `load-heavy-${lift.name}`,
      kind: 'load',
      priority: 20,
      exercise: lift.name,
      headline: `Open ${lift.name} lighter than last time — you were ${gap} of a point over target.`,
      evidence: `${evidence}${corroboration}`,
      basis:
        'Repeatedly overshooting the prescribed RPE buys fatigue, not stimulus, and the sets after it pay for the first one.',
    };
  }
  if (gap <= -RPE_GAP) {
    // The RPE gap says there is room. Something else may disagree: your own note
    // saying the lift hurt, or a readiness reading saying today is a day to trim.
    // Either outranks the gap, and this stays quiet rather than arguing with the
    // cue above it on the same card.
    if (!mayAddLoad(permission, note)) return null;

    // "Go up" was the vaguest instruction in the brief, and needlessly so: the
    // logger already computes the actual number from this lifter's own
    // load-per-RPE curve — but only AFTER a set is logged, by which point the
    // weight has been chosen. Same function, same rounding to what the equipment
    // can actually add, moved to before the first set.
    const step = loadStep(equipmentOf(lift.name), unit);
    const hint = learnedLoadHint(
      top.weight,
      top.rpe,
      String(target),
      lift.reps,
      top.reps,
      buildLoadModel(sessions, lift.name, now.getTime()),
      step,
    );
    const suggestion =
      hint && hint.kind === 'weight' && hint.suggested > weight
        ? ` Try ${hint.suggested}${unit}${hint.basis === 'personal' ? ` — that is your own ${round1(hint.kgPerRpe ?? 0)}${unit} per RPE point` : ''}.`
        : hint && hint.kind === 'more-reps'
          ? ` The smallest jump here is ${step}${unit}, which is ${hint.stepPct}% — push past ${hint.targetReps ?? reps} reps at ${weight}${unit} instead.`
          : '';

    return {
      id: `load-light-${lift.name}`,
      kind: 'load',
      priority: 18,
      exercise: lift.name,
      headline: suggestion
        ? `${lift.name} has room.${suggestion}`
        : `${lift.name} has room — go up. You finished ${Math.abs(gap)} of a point under target.`,
      evidence,
      basis:
        'An RPE below the prescription means reps were left in the tank the block did not intend to leave. This is the free progress.',
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rule 3 — the star ratings, which nothing has ever read
// ---------------------------------------------------------------------------

/** Enough rated sets to be a pattern rather than one bad day. */
const MIN_RATED_SETS = 4;
const MIN_RATED_SESSIONS = 2;

interface RatingRead {
  sets: number;
  sessions: number;
  meanRating: number;
  poorShare: number;
  meanRpe: number | null;
}

function readRatings(
  sessions: WorkoutSession[],
  name: string,
  now: Date,
): RatingRead | null {
  const history = recentSets(sessions, name, now);
  const ratings: number[] = [];
  const rpes: number[] = [];
  let sessionsWithRatings = 0;
  for (const h of history) {
    const rated = h.sets.filter((s) => Number.isFinite(s.rating) && s.rating > 0);
    if (!rated.length) continue;
    sessionsWithRatings++;
    for (const s of rated) {
      ratings.push(s.rating);
      const r = num(s.rpe);
      if (r != null) rpes.push(r);
    }
  }
  if (ratings.length < MIN_RATED_SETS || sessionsWithRatings < MIN_RATED_SESSIONS) return null;
  return {
    sets: ratings.length,
    sessions: sessionsWithRatings,
    meanRating: round1(mean(ratings)),
    poorShare: ratings.filter((r) => r <= 2).length / ratings.length,
    meanRpe: rpes.length ? round1(mean(rpes)) : null,
  };
}

/**
 * What the stars say that RPE cannot.
 *
 * RPE measures how hard a set was; the rating measures how well it went. The two
 * come apart in both directions, and each direction is a different instruction:
 *
 *  - **Poorly rated at the prescribed effort.** The load is right and the set
 *    still feels wrong. Adding weight is the one thing that cannot help. The
 *    honest move is to name the pattern and offer the sheet's own alternatives —
 *    the app cannot know whether it is a cue, a machine that does not fit, or a
 *    joint that hurts, and it should not pretend to.
 *  - **Well rated under the prescribed effort.** Clean and easy. That is the
 *    single clearest "add load" signal in the whole data set, and it was being
 *    thrown away.
 */
function ratingCue(
  lift: DayLift,
  sessions: WorkoutSession[],
  subs: Map<string, string[]>,
  now: Date,
  note: LiftNote | null,
  permission: Permission,
): RecallCue | null {
  const read = readRatings(sessions, lift.name, now);
  if (!read) return null;

  if (read.meanRating <= 2.5 && read.poorShare >= 0.6) {
    const alts = subs.get(lift.name) ?? [];
    const swap = alts.length ? ` The sheet offers ${alts.slice(0, 2).join(' or ')}.` : '';
    const effort =
      lift.targetRpe != null && read.meanRpe != null && read.meanRpe >= lift.targetRpe - 0.5
        ? `, at RPE ${read.meanRpe} — the effort the sheet asked for`
        : '';
    return {
      id: `rating-poor-${lift.name}`,
      kind: 'rating',
      priority: 22,
      exercise: lift.name,
      headline: `Do not add weight to ${lift.name} today — sort out how it feels first.`,
      evidence: `${Math.round(read.poorShare * 100)}% of your last ${read.sets} sets rated 2★ or worse${effort}.`,
      basis:
        `A set that is hard enough and still rates badly is an execution problem, not a loading one — set-up, position, or something that hurts.${swap}`,
    };
  }

  if (
    read.meanRating >= 4 &&
    lift.targetRpe != null &&
    read.meanRpe != null &&
    read.meanRpe <= lift.targetRpe - 1 &&
    // Same veto as the load cue: stars and RPE both say push, but a note about
    // pain, or a readiness reading under your baseline, knows something neither
    // of them can see.
    mayAddLoad(permission, note)
  ) {
    return {
      id: `rating-easy-${lift.name}`,
      kind: 'rating',
      priority: 16,
      exercise: lift.name,
      headline: `${lift.name} is the lift to push today — you rate it highly and it is not costing you anything.`,
      evidence: `Mean ${read.meanRating}★ across ${read.sets} sets at RPE ${read.meanRpe}, against a target of ${lift.targetRpe}.`,
      basis:
        'Clean and comfortably under the prescribed effort is the least ambiguous signal to add load there is, and the least likely to cost you the session.',
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rule 4 — volume, but only for the muscles this session actually trains
// ---------------------------------------------------------------------------

/**
 * The volume card already says which muscles are short and which are over. What
 * it cannot say is what to do about it *today*, because it does not know what
 * today is. Filtered to the muscles this day trains, the same numbers become an
 * instruction: take the optional set, or do not.
 *
 * Silent while the report is provisional, for the same reason the volume card
 * is: a shortfall against a weekly landmark measured over half a week is an
 * artefact of the calendar, not of training.
 */
function volumeCue(
  day: ProgramDay,
  sessions: WorkoutSession[],
  program: WorkoutProgram | null | undefined,
  now: Date,
  permission: Permission,
): RecallCue | null {
  const report = analyzeVolume(sessions, program, now);
  if (!report.hasData || report.provisional) return null;

  const trainedToday = new Set<Muscle>();
  for (const lift of liftsOf(day)) {
    const cls = classifyExercise(lift.name);
    for (const m of cls?.primary ?? []) trainedToday.add(m);
  }
  if (!trainedToday.size) return null;

  const mine = report.muscles.filter((m) => trainedToday.has(m.muscle));

  const over = mine.find((m) => m.status === 'excessive');
  if (over) {
    return {
      id: `volume-over-${over.muscle}`,
      kind: 'volume',
      priority: 30,
      headline: `Skip the optional sets on ${MUSCLE_LABEL[over.muscle].toLowerCase()} work today.`,
      evidence: `${over.label} is at ${over.sets} sets/wk against a ${over.landmark.mrv} ceiling, over ${report.windowLabel}.`,
      basis:
        'Past the recoverable ceiling, more sets add fatigue and subtract from the sessions after this one.',
    };
  }

  // Telling someone to take every optional set on a day the readiness cue has
  // just told them to trim is the contradiction this whole permission exists for.
  // The shortfall is real and it will still be there next week.
  const under = permission.addWork
    ? mine.find((m) => m.status === 'below' || m.status === 'untrained')
    : undefined;
  if (under) {
    return {
      id: `volume-under-${under.muscle}`,
      kind: 'volume',
      priority: 32,
      headline: `Take every optional set on ${MUSCLE_LABEL[under.muscle].toLowerCase()} today.`,
      evidence: `${under.label} is at ${under.sets} sets/wk against a ${under.landmark.mev} minimum, over ${report.windowLabel}.`,
      basis: 'Below the minimum effective volume the work maintains rather than builds.',
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rule 5 — where to spend the good sets
// ---------------------------------------------------------------------------

/**
 * Fatigue accumulates within a session, so the exercises done first get the best
 * of you. When one of today's lifts is measurably returning strength and another
 * has been flat for long enough to say so, that ordering is not neutral.
 *
 * Stated as where to spend effort, never as "drop this lift" — the sheet is the
 * lifter's to change, and a flat lift is often flat for a reason the app cannot
 * see.
 */
function orderCue(
  day: ProgramDay,
  sessions: WorkoutSession[],
  program: WorkoutProgram | null | undefined,
  now: Date,
): RecallCue | null {
  const names = new Set(liftsOf(day).map((l) => l.name));
  if (names.size < 2) return null;

  const returns = liftReturns(sessions, program, LOOKBACK_DAYS, now).filter((r) => names.has(r.name));
  const paying = returns.find((r) => r.verdict === 'strong' || r.verdict === 'working');
  const flat = returns.find((r) => r.verdict === 'flat' || r.verdict === 'declining');
  if (!paying || !flat || paying.name === flat.name) return null;

  const why = flat.diagnosis?.cause;
  const tail =
    why === 'effort'
      ? ` ${flat.name} has been flat, and the reason looks like effort rather than the exercise — it has been trained under its target RPE.`
      : why === 'load-static'
        ? ` ${flat.name} has been flat on a load that has not moved.`
        : ` ${flat.name} has been flat over the same window.`;

  return {
    id: `order-${paying.name}`,
    kind: 'order',
    priority: 40,
    exercise: paying.name,
    headline: `Spend your freshest sets on ${paying.name}.`,
    evidence: `It has returned ${round1(paying.perTenSets)}kg of estimated 1RM per ten sets across ${paying.sessions} sessions.${tail}`,
    basis:
      'Within a session, performance falls as fatigue accumulates — so the order of your exercises decides which one gets your best work.',
  };
}

// ---------------------------------------------------------------------------
// Rule 6 — what you told yourself last time, and what it should override
// ---------------------------------------------------------------------------

/**
 * What a note is telling the engine, beyond its words.
 *
 * A note is the only place the lifter says something the numbers cannot. "Left
 * knee felt off" and "seat notch 4, not 5" sit in the same field as the load and
 * the RPE, and until now the app only ever handed them back verbatim — which
 * misses the point that some of them should CHANGE the advice.
 *
 * The clearest case: a lift logged at RPE 6 with a note saying the shoulder
 * pinched. The RPE gap alone says "add weight". That is the one instruction that
 * cannot be right, and it is exactly what an engine reading only numbers would
 * produce.
 *
 * This is keyword matching, with the same weakness as the exercise classifier in
 * `volume.ts`: it reads the words people usually use, and a note phrased another
 * way is invisible to it. It is deliberately biased towards missing a signal
 * rather than inventing one — except for pain, where the costs are not
 * symmetric. A false positive there costs one skipped load increase; a false
 * negative tells someone with a sore shoulder to add weight.
 */
export type NoteSignal = 'pain' | 'failure' | 'form' | 'setup' | 'positive';

/** "no pain", "didn't hurt", "pain free" — a clean report, not an injury. Run
 *  before the pain test, or the best possible note becomes the worst.
 *
 *  Two shapes, because the negation can sit on either side of the word: "zero
 *  knee pain" puts it first, "shoulder pain free at last" puts it after. */
const NO_PAIN = [
  /\b(no|not|never|without|zero|free of|didn'?t|doesn'?t|wasn'?t|isn'?t)\b[^.!?]{0,24}\b(pain(ful)?|hurts?|hurting|ache|aching|twinge|pinch(ed|ing)?|niggle)\b/i,
  /\b(pain|hurt|ache|twinge|pinch|niggle)s?[\s-]?free\b/i,
];

const SIGNALS: { signal: NoteSignal; re: RegExp }[] = [
  {
    signal: 'pain',
    // Deliberately excludes "sore", "sorness", "tight" and "stiff": ordinary
    // training language that would veto a load increase almost every session.
    re: /\b(pain|painful|hurts?|hurting|hurt|tweak(ed|ing|y)?|twinge|pinch(ed|ing)?|ach(e|es|ing|y)|strain(ed)?|niggle|flare[- ]?up|impinge(d|ment)?|inflam(ed|mation))\b/i,
  },
  {
    signal: 'failure',
    re: /\b(fail(ed|ure|ing)?|missed?|no[- ]rep|couldn'?t (get|finish|complete|lock|hold)|had to (rack|stop|drop)|rack(ed)? it|bailed)\b/i,
  },
  {
    signal: 'form',
    re: /\b(form (broke|broken|went|off|bad|poor)|lost (tightness|position|bracing|control)|cheat(ed|ing)?|swung|swinging|body english|momentum|sloppy|ugly|grind(ed|y|er)?)\b/i,
  },
  {
    signal: 'setup',
    re: /\b(seat|notch|pin|hole|setting|handle|attachment|grip width|foot ?plate|footplate|pad|angle|bench angle|machine|other (bar|machine)|different (bar|machine|grip))\b/i,
  },
  {
    signal: 'positive',
    re: /\b(felt (great|good|strong|easy|smooth|solid)|easy|smooth|clean|dialled|dialed|snappy|effortless|flew up)\b/i,
  },
];

/** Every signal a note carries. Order is the table's, so `signals[0]` is the
 *  most consequential one present. */
export function readNoteSignals(text: string | null | undefined): NoteSignal[] {
  const t = (text ?? '').trim();
  if (!t) return [];
  const clean = NO_PAIN.some((re) => re.test(t));
  const out: NoteSignal[] = [];
  for (const { signal, re } of SIGNALS) {
    if (signal === 'pain' && clean) continue;
    if (re.test(t)) out.push(signal);
  }
  return out;
}

interface LiftNote {
  text: string;
  daysAgo: number;
  signals: NoteSignal[];
}

function noteFor(
  sessions: WorkoutSession[],
  name: string,
  windowDays: number,
  now: Date,
): LiftNote | null {
  const n = noteForExercise(sessions, name, windowDays, now);
  if (!n) return null;
  return { text: n.text.trim(), daysAgo: n.daysAgo, signals: readNoteSignals(n.text) };
}

/** A note that must stop the engine recommending more weight on that lift. */
const noteBlocksLoading = (n: LiftNote | null): boolean =>
  !!n && (n.signals.includes('pain') || n.signals.includes('failure'));

/**
 * Whether the brief is allowed to ask for MORE today — more weight, more sets.
 *
 * The bug this fixes was visible on one screen: "hold your top sets a point
 * below target and drop the last set of each accessory", then "Incline DB Press
 * has room — go up", then "take every optional set on chest". Three cues, all
 * true in isolation, and the reader is left with no instruction at all.
 *
 * A veto existed for notes and was never extended to readiness, which is the
 * other input that can overrule a number. So both live here now, and every rule
 * that would add work asks first. Cues that REDUCE work are always allowed
 * through: they agree with autoregulating rather than fighting it.
 */
interface Permission {
  /** False when recovery is down — trimming and adding cannot both be today's plan. */
  addWork: boolean;
}

const mayAddLoad = (p: Permission, note: LiftNote | null): boolean =>
  p.addWork && !noteBlocksLoading(note);

function noteCue(
  day: ProgramDay,
  sessions: WorkoutSession[],
  windowDays: number,
  now: Date,
): RecallCue | null {
  // The most consequential note in the day wins the slot, not the first one.
  const found: { lift: DayLift; note: LiftNote }[] = [];
  for (const lift of liftsOf(day)) {
    const note = noteFor(sessions, lift.name, windowDays, now);
    if (note) found.push({ lift, note });
  }
  if (!found.length) return null;

  const rank = (n: LiftNote) =>
    n.signals.includes('pain') ? 0 : n.signals.includes('failure') ? 1 : n.signals.includes('form') ? 2 : 3;
  found.sort((a, b) => rank(a.note) - rank(b.note) || a.note.daysAgo - b.note.daysAgo);
  const { lift, note } = found[0];

  const quote = `“${note.text}”${note.daysAgo === 0 ? ', today' : note.daysAgo === 1 ? ', yesterday' : `, ${note.daysAgo} days ago`}.`;
  const base = {
    id: `note-${lift.name}`,
    kind: 'note' as const,
    exercise: lift.name,
    evidence: quote,
  };

  if (note.signals.includes('pain')) {
    return {
      ...base,
      priority: 14,
      headline: `Leave the weight where it is on ${lift.name} — you logged pain on it last time.`,
      basis:
        'Everything else this engine measures says to add load when the effort comes in under target. Your own note outranks all of it: a lift that hurt is not a lift to push, and no RPE gap changes that.',
    };
  }
  if (note.signals.includes('failure')) {
    return {
      ...base,
      priority: 19,
      headline: `Repeat last time's weight on ${lift.name} before you add to it.`,
      basis:
        'You noted a set you did not complete. The prescribed work has not actually been done at that load yet, so it is the load to beat, not the one to build on.',
    };
  }
  if (note.signals.includes('form')) {
    return {
      ...base,
      priority: 24,
      headline: `Judge ${lift.name} on the sets that looked like sets today.`,
      basis:
        'You noted the form going. A rep that turned into a grind is not the same rep, so the RPE and the estimated 1RM behind it both read better than the set deserved.',
    };
  }
  if (note.signals.includes('setup')) {
    return {
      ...base,
      priority: 34,
      headline: `Match your set-up on ${lift.name} before you compare any numbers.`,
      basis:
        'You noted the configuration. A seat notch or a different handle changes the leverage, and a load that moves because the machine changed is not strength that moved.',
    };
  }
  return {
    ...base,
    priority: 50,
    headline: `Read your own note on ${lift.name} before the first set.`,
    basis: 'You wrote this the last time you did the lift, which is the only moment it was ever going to matter.',
  };
}

// ---------------------------------------------------------------------------
// Rule 7 — an RPE that never moves cannot steer anything
// ---------------------------------------------------------------------------

const MIN_RPE_SAMPLE = 12;
/** Below this spread, the number is a habit rather than a reading. */
const FLAT_RPE_SD = 0.35;

function calibrationCue(sessions: WorkoutSession[], now: Date): RecallCue | null {
  const cutoff = now.getTime() - 45 * DAY_MS;
  const rpes: number[] = [];
  for (const s of sessions ?? []) {
    const t = Date.parse(s?.completedAt ?? s?.date ?? '');
    if (Number.isNaN(t) || t < cutoff) continue;
    for (const e of s.entries ?? [])
      for (const st of e?.sets ?? []) {
        const r = num(st?.rpe);
        if (r != null && r > 0) rpes.push(r);
      }
  }
  if (rpes.length < MIN_RPE_SAMPLE) return null;

  const m = mean(rpes);
  const sd = Math.sqrt(mean(rpes.map((r) => (r - m) ** 2)));
  if (sd > FLAT_RPE_SD) return null;

  return {
    id: 'calibration-flat-rpe',
    kind: 'calibration',
    priority: 60,
    headline: 'Try to separate a hard set from a very hard one when you rate them today.',
    evidence: `Your last ${rpes.length} sets were rated RPE ${round1(m)} almost without variation.`,
    basis:
      'Every load suggestion in here is driven by the gap between the RPE you log and the one the sheet asks for. An RPE that never moves cannot open that gap, so the app has nothing to work with.',
  };
}

// ---------------------------------------------------------------------------
// Rule 8 — the session you cut short
// ---------------------------------------------------------------------------

function restartCue(day: ProgramDay, sessions: WorkoutSession[], now: Date): RecallCue | null {
  const cutoff = now.getTime() - LOOKBACK_DAYS * DAY_MS;
  const prior = (sessions ?? [])
    .filter((s) => s?.dayId === day.id)
    .map((s) => ({ s, t: Date.parse(s.completedAt ?? s.date) }))
    .filter((x) => !Number.isNaN(x.t) && x.t >= cutoff)
    .sort((a, b) => b.t - a.t)[0];
  if (!prior || (!prior.s.endedEarly && !prior.s.roughDay)) return null;

  const done = (prior.s.entries ?? []).filter((e) =>
    (e.sets ?? []).some((st) => num(st.weight) != null && num(st.reps) != null),
  ).length;
  const planned = liftsOf(day).length;
  const why = prior.s.endNote?.trim();

  return {
    id: 'restart-after-short-session',
    kind: 'restart',
    priority: 26,
    headline: `Rebuild this day from what you finished last time, not from what was planned.`,
    evidence: prior.s.endedEarly
      ? `You ended this day early, getting through ${done} of ${planned} lifts.${why ? ` You noted: “${why}”` : ''}`
      : `You marked this day a rough one, getting through ${done} of ${planned} lifts.`,
    basis:
      'The loads on an unfinished day were never actually completed, so treating them as your current baseline sets you up to miss twice.',
  };
}

// ---------------------------------------------------------------------------
// Rule 9 — the sheet's own instruction, when there is no history to read
// ---------------------------------------------------------------------------

/**
 * A first session has nothing to analyse, and inventing analysis for it is
 * exactly the "blindly recommending" this engine exists to avoid. What it can do
 * is read the sheet out loud — the technique the block prescribes for the last
 * set is genuinely easy to forget, and it is the lifter's own program, not the
 * app's opinion.
 */
function techniqueCue(day: ProgramDay): RecallCue | null {
  const withTechnique = liftsOf(day).filter((l) => l.lastSetTechnique);
  if (!withTechnique.length) return null;
  const l = withTechnique[0];
  const more = withTechnique.length - 1;
  return {
    id: `technique-${l.name}`,
    kind: 'technique',
    priority: 70,
    exercise: l.name,
    headline: `Last set of ${l.name} is ${l.lastSetTechnique}${more > 0 ? ` — and ${more} more lift${more === 1 ? '' : 's'} today carry a technique too` : ''}.`,
    evidence: `From your program${l.lastSetRpe != null ? `, which asks for RPE ${l.lastSetRpe} on that set` : ''}.`,
    basis: 'Prescribed intensity techniques are the easiest part of a sheet to forget once the set starts.',
  };
}

// ---------------------------------------------------------------------------
// The motivational half — measured, or absent
// ---------------------------------------------------------------------------

/** Two and a half kilos of estimated 1RM is the smallest change worth calling a
 *  gain anywhere else in this app; the same bar applies here so the brief cannot
 *  celebrate noise. */
const MIN_SPARK_GAIN = 2.5;

/**
 * The motivational line, and why it is built this way.
 *
 * Amabile and Kramer's diary study (~12,000 daily entries, 238 people) found
 * that of every event that lifts motivation, the largest single one is evidence
 * of concrete progress in meaningful work — ahead of recognition, incentives or
 * encouragement. Bandura's account of self-efficacy puts mastery experience —
 * your own past performance — above every other source.
 *
 * Both point the same way: a specific number the lifter earned beats any
 * sentence the app could compose. So this returns nothing at all rather than a
 * platitude when there is nothing true to say. "Let's go, champ" is not
 * motivation, it is furniture.
 */
function buildSpark(
  day: ProgramDay | null | undefined,
  sessions: WorkoutSession[],
  program: WorkoutProgram | null | undefined,
  unit: WeightUnit,
  now: Date,
): Spark | null {
  const lifts = liftsOf(day);

  // 1. A measured gain on something you are about to do. The strongest version:
  //    it is specific, it is yours, and it is about to be tested again.
  //
  //    It has to clear the SAME bar as the returns ledger, and originally it did
  //    not: this read the first session against the last on `bestE1RM`, which is
  //    two endpoints of a noisy series and the least robust estimator available.
  //    Measured on a lifter whose loads went 24, 32, 33, 32, 33, 32, 33, 32 —
  //    one bad first session and then flat — `fitTrend` reports a gain of
  //    **0.00 kg**, and this line announced "you are 10.1 kg stronger". A
  //    motivational message congratulating someone for a gain they did not make
  //    is worse than the platitude it was meant to replace. So the fit and its
  //    significance test decide, exactly as they do everywhere else in here.
  let best: { name: string; gain: number; weeks: number } | null = null;
  for (const l of lifts) {
    const pts = sessionPoints(sessions ?? [], l.name);
    if (pts.length < MIN_SESSIONS_FOR_VERDICT) continue;
    const trend = fitTrend(pts);
    if (!trend?.real || trend.gain < MIN_SPARK_GAIN) continue;
    const weeks = Math.round(trend.spanDays / 7);
    if (weeks < 2) continue;
    if (!best || trend.gain > best.gain) best = { name: l.name, gain: trend.gain, weeks };
  }
  if (best) {
    return {
      kind: 'gain',
      headline: `You are ${Math.round(best.gain * 10) / 10}${unit} stronger on ${best.name} than when you started it.`,
      detail: `Estimated 1RM from a fitted trend, over ${best.weeks} weeks — not a lucky session against an unlucky one. You are about to train it again.`,
    };
  }

  // 2. How close the week is to done. Kivetz et al. (948 coffee cards) measured
  //    effort accelerating as a goal comes into view; knowing the finish line is
  //    near is itself the push.
  const week = program?.weeks?.find((w) => w?.days?.some((d) => d?.id === day?.id));
  if (week?.days?.length) {
    const doneIds = new Set(
      (sessions ?? [])
        .filter((s) => s?.weekId === week.id && s?.completedAt)
        .map((s) => s.dayId),
    );
    const left = week.days.filter((d) => !doneIds.has(d.id)).length;
    if (left > 0 && left <= 2 && doneIds.size > 0) {
      return {
        kind: 'proximity',
        headline: left === 1 ? `Last session of ${week.name}.` : `Two sessions left in ${week.name}.`,
        detail: `${doneIds.size} of ${week.days.length} done. Finish the week before you move on — the volume is counted per program week.`,
      };
    }
  }

  // 3. Turning up. Not a streak — a streak punishes one missed day and this one
  //    does not — just the count of sessions actually completed lately.
  const cutoff = now.getTime() - 28 * DAY_MS;
  const recent = (sessions ?? []).filter((s) => {
    const t = Date.parse(s?.completedAt ?? '');
    return !Number.isNaN(t) && t >= cutoff;
  }).length;
  if (recent >= 4) {
    return {
      kind: 'consistency',
      headline: `${recent} sessions in the last four weeks.`,
      detail: 'Every one of them is in the numbers this brief was built from.',
    };
  }

  // 4. Nothing measured yet. An implementation intention rather than a cheer:
  //    Gollwitzer and Sheeran's meta-analysis over 94 tests and ~8,000
  //    participants puts the effect of naming when and where at d = 0.65.
  if (day) {
    return {
      kind: 'first',
      headline: `Log the RPE on every set today.`,
      detail:
        'That one number is what turns the next brief from the sheet’s targets into your own. Nothing here is invented — it is all read back from what you record.',
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// The brief
// ---------------------------------------------------------------------------

/**
 * The history, cleaned once, before any rule — or any other engine — sees it.
 *
 * This runs on whatever localStorage or a restored backup hands back, which is
 * not always a WorkoutSession: fuzzing the rest of the app has already turned up
 * missing `entries`, missing `sets` and unparseable dates, and every engine
 * downstream of here (`analyzeVolume`, `liftReturns`, `sessionPoints`) indexes
 * into those without asking. Cleaning at the door is one guard instead of thirty,
 * and it is the only place that knows the whole set.
 *
 * Future-dated sessions are dropped for a different reason. A clock skew or a
 * hand-edited backup should not be able to brief you on a workout you have not
 * done — note recall already refuses this, and the two must not disagree.
 */
function usableHistory(sessions: WorkoutSession[] | null | undefined, now: Date): WorkoutSession[] {
  const t0 = now.getTime();
  const out: WorkoutSession[] = [];
  for (const s of sessions ?? []) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.entries)) continue;
    const t = Date.parse(s.completedAt ?? s.date ?? '');
    if (Number.isNaN(t) || t > t0) continue;
    out.push({
      ...s,
      entries: s.entries.filter((e) => e?.name && Array.isArray(e.sets)),
    });
  }
  return out;
}

/** Sessions with at least one usable set — the honest denominator for "do we
 *  know anything about this lifter". */
function usableSessions(sessions: WorkoutSession[]): number {
  let n = 0;
  for (const s of sessions ?? []) {
    const any = (s.entries ?? []).some((e) =>
      (e?.sets ?? []).some((st) => num(st?.weight) != null && num(st?.reps) != null),
    );
    if (any) n++;
  }
  return n;
}

/**
 * The whole brief for one session.
 *
 * Rules are collected, sorted by priority, de-duplicated so a single lift cannot
 * take every slot, and capped. Order matters more than it looks: the cues that
 * change what weight goes on the bar come before the ones that change how you
 * feel about it.
 */
export function codeRecall(input: RecallInput): RecallBrief {
  const {
    day,
    sessions: raw = [],
    program = null,
    recovery = [],
    unit = 'kg',
    noteRecallDays = 7,
    now = new Date(),
  } = input;

  const sessions = usableHistory(raw, now);
  const logged = usableSessions(sessions);
  const depth: RecallBrief['depth'] = logged === 0 ? 'none' : logged < 4 ? 'thin' : 'solid';

  if (!day) {
    return { dayName: null, cues: [], all: [], spark: null, depth };
  }

  const subs = new Map<string, string[]>();
  for (const w of program?.weeks ?? [])
    for (const d of w?.days ?? [])
      for (const e of d?.exercises ?? [])
        if (e?.name && e.substitutions?.length && !subs.has(e.name)) subs.set(e.name, e.substitutions);

  // Readiness is read once and used twice: as a cue in its own right, and as the
  // permission the add-work rules have to ask for.
  const readiness = readinessCue(recovery, now);
  const permission: Permission = { addWork: readiness?.id !== 'readiness-under' };

  const candidates: (RecallCue | null)[] = [
    readiness,
    restartCue(day, sessions, now),
    volumeCue(day, sessions, program, now, permission),
    orderCue(day, sessions, program, now),
    noteCue(day, sessions, noteRecallDays, now),
    calibrationCue(sessions, now),
    techniqueCue(day),
  ];

  // Per-lift rules, one pass over the day. The note is read first and handed to
  // the others, because it is the only input that can overrule them: a lift you
  // wrote "shoulder pinched" on is not a lift to add weight to, whatever the RPE
  // gap and the star ratings both say.
  for (const lift of liftsOf(day)) {
    const note = noteFor(sessions, lift.name, noteRecallDays, now);
    candidates.push(loadCue(lift, sessions, unit, now, note, permission));
    candidates.push(ratingCue(lift, sessions, subs, now, note, permission));
  }

  const sorted = candidates
    .filter((c): c is RecallCue => c != null)
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));

  // One cue per lift, and never two of the same kind. Three tips about the same
  // exercise is not a brief, it is a lecture — and the second-best thing to say
  // about a different lift is worth more than the second-best thing to say about
  // this one.
  const cues: RecallCue[] = [];
  const usedLifts = new Set<string>();
  const usedKinds = new Set<CueKind>();
  for (const c of sorted) {
    if (cues.length >= MAX_CUES) break;
    if (c.exercise && usedLifts.has(c.exercise)) continue;
    if (usedKinds.has(c.kind)) continue;
    cues.push(c);
    usedKinds.add(c.kind);
    if (c.exercise) usedLifts.add(c.exercise);
  }

  return {
    dayName: day.name ?? null,
    cues,
    all: sorted,
    spark: buildSpark(day, sessions, program, unit, now),
    depth,
  };
}
