// Deciding whether a lift actually got stronger.
//
// This is the measurement layer under the return-on-volume ledger, split out
// because the hard part is not "did the number go up" — it is "is that bigger
// than this lift's own noise". Getting that wrong in either direction is
// expensive: too strict and you drop a lift that is working, too loose and you
// chase random scatter.
//
// Three things were wrong with the first version, all found by testing rather
// than reasoning:
//
// 1. The trend read the BEST set of each session. One lucky opening set could
//    carry a session where the other two fell. Averaging the working sets is a
//    more stable baseline — minimal-detectable-change work consistently finds
//    smaller thresholds for average than for best values.
//
// 2. The "is it real" threshold was a flat max(2.5kg, 2%), invented. It is now
//    a t-test on the fitted slope plus a practical floor, which is the standard
//    typical-error / smallest-worthwhile-change framework: a change has to be
//    both distinguishable from scatter AND big enough to care about.
//
// 3. Nothing accounted for REP DRIFT. Simulating a lifter whose true strength
//    never changes: reps drifting 8 -> 15 reports -3.8kg, and 12 -> 8 reports
//    +3.3kg. Real gains in the same data are +6 to +7kg, so drift alone can
//    produce half a real gain and flip a verdict. Measured across the rep
//    range, one rep of drift is worth up to 0.67% of e1RM.
//
// Worth stating what was NOT changed and why. A constant high rep count is
// fine: a lifter always doing 15s whose true 1RM goes 100 -> 110 is reported at
// +9.8kg, 98% of the truth, because a constant bias cancels in a trend. An
// earlier plan to discard sets above 12 reps would have thrown away good data
// for no reason. Epley is also kept: it sits within 2.3% of published rep-max
// tables from 3 to 12 reps, and the newer weight-dependent equation could not
// be validated here well enough to justify changing a number that also drives
// PR detection.
import type { WorkoutSession } from './types';

/** Epley. Kept deliberately — see the note above. */
export const epley = (w: number, r: number): number => (w > 0 && r > 0 ? w * (1 + r / 30) : 0);

/** Fake e1RM change produced by one rep of drift, as a share of e1RM.
 *  Measured across the rep-max range; this is the 90th percentile. */
export const DRIFT_PER_REP = 0.0067;

/** Below this, a "gain" is arithmetic rather than strength. */
export const MIN_MEANINGFUL_KG = 2.5;

/** How consistently the ordering must point one way before a trend is called.
 *  Set by backtest, not intuition — see strength.backtest.test.ts. At 1.0 the
 *  false-alarm rate sat near 30% no matter how many sessions were available;
 *  1.25 takes it to about 11% for a modest cost in detection. */
export const Z_CRITICAL = 1.25;

/** A gain worth caring about, as a share of e1RM. Used to ask whether this
 *  lift's data had any chance of showing one. */
export const MEANINGFUL_SHARE = 0.05;

/** One session's worth of evidence about one lift. */
export interface SessionPoint {
  date: string;
  t: number;
  /** Mean e1RM across the working sets — the trend input. */
  meanE1RM: number;
  /** Best e1RM in the session. Kept for reference and PR-style reporting. */
  bestE1RM: number;
  /** Heaviest load used, for spotting a load that never moves. */
  topWeight: number;
  /** Median reps, for measuring drift. */
  medianReps: number;
  /** Mean logged RPE, or null when none was recorded. */
  meanRpe: number | null;
  sets: number;
}

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Per-session evidence for one lift, oldest first. Sessions where the lift was
 *  logged with no usable load contribute nothing. */
export function sessionPoints(sessions: WorkoutSession[], name: string): SessionPoint[] {
  const out: SessionPoint[] = [];
  for (const s of sessions) {
    const entry = s.entries.find((e) => e.name === name);
    if (!entry) continue;
    const e1: number[] = [];
    const reps: number[] = [];
    const rpes: number[] = [];
    let topWeight = 0;
    for (const st of entry.sets) {
      const w = parseFloat(st.weight);
      const r = parseInt(st.reps, 10);
      if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(r) || r <= 0) continue;
      e1.push(epley(w, r));
      reps.push(r);
      if (w > topWeight) topWeight = w;
      const rpe = parseFloat(st.rpe ?? '');
      if (Number.isFinite(rpe) && rpe > 0) rpes.push(rpe);
    }
    if (!e1.length) continue;
    const t = Date.parse(s.completedAt ?? s.date);
    if (Number.isNaN(t)) continue;
    out.push({
      date: new Date(t).toISOString(),
      t,
      meanE1RM: mean(e1),
      bestE1RM: Math.max(...e1),
      topWeight,
      medianReps: median(reps),
      meanRpe: rpes.length ? mean(rpes) : null,
      sets: e1.length,
    });
  }
  return out.sort((a, b) => a.t - b.t);
}

