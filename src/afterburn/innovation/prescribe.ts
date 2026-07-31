// THE PRESCRIPTION — what to put on the bar, before you put it there.
//
// Everything else in Afterburn is a critic. It reads what you lifted and tells
// you what it thought: the set verdict, the volume status, the returns ledger,
// the pre-session brief. All of it retrospective, and all of it leaving the one
// decision that actually happens 17 times a session — what weight, for how many
// reps — entirely to you.
//
// The load model has been sitting here the whole time able to answer that
// question. It has only ever been asked "was that right?", never "what should I
// do?". Same curve, opposite direction.
//
// ---------------------------------------------------------------------------
// WHAT THIS IS NOT
//
// It is not the program. `plan.ts` is read exactly as authored: the rep target
// and the target RPE come from the sheet, and nothing here changes them. This
// only fills in the number the sheet deliberately leaves blank — the weight,
// which depends on the lifter and not on the block.
//
// It is a SUGGESTION, pre-filled and overridable, never applied on your behalf.
// And it says where each number came from, because a number whose provenance you
// cannot see is a number you cannot argue with.
//
// ---------------------------------------------------------------------------
// THE PART NOTHING HAS EVER READ
//
// Set 3 is not set 1. Everyone knows this and no engine here has ever measured
// it: how much a given lifter fades across the sets of a given exercise is
// personal, visible in their own log, and completely invisible to them. A
// prescription that gives the same weight for all three sets is wrong twice, and
// wrong in the direction that makes you miss the rep target.
import type { LoggedSet, WorkoutSession } from '../types';
import { buildLoadModel } from './loadModel';
import type { LoadModel } from './loadModel';
import { equipmentOf, loadStep } from './equipment';

const DAY_MS = 86_400_000;

