// SELF-CALIBRATION — the engine changing itself, under guard.
//
// An engine that tunes its own parameters from its own outputs is one bad
// feedback loop away from confidently drifting somewhere useless, and it will
// look fine the whole way because it is grading itself. So the rule here is not
// "learn from outcomes". It is:
//
//     A change is adopted only if it can be shown to have HELPED on data it
//     was not fitted to, by more than the noise, and every decision — adopted
//     or rejected — is written down with the numbers behind it.
//
// ---------------------------------------------------------------------------
// HOW IT VALIDATES
//
// Walk-forward, which is the only honest way to test something that will be used
// forward in time:
//
//   1. Sort the graded sets for one lift oldest-first.
//   2. Fit the correction on the earlier portion ONLY.
//   3. Measure the error it would have produced on the later portion, which the
//      fit never saw, against the error of doing nothing.
//   4. Adopt only if it is better there.
//
// Fitting on everything and reporting the improvement would be circular: a
// constant offset can always reduce error on the data it was computed from, and
// the number would be meaningless and always positive.
//
// ---------------------------------------------------------------------------
// WHAT IT IS ALLOWED TO CHANGE
//
// One thing, per lift: a load multiplier. Not the program, not the rep targets,
// not the RPE the sheet asks for — only the weight the app suggests, which is
// the app's own opinion and the only thing it has any business tuning.
//
// It is clamped hard. A correction beyond ±10% is not calibration, it is the
// data telling you something else is wrong — a swapped exercise, a changed gym,
// an injury — and quietly absorbing that into a multiplier would hide it.
import type { GradedSet } from './grade';

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const mad = (xs: number[]): number => {
  if (!xs.length) return 0;
  const m = median(xs);
  return median(xs.map((x) => Math.abs(x - m)));
};

/** One RPE point is about 3% of load near working weights — the same population
 *  constant the load hint uses, and the bridge from "how far off in effort" to
 *  "how far off in kilos". */
export const PCT_PER_RPE = 0.03;

/** Never move a lift's suggestion by more than this. Beyond it, something other
 *  than calibration is wrong and should be visible rather than absorbed. */
export const MAX_CORRECTION = 0.1;

/** Sets needed before a lift may be corrected at all. Enough that a bias is a
 *  pattern rather than a fortnight. */
export const MIN_SETS_TO_CALIBRATE = 12;
/** …of which this many must be held out to validate on. */
export const MIN_HOLDOUT = 5;

/** The improvement on held-out data must beat this to be adopted. Set from the
 *  spread of the misses themselves, so a noisy lift has to clear a higher bar
 *  than a consistent one. */
export const MIN_GAIN_MAD_FRACTION = 0.15;

export interface Correction {
  exercise: string;
  /** Multiply the suggested load by this. 1 means no change. */
  factor: number;
  /** Sets it was computed from. */
  samples: number;
}

export type CalibrationOutcome = 'adopted' | 'rejected-no-gain' | 'rejected-too-few' | 'rejected-clamped';

/** One decision the engine made about itself, kept forever. */
export interface CalibrationEvent {
  at: string;
  exercise: string;
  outcome: CalibrationOutcome;
  /** The factor in force before, and the one proposed. */
  from: number;
  to: number;
  /** Median absolute miss on the HELD-OUT sets, with and without the change. */
  errorBefore: number;
  errorAfter: number;
  samples: number;
  holdout: number;
  /** The bar the gain had to clear. */
  threshold: number;
  /** Plain-language reason, so the log reads without the code beside it. */
  note: string;
}

/**
 * What a set's miss would have been had the load been scaled by `factor`.
 *
 * Scaling the load by `f` changes the effective effort by roughly
 * `(f - 1) / PCT_PER_RPE` RPE points, so a prescription that ran 0.6 points
 * heavy is corrected by shading the weight down ~1.8%.
 *
 * This is a MODEL of the counterfactual, not a measurement of it — nobody
 * re-lifted the set at the other weight. Stated plainly because it is the
 * weakest link in the whole loop: the validation is only as good as this
 * linearity assumption, which holds near working weights and degrades at the
 * extremes.
 */
/**
 * The miss this set would have shown with NO correction in force.
 *
 * This is what makes the loop stable. Once a correction works, the sets it
 * produces miss by nothing — and pooling those with the biased sets that earned
 * the correction would report a bias near zero, retract the correction, and let
 * the bias come straight back. The engine would hunt forever and look fine doing
 * it, because each individual step would be measured correctly.
 *
 * Undoing the correction first puts every set on one scale, whatever was in
 * force the day it was lifted, so the fit converges on a fixed point.
 */
export function rawMiss(g: GradedSet): number {
  const f = Number.isFinite(g.correction) && g.correction ? g.correction : 1;
  return g.miss - (f - 1) / PCT_PER_RPE;
}

export function missUnder(g: GradedSet, factor: number): number {
  return rawMiss(g) + (factor - 1) / PCT_PER_RPE;
}

const err = (sets: GradedSet[], factor: number): number =>
  median(sets.map((g) => Math.abs(missUnder(g, factor))));

/**
 * Propose and validate a correction for one lift.
 *
 * Returns the event either way — a rejection is as much a part of the record as
 * an adoption, and a log that only contains successes is a log that cannot be
 * used to catch drift.
 *
 * `current` is the baseline the proposal must beat, and defaults to 1: "does
 * correcting this lift at all beat leaving it alone?". Asking it that way each
 * time makes the answer a pure function of the logged history — no path
 * dependence, no state to migrate, and no way for one bad fortnight to become
 * permanent by never being re-asked.
 */
