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
  if (dw === 0 && dr === 0) return { kind: 'same', label: 'matched' };
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