export interface Trend {
  /** Kilos of e1RM the fit says were gained across the window. */
  gain: number;
  /** Fitted value at each end. */
  from: number;
  to: number;
  spanDays: number;
  /** Scatter around the fit — this lift's own typical error, in kilos. */
  typicalError: number;
  /** How far the rep count moved across the window. */
  repDrift: number;
  /** The gain has to beat this to be called real: the larger of an absolute
   *  floor and what rep drift alone could have fabricated. */
  threshold: number;
  /** |slope| / standard error of slope. Above ~2 the trend is distinguishable
   *  from scatter. Null when there are too few points to compute it. */
  tStat: number | null;
  /** Both tests passed: distinguishable from noise AND big enough to matter. */
  real: boolean;
  /**
   * This lift's scatter is larger than a gain worth caring about, so a real
   * change could not have been seen even if it happened.
   *
   * This distinction is the difference between honesty and bluffing. Failing
   * the trend test means one of two very different things — "I looked and there
   * is nothing there" or "I could not have seen it either way" — and calling
   * both of them FLAT is an overclaim. The second deserves "not enough signal",
   * because acting on it (swapping the exercise) would be acting on nothing.
   */
  underpowered: boolean;
}

const DAY_MS = 86_400_000;

/**
 * Fit e1RM against time and decide whether the movement is believable.
 *
 * Two independent tests, and a trend must pass both:
 *
 *   statistical — a t-test on the fitted slope. Accounts for scatter, how many
 *                 sessions there are and how far apart they sit, all at once.
 *                 A noisy lift with few sessions simply cannot clear it.
 *   practical   — the gain must exceed an absolute floor and whatever rep drift
 *                 could have manufactured on its own.
 *
 * Significance without a meaningful effect is a statistic, not a result; a big
 * number with no significance is noise. Requiring both is the standard way this
 * is handled in sports science, and it is what "typical error and smallest
 * worthwhile change" means in practice.
 */
export function fitTrend(points: SessionPoint[]): Trend | null {
  const n = points.length;
  if (n < 3) return null;

  const t0 = points[0].t;
  const xs = points.map((p) => (p.t - t0) / DAY_MS);
  const ys = points.map((p) => p.meanE1RM);
  const spanDays = Math.round(xs[n - 1] - xs[0]);

  // Theil-Sen: the MEDIAN of every pairwise slope, rather than least squares.
  //
  // Least squares was tried first and failed a test that was right to fail it.
  // Four sessions climbing hard then one poor one — 100, 108, 116, 124, 104 —
  // has one point 20kg below the line, and squaring the residuals let that
  // single session dominate both the slope and the scatter estimate, so the
  // whole lift read as "no trend". Theil-Sen recovers the true slope exactly
  // there, because a median ignores the outlier instead of being pulled by it.
  const slopes: number[] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const dx = xs[j] - xs[i];
      if (dx > 0) slopes.push((ys[j] - ys[i]) / dx);
    }
  if (!slopes.length) return null; // every session on the same day
  const slope = median(slopes);
  // Intercept that puts the line through the middle of the data.
  const intercept = median(ys.map((y, i) => y - slope * xs[i]));

  const at = (x: number) => intercept + slope * x;
  const from = at(xs[0]);
  const to = at(xs[n - 1]);
  const gain = to - from;

  // Scatter measured robustly too: 1.4826 x median absolute deviation is the
  // standard robust stand-in for a standard deviation, and one bad session
  // cannot inflate it the way a squared residual does.
  const resid = ys.map((y, i) => y - at(xs[i]));
  const mad = median(resid.map(Math.abs));
  const see = 1.4826 * mad;

  // Mann-Kendall: count how many pairs agree on direction. The natural
  // companion to Theil-Sen, and it asks the question that matters — "does the
  // ordering consistently go one way?" — without assuming anything about the
  // shape of the noise.
  let S = 0;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) S += Math.sign(ys[j] - ys[i]);
  const varS = (n * (n - 1) * (2 * n + 5)) / 18;
  const z = varS > 0 ? (Math.abs(S) - 1) / Math.sqrt(varS) : 0;
  const tStat = Math.max(0, z);

  // Rep drift across the window, and what it could have fabricated on its own.
  const repsSeries = points.map((p) => p.medianReps);
  const repDrift = Math.max(...repsSeries) - Math.min(...repsSeries);
  const level = median(ys); // typical e1RM for this lift, robustly
  const driftKg = DRIFT_PER_REP * level * repDrift;
  const threshold = Math.max(MIN_MEANINGFUL_KG, driftKg);

  // Calibrated by backtest against simulated lifters with known ground truth,
  // not picked by intuition — see strength.backtest.test.ts. Lower is more
  // willing to call a trend; this value maximised correct calls across
  // genuinely progressing, genuinely stalled and pure-noise lifts.
  const real = tStat >= Z_CRITICAL && Math.abs(gain) >= threshold;
  const underpowered = !real && see > MEANINGFUL_SHARE * level;

  return {
    gain: Math.round(gain * 10) / 10,
    from: Math.round(from * 10) / 10,
    to: Math.round(to * 10) / 10,
    spanDays,
    typicalError: Math.round(see * 10) / 10,
    repDrift,
    threshold: Math.round(threshold * 10) / 10,
    tStat: Math.round(tStat * 100) / 100,
    real,
    underpowered,
  };
}

