// Habit scheduling and streaks.
//
// The distinction that matters here: a habit's streak counts the OCCASIONS it
// was due, not calendar days. `streakFromDays` in streak.ts walks back one day
// at a time, which is right for "did you show up today" but wrong for a habit
// scheduled Mon/Wed/Fri — Tuesday is not a miss, it is not a training day. Run
// through that function, a perfectly kept Mon/Wed/Fri habit reads a streak of
// 2 forever, because the walk spends its one grace day on Thursday and then
// breaks on Tuesday. A weekly habit reads 1. A streak that cannot grow is
// worse than no streak at all.
import { startOfDay } from 'date-fns';
import { dayKey } from './streak';
import type { Habit } from '../store/data';

/** Is this habit scheduled on this date? A weekly habit with no days picked
 *  falls back to "any day", matching what the add form allows. */
export function isHabitDueOn(habit: Pick<Habit, 'cadence' | 'daysOfWeek'>, date: Date): boolean {
  if (habit.cadence === 'daily') return true;
  if (!habit.daysOfWeek?.length) return true;
  return habit.daysOfWeek.includes(date.getDay());
}

export const isHabitDueToday = (habit: Pick<Habit, 'cadence' | 'daysOfWeek'>, now: Date = new Date()) =>
  isHabitDueOn(habit, now);

// A habit scheduled on no weekday at all would make the walk below run to its
// guard every time; belt and braces, since the UI cannot currently create one.
const MAX_LOOKBACK_DAYS = 3650;

/**
 * Consecutive scheduled occasions completed, most recent first, allowing one
 * slip (the same grace the daily streak gives).
 *
 * Days the habit was not due are stepped over — they neither add to the streak
 * nor break it. A completion logged on an unscheduled day is a bonus: it is
 * kept in history and shown on the strip, but it cannot extend the streak,
 * because the streak is a measure of keeping to the schedule.
 *
 * The walk stops at the habit's creation date, so time before the habit existed
 * is never counted as missed.
 */
export function habitStreak(
  days: Set<string>,
  habit: Pick<Habit, 'cadence' | 'daysOfWeek' | 'createdAt'>,
  now: Date = new Date(),
): number {
  if (days.size === 0) return 0;

  let streak = 0;
  let grace = true;
  const cursor = startOfDay(now);
  // Today is still in progress — not doing it yet is not a miss.
  if (isHabitDueOn(habit, cursor) && !days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);

  const created = startOfDay(new Date(habit.createdAt));
  const floor = Number.isNaN(created.getTime()) ? -Infinity : created.getTime();

  for (let i = 0; i < MAX_LOOKBACK_DAYS && cursor.getTime() >= floor; i++) {
    if (isHabitDueOn(habit, cursor)) {
      if (days.has(dayKey(cursor))) streak++;
      else if (grace) grace = false;
      else break;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/**
 * "Never miss twice" — was the last scheduled occasion before today missed?
 *
 * Asked of the previous DUE day, not literal yesterday: on a Mon/Wed/Fri
 * habit, Friday's question is about Wednesday. Comparing against yesterday
 * flagged the warning every single session.
 */
export function missedLastDue(
  days: Set<string>,
  habit: Pick<Habit, 'cadence' | 'daysOfWeek' | 'createdAt'>,
  now: Date = new Date(),
): boolean {
  if (days.size === 0) return false; // nothing to break yet
  const created = startOfDay(new Date(habit.createdAt));
  const cursor = startOfDay(now);
  cursor.setDate(cursor.getDate() - 1);
  for (let i = 0; i < MAX_LOOKBACK_DAYS && cursor >= created; i++) {
    if (isHabitDueOn(habit, cursor)) return !days.has(dayKey(cursor));
    cursor.setDate(cursor.getDate() - 1);
  }
  return false;
}