const num = (s: string | undefined | null): number | null => {
  if (s == null || !String(s).trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** First number out of a loosely written sheet value: "8", "8-10", "~9-10". */
export const firstNumber = (v: string | undefined | null): number | null => {
  if (!v) return null;
  const n = parseFloat(String(v).replace(/[^0-9.\-–]/g, '').split(/[-–]/)[0]);
  return Number.isFinite(n) ? n : null;
};

/** Last number of a range: "8-10" → 10. The top of a rep range is the target
 *  worth aiming at, since double progression says you add load only after
 *  clearing it. */
const lastNumber = (v: string | undefined | null): number | null => {
  if (!v) return null;
  const parts = String(v).replace(/[^0-9.\-–]/g, '').split(/[-–]/).filter(Boolean);
  const n = parseFloat(parts[parts.length - 1] ?? '');
  return Number.isFinite(n) ? n : null;
};

/** Round to what the equipment can make — never to nothing.
 *
 *  Found by a test: a 0.5 kg accessory rounded to the 2.5 kg step gives **zero**,
 *  and the app would have prescribed an empty bar. The lightest makeable load is
 *  the step itself, so that is the floor. */
const round = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);
const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ---------------------------------------------------------------------------
// Within-exercise drop-off
// ---------------------------------------------------------------------------

export interface DropOff {
  /** Multiplier for each set position relative to set 1. `[1, 0.96, 0.92]`
   *  means set 3 is typically 8% lighter than set 1 at the same rep target. */
  factors: number[];
  /** Outings that informed it. */
  samples: number;
  /** True when there was not enough to measure and a flat profile is assumed. */
  assumed: boolean;
}

/** No history: assume no fade rather than invent one. Being wrong flat is a
 *  smaller error than being wrong in a direction. */
const FLAT: DropOff = { factors: [1], samples: 0, assumed: true };

/** Fewer than this and one bad outing sets the whole profile. */
const MIN_DROPOFF_OUTINGS = 3;
/** A fade beyond this is not fatigue, it is a different exercise or a typo. */
const MAX_FADE = 0.35;

/**
 * How this lifter fades across the sets of one exercise.
 *
 * Measured on **estimated effort-adjusted load**, not raw weight: dropping from
 * 8 reps to 6 at the same weight is a fade too, and a profile built on weight
 * alone would call it flat. Each outing contributes the ratio of set N's work to
 * set 1's, and the median across outings is the profile — median so one session
 * where you were interrupted mid-exercise cannot define it.
 */
export function dropOff(
  sessions: WorkoutSession[],
  exerciseName: string,
  now: Date = new Date(),
  sinceDays = 90,
): DropOff {
  if (!exerciseName) return FLAT;
  const cutoff = now.getTime() - sinceDays * DAY_MS;

  /** Per set position, the ratios seen across outings. */
  const byPosition = new Map<number, number[]>();
  let outings = 0;

  for (const s of sessions ?? []) {
    if (s?.roughDay) continue;
    const t = Date.parse(s?.completedAt ?? s?.date ?? '');
    if (Number.isNaN(t) || t < cutoff || t > now.getTime()) continue;

    for (const e of s.entries ?? []) {
      if (e?.name !== exerciseName) continue;
      const work = (e.sets ?? []).map((st: LoggedSet) => {
        const w = num(st?.weight);
        const r = num(st?.reps);
        return w != null && r != null && w > 0 && r > 0 ? w * (1 + r / 30) : null;
      });
      const first = work[0];
      if (first == null || first <= 0) continue;
      // Only positions actually performed contribute; a session cut to one set
      // says nothing about set 3.
      let counted = false;
      for (let i = 1; i < work.length; i++) {
        const v = work[i];
        if (v == null || v <= 0) continue;
        const ratio = v / first;
        // Guard against a swapped exercise or a fat-fingered weight producing a
        // profile that would prescribe nonsense.
        if (ratio > 1.25 || ratio < 1 - MAX_FADE) continue;
        const arr = byPosition.get(i) ?? [];
        arr.push(ratio);
        byPosition.set(i, arr);
        counted = true;
      }
      if (counted) outings++;
    }
  }

  if (outings < MIN_DROPOFF_OUTINGS) return FLAT;

  const factors = [1];
  for (let i = 1; ; i++) {
    const arr = byPosition.get(i);
    if (!arr || arr.length < MIN_DROPOFF_OUTINGS) break;
    // Never allow a later set to be prescribed heavier than an earlier one: the
    // profile describes fatigue, and a rising one is noise.
    factors.push(Math.min(median(arr), factors[i - 1]));
  }
  return { factors, samples: outings, assumed: false };
}

// ---------------------------------------------------------------------------
// The prescription
// ---------------------------------------------------------------------------

/** Where a number came from. The UI shows this, because a prescription you
 *  cannot interrogate is one you should not follow. */
export type PrescriptionBasis =
  | 'personal' // this lifter's own load-per-RPE curve
  | 'rule' // last outing, adjusted by the population 3%-per-RPE-point rule
  | 'repeat' // last outing, repeated: the rep target was not met at that load
  | 'sheet' // no history at all; only the sheet's targets are known
  | 'none'; // nothing can be said

export interface SetPrescription {
  /** 0-based position in the exercise. */
  index: number;
  /** Suggested working weight, already rounded to what the equipment can make.
   *  Null when only reps can be prescribed. */
  weight: number | null;
  /** Reps to aim for, from the sheet. */
  reps: number | null;
  /** The RPE the sheet asks for on this set (the last set often differs). */
  rpe: number | null;
}

export interface LiftPrescription {
  exercise: string;
  sets: SetPrescription[];
  basis: PrescriptionBasis;
  /** One line the lifter can argue with. */
  why: string;
  /** True when the model exists but is not yet trusted. */
  tentative: boolean;
  /** The fade profile used, for the UI to explain set 2 and 3. */
  drop: DropOff;
}

export interface PrescribeInput {
  exercise: string;
  /** Working set count from the sheet. */
  workingSets: number;
  /** Rep target as written, e.g. "8-10". */
  reps?: string;
  /** Target RPE for the early sets, as written. */
  rpe?: string;
  /** Target RPE for the last set, when the sheet splits them. */
  lastSetRpe?: string;
  sessions: WorkoutSession[];
  unit?: 'kg' | 'lb';
  now?: Date;
  /** Injected in tests; built from `sessions` otherwise. */
  model?: LoadModel;
}

/** The most recent outing that actually has usable sets, ignoring rough days. */
function lastOuting(
  sessions: WorkoutSession[],
  name: string,
  now: Date,
): { t: number; sets: LoggedSet[] } | null {
  let best: { t: number; sets: LoggedSet[] } | null = null;
  for (const s of sessions ?? []) {
    if (s?.roughDay) continue;
    const t = Date.parse(s?.completedAt ?? s?.date ?? '');
    if (Number.isNaN(t) || t > now.getTime()) continue;
    for (const e of s.entries ?? []) {
      if (e?.name !== name) continue;
      const sets = (e.sets ?? []).filter((st) => num(st?.weight) != null && num(st?.reps) != null);
      if (sets.length && (!best || t > best.t)) best = { t, sets };
    }
  }
  return best;
}

/**
 * What to lift today, set by set.
 *
 * The ladder, strongest first. Each rung is honest about being a rung — the UI
 * shows the basis, so "your own curve" and "a population rule of thumb" are
 * never presented as the same claim:
 *
 *  1. **personal** — the lifter's own load-per-RPE curve, when it is confident.
 *  2. **repeat** — the rep target was missed at that load last time, so the load
 *     is not the thing to change. Repeat it and clear the reps first. This
 *     outranks the curve deliberately: double progression is the sheet's own
 *     rule and the curve does not know the reps were missed.
 *  3. **rule** — last outing adjusted by 3% per RPE point off target. A
 *     population average, stated as one.
 *  4. **sheet** — nothing lifted yet, so only reps and RPE can be given.
 *
 * The fade profile then shapes sets 2..n. Note the last set takes the sheet's
 * `lastSetRpe` when it has one, which on this program is usually higher — so the
 * prescribed weight does not simply fall away.
 */
export function prescribe(input: PrescribeInput): LiftPrescription {
  const {
    exercise,
    workingSets,
    reps,
    rpe,
    lastSetRpe,
    sessions = [],
    unit = 'kg',
    now = new Date(),
  } = input;

  const n = Math.max(1, Math.floor(workingSets || 1));
  const step = loadStep(equipmentOf(exercise), unit);
  const drop = dropOff(sessions, exercise, now);
  const targetReps = lastNumber(reps);
  const earlyRpe = firstNumber(rpe);
  const finalRpe = firstNumber(lastSetRpe) ?? earlyRpe;

  const rpeFor = (i: number) => (i === n - 1 ? finalRpe : earlyRpe);
  const shell = (weight: number | null, basis: PrescriptionBasis, why: string, tentative = false): LiftPrescription => ({
    exercise,
    basis,
    why,
    tentative,
    drop,
    sets: Array.from({ length: n }, (_, i) => ({
      index: i,
      weight:
        weight == null
          ? null
          : // The fade applies to the sets after the first. Beyond the measured
            // profile the last known factor carries, rather than extrapolating a
            // trend off the end of the data.
            round(weight * (drop.factors[Math.min(i, drop.factors.length - 1)] ?? 1), step),
      reps: targetReps,
      rpe: rpeFor(i),
    })),
  });

  const last = lastOuting(sessions, exercise, now);

  // 4. Nothing lifted yet.
  if (!last) {
    return shell(
      null,
      targetReps == null && earlyRpe == null ? 'none' : 'sheet',
      targetReps != null
        ? `First time on this lift here — pick a weight you could stop ${Math.max(1, 10 - (earlyRpe ?? 8))} reps short of, and the app takes it from there.`
        : 'Nothing logged on this lift yet.',
    );
  }

  const top = last.sets.reduce((a, b) => ((num(b.weight) ?? 0) > (num(a.weight) ?? 0) ? b : a));
  const lastWeight = num(top.weight)!;
  const lastReps = num(top.reps)!;
  const lastRpe = num(top.rpe);

  // 2. Reps missed at that load — the load is not the thing to change.
  if (targetReps != null && lastReps < targetReps) {
    return shell(
      lastWeight,
      'repeat',
      `You got ${lastReps} of ${targetReps} at ${lastWeight}${unit} last time. Same weight — clear the reps before it goes up.`,
    );
  }

  // 1. The lifter's own curve.
  const model = input.model ?? buildLoadModel(sessions, exercise, now.getTime());
  if (model.confidence !== 'none' && targetReps != null && earlyRpe != null) {
    const predicted = model.predict(targetReps, earlyRpe);
    if (predicted != null && predicted > 0) {
      const w = round(predicted, step);
      const delta = Math.round((w - lastWeight) * 10) / 10;
      const move = delta > 0 ? `up ${delta}${unit}` : delta < 0 ? `down ${Math.abs(delta)}${unit}` : 'the same';
      return shell(
        w,
        'personal',
        `From your own ${model.samples} sets on this lift: ${w}${unit} should land near RPE ${earlyRpe} at ${targetReps} reps — ${move} on last time.`,
        model.confidence === 'low',
      );
    }
  }

  // 3. The population rule.
  if (lastRpe != null && earlyRpe != null) {
    const gap = earlyRpe - lastRpe;
    const w = round(lastWeight * (1 + gap * 0.03), step);
    return shell(
      w,
      'rule',
      Math.abs(gap) < 0.5
        ? `Last time was on target at ${lastWeight}${unit}. Repeating it until there is enough history to model this lift.`
        : `Last time came in at RPE ${lastRpe} against a target of ${earlyRpe}. A rough 3% per point puts today at ${w}${unit}.`,
    );
  }

  return shell(lastWeight, 'rule', `Repeating last time's ${lastWeight}${unit} — no RPE was logged to adjust from.`);
}