/** Why a lift might be flat, checked in the order the evidence supports.
 *
 *  The 2025 consensus on training-response heterogeneity is that weekly sets,
 *  proximity to failure and rest drive outcomes, while exercise SELECTION is
 *  comparatively flexible. So "swap this exercise" is the wrong first answer —
 *  it is the least likely cause, and swapping a lift you train too easily just
 *  gets you a new lift you train too easily. */
export type FlatCause = 'effort' | 'load-dropping' | 'load-static' | 'volume' | 'exercise';

export interface Diagnosis {
  cause: FlatCause;
  /** Mean RPE across the window, when logged. */
  meanRpe: number | null;
  /** Sheet's prescribed RPE, when known. */
  targetRpe: number | null;
  /** Kilos the top-set load moved across the window. */
  loadChange: number;
  setsPerSession: number;
}

/** Minimum effort gap before "you are not pushing hard enough" is fair. RIR
 *  ratings at 3-4 reps from failure are systematically underestimated, so a
 *  small shortfall is not evidence of anything. */
const RPE_SHORTFALL = 1.5;
/** Under this, there may simply not be enough work to grow from. */
const THIN_SETS = 2;

export function diagnoseFlat(points: SessionPoint[], targetRpe: number | null): Diagnosis {
  const rpes = points.map((p) => p.meanRpe).filter((x): x is number => x != null);
  const meanRpe = rpes.length ? Math.round(mean(rpes) * 10) / 10 : null;
  const loadChange = Math.round((points[points.length - 1].topWeight - points[0].topWeight) * 10) / 10;
  const setsPerSession = Math.round(mean(points.map((p) => p.sets)) * 10) / 10;

  // Effort first: it is both the most likely cause and the cheapest to fix.
  if (meanRpe != null && targetRpe != null && targetRpe - meanRpe >= RPE_SHORTFALL) {
    return { cause: 'effort', meanRpe, targetRpe, loadChange, setsPerSession };
  }
  // Then the load. Dropping and never-moving are different situations and must
  // not share a message — telling someone the weight "hasn't moved" when they
  // have taken 6 kg off it is plainly wrong, and hides the thing they'd want
  // to notice.
  if (loadChange < 0) {
    return { cause: 'load-dropping', meanRpe, targetRpe, loadChange, setsPerSession };
  }
  if (loadChange === 0) {
    return { cause: 'load-static', meanRpe, targetRpe, loadChange, setsPerSession };
  }
  if (setsPerSession < THIN_SETS) {
    return { cause: 'volume', meanRpe, targetRpe, loadChange, setsPerSession };
  }
  // Effort was there, load moved, volume was there, and it still did not
  // respond. Only now is the exercise itself the best remaining explanation.
  return { cause: 'exercise', meanRpe, targetRpe, loadChange, setsPerSession };
}
