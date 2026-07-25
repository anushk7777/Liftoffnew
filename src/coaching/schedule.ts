// Check-in scheduling — pure date logic, no React, so it is easy to reason
// about and reuse between the calendar, the forms and the reminders.
import type { CoachClient, Metric } from './api';

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const WEEKDAYS_LONG = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;

export interface Schedule {
  measureWeekday: number; // 0–6
  cadence: 'weekly' | 'biweekly';
  anchor: string | null; // yyyy-mm-dd, first scheduled measurement
  dailyWeight: boolean;
}

export function scheduleOf(c: CoachClient | null): Schedule {
  return {
    measureWeekday: c?.measure_weekday ?? 1,
    cadence: (c?.measure_cadence as 'weekly' | 'biweekly') ?? 'weekly',
    anchor: c?.measure_anchor ?? null,
    dailyWeight: c?.daily_weight !== false,
  };
}

/** Local yyyy-mm-dd for a Date (never UTC — check-ins are local-day events). */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const DAY_MS = 86400000;
/** Whole days between two local dates, ignoring clock time. */
function daysBetween(a: Date, b: Date): number {
  const A = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const B = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((B - A) / DAY_MS);
}

/**
 * How often we SUGGEST full measurements. It is a recommendation and nothing
 * more: no day is ever "due", nothing is ever "missed", and measurements can be
 * logged on any day. A day becomes a measurement day because it was logged.
 */
export const RECOMMENDED_GAP_DAYS = 14;

/** Does this entry carry real measurements (not just a weight)? */
export function hasMeasurements(m: Metric | undefined): boolean {
  return (
    !!m &&
    (m.waist_cm != null || m.chest_cm != null || m.hips_cm != null ||
      m.arm_cm != null || m.thigh_cm != null || !!m.photo_front || !!m.photo_side)
  );
}

/** The most recent day with measurements, or null if there has never been one. */
export function lastMeasurementDay(byDay: Map<string, Metric>): Date | null {
  let latest: Date | null = null;
  for (const [key, m] of byDay) {
    if (!hasMeasurements(m)) continue;
    const d = parseDay(key);
    if (!latest || d > latest) latest = d;
  }
  return latest;
}

/**
 * The one and only measurement prompt: you measured recently and are about to
 * do it again. Tape and scale noise swamps real change over a few days, so
 * back-to-back numbers mislead more than they inform.
 *
 * This never fires for going a long time without measuring — waiting is fine,
 * and being told off for it is exactly the nagging we do not want. It is advice
 * on a day the user chose, and it never blocks the save.
 */
export function measuredRecently(
  byDay: Map<string, Metric>,
  forDate = new Date(),
): { daysSince: number | null; tooSoon: boolean } {
  const forKey = dayKey(forDate);
  let latest: Date | null = null;
  for (const [key, m] of byDay) {
    // Editing the entry you are already looking at is not measuring again.
    if (key === forKey || !hasMeasurements(m)) continue;
    const d = parseDay(key);
    if (d <= forDate && (!latest || d > latest)) latest = d;
  }
  if (!latest) return { daysSince: null, tooSoon: false };
  const daysSince = daysBetween(latest, forDate);
  return { daysSince, tooSoon: daysSince < RECOMMENDED_GAP_DAYS };
}

export type DayState = 'measure-done' | 'weight-done' | 'none';

/**
 * Purely a record of what happened. Days are not marked in advance and nothing
 * is ever flagged as missed: a day is a measurement day because it was measured.
 */
export function dayState(date: Date, byDay: Map<string, Metric>): DayState {
  const m = byDay.get(dayKey(date));
  if (hasMeasurements(m)) return 'measure-done';
  if (m?.weight_kg != null) return 'weight-done';
  return 'none';
}

/** Human summary of how the check-in works now. */
export function scheduleLabel(s: Schedule): string {
  return s.dailyWeight
    ? 'Log whenever you like · weight daily'
    : 'Log whenever you like';
}

/** Build the 6×7 grid of dates covering a month, Monday-first. */
export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  // Monday-first offset: JS getDay() is Sunday-first.
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

/** Index metrics by their local day key. */
export function indexByDay(metrics: Metric[]): Map<string, Metric> {
  const m = new Map<string, Metric>();
  for (const x of metrics) m.set(x.taken_on, x);
  return m;
}

/**
 * Whether a reminder should fire today: only on scheduled measurement days,
 * or daily for the weight log when that is enabled and today has no entry.
 */
export function reminderDueToday(
  s: Schedule,
  byDay: Map<string, Metric>,
): { due: boolean; kind: 'measure' | 'weight' | null } {
  // Measurements are never "due" — the user picks their own days, so there is
  // nothing to chase. Only the daily weigh-in, and only if they opted into it.
  const m = byDay.get(dayKey(new Date()));
  if (s.dailyWeight && m?.weight_kg == null) return { due: true, kind: 'weight' };
  return { due: false, kind: null };
}
