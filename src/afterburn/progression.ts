// Did this set beat the last one?
//
// The workout screen already shows what you lifted last time, as one summary
// line for the whole exercise. That answers "what were the numbers" but not the
// question you are actually asking mid-set, which is "am I ahead of last time
// on THIS set" — and it makes you parse a comma-separated list while a rest
// timer runs.
//
// These helpers compare set-for-set by position, so set 3 is judged against
// set 3, and turn the comparison into one short verdict.
import type { LoggedSet } from './types';

const num = (s: string | undefined): number | null => {
  if (!s || !s.trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export type ProgressKind = 'up' | 'same' | 'down' | 'none';

export interface SetVerdict {
  kind: ProgressKind;
  /** Short label for the chip, e.g. "+2.5 kg", "+1 rep", "matched". */
  label: string;
}

/**
 * Compare one logged set against the same position last time.
 *
 * Load leads: on a hypertrophy or strength block, more weight at equal-or-more
 * reps is unambiguously ahead, so weight is checked first and reps only settle
 * a tie. Fewer reps at heavier load is deliberately NOT called progress — that
 * trade is a judgement call the lifter should make, not one the app should
 * quietly award a green chip to.
 *
 * Effort breaks the remaining tie. Identical weight and reps at a lower RPE is
 * real progress — the earliest kind there is, and it always arrives before you
 * can add load. Calling that "matched" hides the exact moment a lifter becomes
 * ready to move up.
 */
export function setVerdict(
  current: LoggedSet | undefined,
  last: LoggedSet | undefined,
  unit = 'kg',
): SetVerdict {
  const cw = num(current?.weight);
  const cr = num(current?.reps);
  const lw = num(last?.weight);
  const lr = num(last?.reps);

  // A set that was performed but has no counterpart is a set you did not do
  // last time. Returning nothing here left a blank chip under set 3 while sets 1
  // and 2 showed green ones — which reads as "that set did not count", when in
  // fact it is the most work you have ever done on the lift. Neutral, because
  // there is genuinely nothing to compare it against; labelled, because silence
  // was the wrong answer.
  if (cw != null && cr != null && (lw == null || lr == null)) {
    return { kind: 'same', label: 'new set' };
  }
  // Nothing to say until the current set has been filled in.
  if (cw == null || cr == null || lw == null || lr == null) return { kind: 'none', label: '' };

  const dw = Math.round((cw - lw) * 100) / 100;
  const dr = cr - lr;

  if (dw > 0 && dr >= 0) return { kind: 'up', label: `+${dw} ${unit}` };
  if (dw === 0 && dr > 0) return { kind: 'up', label: `+${dr} rep${dr === 1 ? '' : 's'}` };
  if (dw === 0 && dr === 0) {
    // Same work — so the only thing left that can have changed is how hard it
    // felt. Easier is progress; harder is worth knowing about too.
    const ce = num(current?.rpe);
    const le = num(last?.rpe);
    if (ce != null && le != null && ce !== le) {
      const de = Math.round((le - ce) * 10) / 10;
      return de > 0
        ? { kind: 'up', label: `same weight, −${de} RPE` }
        : { kind: 'down', label: `same weight, +${Math.abs(de)} RPE` };
    }
    return { kind: 'same', label: 'matched' };
  }
  if (dw < 0 && dr <= 0) return { kind: 'down', label: `${dw} ${unit}` };
  if (dw === 0 && dr < 0) return { kind: 'down', label: `${dr} rep${dr === -1 ? '' : 's'}` };

  // Mixed: heavier for fewer reps, or lighter for more. Real, but not a win.
  return { kind: 'same', label: dw > 0 ? `+${dw} ${unit}, ${dr} reps` : `${dw} ${unit}, +${dr} reps` };
}

/** "80×8 @8" for the ghost line, or null when that set was never logged. */
export function ghostLabel(last: LoggedSet | undefined): string | null {
  const w = last?.weight?.trim();
  const r = last?.reps?.trim();
  if (!w && !r) return null;
  const rpe = last?.rpe?.trim();
  return `${w || '–'}×${r || '–'}${rpe ? ` @${rpe}` : ''}`;
}

/**
 * Whether the exercise as a whole is ahead of last time.
 *
 * Compares total volume (weight × reps summed over sets that have both), which
 * is the honest whole-exercise read: one heavier set is not progress if two
 * others dropped. Only counts positions logged on both sides.
 */
export function exerciseProgress(
  currentSets: LoggedSet[],
  lastSets: LoggedSet[],
): { kind: ProgressKind; pct: number } {
  let cv = 0;
  let lv = 0;
  let pairs = 0;
  for (let i = 0; i < currentSets.length; i++) {
    const cw = num(currentSets[i]?.weight);
    const cr = num(currentSets[i]?.reps);
    const lw = num(lastSets[i]?.weight);
    const lr = num(lastSets[i]?.reps);
    if (cw == null || cr == null) continue;

    // An EXTRA set — beyond anything logged last time — is real work and can
    // only add. Skipping it (the original behaviour) meant adding a third set to
    // a two-set exercise reported "level", which is the opposite of what
    // happened. Sets MISSING from this side are still ignored, so an exercise
    // half logged does not read as a collapse mid-workout.
    if (lw == null || lr == null) {
      if (i >= lastSets.length) {
        cv += cw * cr;
        pairs++;
      }
      continue;
    }
    cv += cw * cr;
    lv += lw * lr;
    pairs++;
  }
  if (!pairs || lv === 0) return { kind: 'none', pct: 0 };
  const pct = Math.round(((cv - lv) / lv) * 1000) / 10;
  if (pct > 0.5) return { kind: 'up', pct };
  if (pct < -0.5) return { kind: 'down', pct };
  return { kind: 'same', pct };
}

/**
 * How far under the sheet's prescribed effort this set landed, in kilos.
 *
 * The program names an RPE for a reason: RPE 8 means roughly two reps left in
 * the tank. Coming in at RPE 5 means five were left, so three more reps were
 * available than the plan intended — the load was too light for the stimulus
 * the block is asking for. That gap is the progressive-overload instruction,
 * and it is already sitting in the data the moment a set is logged.
 *
 * One RPE point is about one rep, and about 3% of load near working weights.
 * That is a population rule of thumb, not a law: it is offered as a suggestion
 * to accept or ignore, never applied on the lifter's behalf.
 *
 * Silent unless the case is clear — no target, no logged RPE, unparseable
 * input, or a gap small enough to be the noise in anybody's self-rating.
 */
export interface LoadHint {
  /**
   * What the gap actually calls for.
   * - `weight`   — it was light, and a sensible heavier load exists
   * - `reps`     — the rep target was missed, so the load says nothing yet
   * - `more-reps`— it was light, but the smallest load this equipment can add
   *                overshoots the gap, so reps are the smaller increment
   */
  kind: 'weight' | 'reps' | 'more-reps';
  /** RPE points below target. */
  under: number;
  /** Suggested load, rounded to the plate step. Equals `current` for both rep kinds. */
  suggested: number;
  current: number;
  /** For kind 'reps': the prescribed count to reach before adding load.
   *  For kind 'more-reps': the count to now push BEYOND. */
  targetReps?: number;
  loggedReps?: number;
  /** For kind 'more-reps': the unmakeable jump, and what it is worth in %. */
  step?: number;
  stepPct?: number;
}

const PCT_PER_RPE = 0.03;
/** Under a point and a half is within the noise of rating your own effort. */
const MIN_GAP = 1.5;

/** First number out of a loosely written sheet value: "8", "8.5", "7-8". */
const firstNumber = (v: string | undefined): number | null =>
  v ? num(v.split(/[-–—/]/)[0]?.trim()) : null;

export function loadHint(
  loggedWeight: string | undefined,
  loggedRpe: string | undefined,
  targetRpe: string | undefined,
  step = 2.5,
  loggedReps?: string,
  targetReps?: string,
): LoadHint | null {
  const w = num(loggedWeight);
  const rpe = num(loggedRpe);
  const target = firstNumber(targetRpe);
  if (w == null || rpe == null || target == null) return null;
  if (w <= 0) return null;

  const under = Math.round((target - rpe) * 10) / 10;
  if (under < MIN_GAP) return null;

  // Reps come first. RPE is a function of load AND reps together, so an easy
  // set that fell short of the prescribed reps says nothing about the load —
  // the prescribed work simply was not done. Telling someone to add weight
  // after one rep of a five-rep target is exactly backwards: they should reach
  // five at this weight, and only then does an easy rating mean it is light.
  const lr = num(loggedReps);
  const tr = firstNumber(targetReps);
  if (lr != null && tr != null && lr < tr) {
    return { kind: 'reps', under, suggested: w, current: w, targetReps: tr, loggedReps: lr };
  }

  const suggested = Math.round((w * (1 + under * PCT_PER_RPE)) / step) * step;
  // Rounding landed back on the weight already used: the gap is real, but the
  // smallest load this equipment can add is bigger than the gap justifies.
  //
  // This used to return null — silence. That is the wrong answer, and it is the
  // classic way to stall on isolation work: a 2.5 kg dumbbell step is 25% on a
  // 10 kg curl, so the set stays "too easy" for months because the only jump
  // available is unmakeable. Reps are the smaller increment, and pushing past
  // the rep target at the same load is precisely double progression.
  if (suggested <= w) {
    return {
      kind: 'more-reps',
      under,
      suggested: w,
      current: w,
      targetReps: tr ?? undefined,
      loggedReps: lr ?? undefined,
      step,
      stepPct: Math.round((step / w) * 1000) / 10,
    };
  }
  return { kind: 'weight', under, suggested, current: w };
}

/**
 * The same suggestion, but grounded in the lifter's own sets when possible.
 *
 * `loadHint` applies a flat 3% per RPE point, which is a population average.
 * When the personal model has enough recent, consistent history for this
 * exercise it knows the real figure — some lifters move 2% a point, others 5%
 * — so the suggestion becomes theirs rather than a textbook's.
 *
 * Falls back to the flat rule rather than going silent: a rough guide beats no
 * guide, as long as it says which one it is.
 */
export interface LearnedHint extends LoadHint {
  /** Where the number came from, so the UI can be honest about it. */
  basis: 'personal' | 'rule';
  /** The lifter's measured kilos per RPE point, when basis is 'personal'. */
  kgPerRpe?: number;
  /** Set when the model exists but is not yet trusted. */
  tentative?: boolean;
}

export function learnedLoadHint(
  loggedWeight: string | undefined,
  loggedRpe: string | undefined,
  targetRpe: string | undefined,
  targetReps: string | undefined,
  loggedReps: string | undefined,
  model: { confidence: 'good' | 'low' | 'none'; predict: (r: number, e: number) => number | null; kgPerRpe: number | null },
  step = 2.5,
): LearnedHint | null {
  const base = loadHint(loggedWeight, loggedRpe, targetRpe, step, loggedReps, targetReps);
  if (!base) return null;
  // The rep target was missed — no load model can change that answer.
  if (base.kind === 'reps') return { ...base, basis: 'rule' };
  if (model.confidence === 'none') return { ...base, basis: 'rule' };

  const reps = firstNumber(targetReps);
  const target = firstNumber(targetRpe);
  if (reps == null || target == null) return { ...base, basis: 'rule' };

  const predicted = model.predict(reps, target);
  if (predicted == null || predicted <= 0) return { ...base, basis: 'rule' };

  const suggested = Math.round(predicted / step) * step;
  // The model can land on or below what was just lifted. Note this is also
  // where a 'more-reps' verdict gets its second opinion: the flat 3%-per-point
  // rule may not clear the equipment's step while this lifter's own figure
  // does. Only when BOTH fail to reach the next makeable weight does the
  // more-reps answer stand.
  if (suggested <= base.current) return { ...base, basis: 'rule' };

  return {
    ...base,
    kind: 'weight',
    suggested,
    step: undefined,
    stepPct: undefined,
    basis: 'personal',
    kgPerRpe: model.kgPerRpe ?? undefined,
    tentative: model.confidence === 'low',
  };
}