export function calibrateLift(
  exercise: string,
  graded: GradedSet[],
  current = 1,
  now: Date = new Date(),
): { correction: Correction | null; event: CalibrationEvent } {
  const sets = graded
    .filter((g) => g.exercise === exercise)
    .sort((a, b) => a.t - b.t);

  const base = {
    at: now.toISOString(),
    exercise,
    from: current,
    samples: sets.length,
  };

  if (sets.length < MIN_SETS_TO_CALIBRATE) {
    return {
      correction: null,
      event: {
        ...base,
        outcome: 'rejected-too-few',
        to: current,
        errorBefore: 0,
        errorAfter: 0,
        holdout: 0,
        threshold: 0,
        note: `Only ${sets.length} graded sets on ${exercise}; ${MIN_SETS_TO_CALIBRATE} needed before changing anything.`,
      },
    };
  }

  // Walk forward: fit on the earlier portion, judge on the later one.
  const holdout = Math.max(MIN_HOLDOUT, Math.floor(sets.length * 0.4));
  const fitOn = sets.slice(0, sets.length - holdout);
  const testOn = sets.slice(sets.length - holdout);

  // The bias to remove, in RPE points, from the FIT half only — measured with
  // whatever correction was already in force undone, so this is an ABSOLUTE
  // proposal rather than an increment on top of the last one.
  const bias = median(fitOn.map(rawMiss));
  const proposedRaw = 1 - bias * PCT_PER_RPE;
  const proposed = Math.round(Math.min(1 + MAX_CORRECTION, Math.max(1 - MAX_CORRECTION, proposedRaw)) * 1000) / 1000;

  const errorBefore = Math.round(err(testOn, current) * 100) / 100;
  const errorAfter = Math.round(err(testOn, proposed) * 100) / 100;
  // A noisy lift must clear a higher bar than a consistent one.
  const threshold = Math.round(Math.max(0.1, mad(testOn.map((g) => g.miss)) * MIN_GAIN_MAD_FRACTION) * 100) / 100;

  const clamped = Math.abs(proposedRaw - 1) > MAX_CORRECTION;
  if (clamped) {
    return {
      correction: null,
      event: {
        ...base,
        outcome: 'rejected-clamped',
        to: current,
        errorBefore,
        errorAfter,
        holdout,
        threshold,
        note: `${exercise} wanted a ${Math.round((proposedRaw - 1) * 100)}% correction. Past ±${MAX_CORRECTION * 100}% this is not calibration — check the exercise, the equipment, or an injury before the app papers over it.`,
      },
    };
  }

  if (errorBefore - errorAfter <= threshold) {
    return {
      correction: null,
      event: {
        ...base,
        outcome: 'rejected-no-gain',
        to: current,
        errorBefore,
        errorAfter,
        holdout,
        threshold,
        note: `A ${Math.round((proposed - 1) * 1000) / 10}% shift on ${exercise} did not beat doing nothing on ${holdout} held-out sets (${errorBefore} → ${errorAfter} RPE, needed ${threshold}). Left alone.`,
      },
    };
  }

  return {
    correction: { exercise, factor: proposed, samples: sets.length },
    event: {
      ...base,
      outcome: 'adopted',
      to: proposed,
      errorBefore,
      errorAfter,
      holdout,
      threshold,
      note: `${exercise} ran ${bias > 0 ? 'heavy' : 'light'} by ${Math.abs(Math.round(bias * 10) / 10)} RPE. Shifting the suggestion ${Math.round((proposed - 1) * 1000) / 10}% cut the miss from ${errorBefore} to ${errorAfter} on ${holdout} sets it was not fitted to.`,
    },
  };
}

/** Every lift with enough graded history, calibrated in one pass. */
export function calibrateAll(
  graded: GradedSet[],
  current: Record<string, number> = {},
  now: Date = new Date(),
): { corrections: Record<string, number>; events: CalibrationEvent[] } {
  const names = [...new Set(graded.map((g) => g.exercise))].sort();
  const corrections: Record<string, number> = {};
  const events: CalibrationEvent[] = [];
  for (const name of names) {
    const { correction, event } = calibrateLift(name, graded, current[name] ?? 1, now);
    events.push(event);
    // A rejected proposal leaves whatever was already in force — a lift that
    // earned a correction last month does not lose it because this month's
    // window was too small to re-confirm it.
    corrections[name] = correction ? correction.factor : (current[name] ?? 1);
  }
  return { corrections, events };
}

export interface EvolutionSummary {
  /** Adoptions, and the total decisions behind them. */
  adopted: number;
  decisions: number;
  /** Median improvement across adopted changes, in RPE points. */
  medianGain: number;
  /** Lifts currently carrying a correction, with its size as a percentage. */
  active: { exercise: string; pct: number }[];
  /** True when the engine has changed itself and every change measured better
   *  on held-out data. False the moment one did not. */
  everyChangeHelped: boolean;
}

/** What the engine has done to itself, in one object the UI can print. */
export function evolutionSummary(
  events: CalibrationEvent[],
  corrections: Record<string, number> = {},
): EvolutionSummary {
  const adopted = events.filter((e) => e.outcome === 'adopted');
  const gains = adopted.map((e) => e.errorBefore - e.errorAfter);
  return {
    adopted: adopted.length,
    decisions: events.length,
    medianGain: Math.round(median(gains) * 100) / 100,
    active: Object.entries(corrections)
      .filter(([, f]) => Math.abs(f - 1) > 0.0005)
      .map(([exercise, f]) => ({ exercise, pct: Math.round((f - 1) * 1000) / 10 }))
      .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)),
    everyChangeHelped: adopted.every((e) => e.errorAfter < e.errorBefore),
  };
}
