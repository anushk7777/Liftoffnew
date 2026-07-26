// Turning weigh-ins into the two numbers a coach actually decides on.
//
// A total ("-4.4 kg overall") says nothing about what to change today. Rate of
// change per week does: roughly 0.5–1% of bodyweight a week is the usual target
// band, and whether someone is above, inside or below it is the whole call.
//
// Raw daily weight is mostly water, food and salt, so neither number is read
// off the last entry. Both come from a trailing average, which is what makes a
// daily weigh-in worth collecting at all.
import type { Metric } from './api';

export interface Point {
  date: string; // yyyy-mm-dd
  value: number;
}

const DAY_MS = 86400000;
const ms = (day: string) => new Date(`${day}T12:00:00`).getTime();

/** Weigh-ins as sorted points, dropping days with no weight. */
export function weightPoints(metrics: Metric[]): Point[] {
  return metrics
    .filter((m) => typeof m.weight_kg === 'number')
    .map((m) => ({ date: m.taken_on, value: m.weight_kg as number }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Trailing mean over `windowDays`, one output per input day.
 *
 * Trailing rather than centred on purpose: a centred average would keep
 * changing the past as new entries arrive, so the line a client saw yesterday
 * would not be the line they see today.
 */
export function rollingAverage(points: Point[], windowDays = 7): Point[] {
  return points.map((p) => {
    const from = ms(p.date) - (windowDays - 1) * DAY_MS;
    const win = points.filter((q) => ms(q.date) >= from && ms(q.date) <= ms(p.date));
    const mean = win.reduce((s, q) => s + q.value, 0) / win.length;
    return { date: p.date, value: Math.round(mean * 100) / 100 };
  });
}

/**
 * Change per week over the last `windowDays`, by least squares.
 *
 * A least-squares slope rather than (last − first) / weeks: the endpoint method
 * is decided entirely by two readings, so one salty dinner on either end can
 * invert the answer. Regression uses every point in the window.
 *
 * Returns null until the window holds at least two entries spanning 7+ days —
 * a rate extrapolated from three days is noise wearing a decimal point.
 */
export function weeklyRate(points: Point[], windowDays = 28): number | null {
  if (points.length < 2) return null;
  const newest = ms(points[points.length - 1].date);
  const win = points.filter((p) => newest - ms(p.date) <= (windowDays - 1) * DAY_MS);
  if (win.length < 2) return null;

  const spanDays = (newest - ms(win[0].date)) / DAY_MS;
  if (spanDays < 7) return null;

  // x in days from the window start, y in kg.
  const xs = win.map((p) => (ms(p.date) - ms(win[0].date)) / DAY_MS);
  const ys = win.map((p) => p.value);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  return Math.round((num / den) * 7 * 100) / 100; // kg per week
}

/**
 * How the rate reads against the usual 0.5–1% of bodyweight per week band.
 *
 * Expressed as a share of bodyweight rather than absolute kg because the same
 * 0.7 kg/week is sensible at 95 kg and far too fast at 55 kg.
 */
export type RateVerdict = 'gaining' | 'fast' | 'onTrack' | 'slow' | 'holding';

export function rateVerdict(ratePerWeek: number, bodyweightKg: number): RateVerdict {
  if (!bodyweightKg) return 'holding';
  const pct = (Math.abs(ratePerWeek) / bodyweightKg) * 100;
  if (ratePerWeek > 0.05) return 'gaining';
  if (pct < 0.2) return 'holding';
  if (pct > 1) return 'fast';
  if (pct >= 0.5) return 'onTrack';
  return 'slow';
}

/** Days with any entry in the last `windowDays`, for reading a stall honestly. */
export function adherence(
  metrics: Metric[],
  windowDays = 14,
  today = new Date(),
): { logged: number; of: number } {
  // Anchored to the same midday stamp the day keys use. Comparing against local
  // midnight instead put today's own entry (noon) past the end of the window,
  // so every count came back one short.
  const key = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, '0')}-${`${today.getDate()}`.padStart(2, '0')}`;
  const end = ms(key);
  const start = end - (windowDays - 1) * DAY_MS;
  const seen = new Set(
    metrics
      .filter((m) => {
        const t = ms(m.taken_on);
        return t >= start && t <= end;
      })
      .map((m) => m.taken_on),
  );
  return { logged: seen.size, of: windowDays };
}
