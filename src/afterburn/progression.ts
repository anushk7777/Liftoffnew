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

  // Nothing to say until both sides have a comparable pair.
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
    if (cw == null || cr == null || lw == null || lr == null) continue;
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
  /** RPE points below target. */
  under: number;
  /** Suggested load, rounded to the nearest 2.5. */
  suggested: number;
  current: number;
}

const PCT_PER_RPE = 0.03;
/** Under a point and a half is within the noise of rating your own effort. */
const MIN_GAP = 1.5;

export function loadHint(
  loggedWeight: string | undefined,
  loggedRpe: string | undefined,
  targetRpe: string | undefined,
  step = 2.5,
): LoadHint | null {
  const w = num(loggedWeight);
  const rpe = num(loggedRpe);
  // Targets are written loosely on a sheet — "8", "8.5", sometimes "7-8".
  const target = targetRpe ? num(targetRpe.split(/[-–—/]/)[0]?.trim()) : null;
  if (w == null || rpe == null || target == null) return null;
  if (w <= 0) return null;

  const under = Math.round((target - rpe) * 10) / 10;
  if (under < MIN_GAP) return null;

  const suggested = Math.round((w * (1 + under * PCT_PER_RPE)) / step) * step;
  // Rounding can land back on the weight already used; nothing to suggest then.
  if (suggested <= w) return null;
  return { under, suggested, current: w };
}
