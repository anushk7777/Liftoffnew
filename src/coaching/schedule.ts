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

/** Is this date a scheduled measurement day? */
export function isMeasureDay(date: Date, s: Schedule): boolean {
  if (date.getDay() !== s.measureWeekday) return false;
  if (s.cadence === 'weekly') return true;
  // Biweekly: every other occurrence counted from the anchor.
  const anchor = s.anchor ? parseDay(s.anchor) : null;
  if (!anchor) return true; // no anchor set yet — treat every week as due
  const weeks = Math.round(daysBetween(anchor, date) / 7);
  return weeks % 2 === 0;
}

/** The next scheduled measurement day on or after `from`. */
export function nextMeasureDay(from: Date, s: Schedule): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 0; i < 30; i++) {
    if (isMeasureDay(d, s)) return d;
    d.setDate(d.getDate() + 1);
  }
  return d;
}

export type DayState = 'measure-done' | 'measure-missed' | 'measure-due' | 'weight-done' | 'none';

/** What happened (or should happen) on a given day, for the calendar. */
export function dayState(date: Date, s: Schedule, byDay: Map<string, Metric>): DayState {
  const key = dayKey(date);
  const m = byDay.get(key);
  const today = new Date();
  const isFuture = daysBetween(today, date) > 0;
  const isToday = dayKey(today) === key;

  if (isMeasureDay(date, s)) {
    // A measurement day counts as done once any measurement (not just weight) exists.
    const logged = m && (m.waist_cm != null || m.chest_cm != null || m.hips_cm != null ||
      m.arm_cm != null || m.thigh_cm != null || m.photo_front || m.photo_side);
    if (logged) return 'measure-done';
    if (isFuture || isToday) return 'measure-due';
    return 'measure-missed';
  }
  if (m?.weight_kg != null) return 'weight-done';
  return 'none';
}

/** Human summary, e.g. "Every Monday" / "Every other Monday". */
export function scheduleLabel(s: Schedule): string {
  const day = WEEKDAYS_LONG[s.measureWeekday] ?? 'Monday';
  return s.cadence === 'biweekly' ? `Every other ${day}` : `Every ${day}`;
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
  const today = new Date();
  const key = dayKey(today);
  const m = byDay.get(key);
  if (isMeasureDay(today, s)) {
    const done = m && (m.waist_cm != null || m.chest_cm != null || m.photo_front || m.photo_side);
    if (!done) return { due: true, kind: 'measure' };
  }
  if (s.dailyWeight && m?.weight_kg == null) return { due: true, kind: 'weight' };
  return { due: false, kind: null };
}
