import { describe, it, expect } from 'vitest';
import { habitStreak, isHabitDueOn, missedLastDue } from './habits';
import { streakFromDays } from './streak';

// 2026-07-27 is a Monday.
const MON = new Date('2026-07-27T12:00:00');
const d = (iso: string) => new Date(`${iso}T12:00:00`);

const daily = { cadence: 'daily' as const, createdAt: '2026-01-01T00:00:00.000Z' };
// Mon / Wed / Fri
const mwf = { cadence: 'weekly' as const, daysOfWeek: [1, 3, 5], createdAt: '2026-01-01T00:00:00.000Z' };
const mondays = { cadence: 'weekly' as const, daysOfWeek: [1], createdAt: '2026-01-01T00:00:00.000Z' };

describe('isHabitDueOn', () => {
  it('is every day for a daily habit', () => {
    expect(isHabitDueOn(daily, d('2026-07-28'))).toBe(true);
  });

  it('follows the chosen weekdays', () => {
    expect(isHabitDueOn(mwf, d('2026-07-27'))).toBe(true); // Mon
    expect(isHabitDueOn(mwf, d('2026-07-28'))).toBe(false); // Tue
    expect(isHabitDueOn(mwf, d('2026-07-29'))).toBe(true); // Wed
  });

  it('falls back to any day when a weekly habit picked none', () => {
    expect(isHabitDueOn({ cadence: 'weekly', daysOfWeek: [] }, d('2026-07-28'))).toBe(true);
  });
});

describe('habitStreak', () => {
  it('counts scheduled occasions, not calendar days', () => {
    // Four perfect weeks of Mon/Wed/Fri, up to and including today (Mon).
    const days = new Set([
      '2026-07-01', '2026-07-03', '2026-07-06', '2026-07-08', '2026-07-10',
      '2026-07-13', '2026-07-15', '2026-07-17', '2026-07-20', '2026-07-22',
      '2026-07-24', '2026-07-27',
    ]);
    // The bug this fixes: the day-by-day walk sees Tuesday as a miss.
    expect(streakFromDays(days, MON).streak).toBeLessThanOrEqual(2);
    expect(habitStreak(days, mwf, MON)).toBe(12);
  });

  it('lets a once-a-week habit build a streak at all', () => {
    const days = new Set(['2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27']);
    expect(streakFromDays(days, MON).streak).toBe(1);
    expect(habitStreak(days, mondays, MON)).toBe(4);
  });

  it('still allows one slip, and only one', () => {
    // Missed Wed 22nd, kept everything else.
    const oneSlip = new Set(['2026-07-15', '2026-07-17', '2026-07-20', '2026-07-24', '2026-07-27']);
    expect(habitStreak(oneSlip, mwf, MON)).toBe(5);
    // Missed Wed 22nd AND Fri 24th — the streak stops at the second miss.
    const twoSlips = new Set(['2026-07-15', '2026-07-17', '2026-07-20', '2026-07-27']);
    expect(habitStreak(twoSlips, mwf, MON)).toBe(1);
  });

  it('does not treat an unfinished today as a miss', () => {
    // Today (Mon) not yet done, but the three before it were kept. The streak
    // reads 3 rather than resetting just because the day is still in progress.
    const days = new Set(['2026-07-20', '2026-07-22', '2026-07-24']);
    expect(habitStreak(days, mwf, MON)).toBe(3);
  });

  it('does not count the time before the habit existed as missed', () => {
    const fresh = { ...mwf, createdAt: '2026-07-24T09:00:00.000Z' }; // last Friday
    expect(habitStreak(new Set(['2026-07-24', '2026-07-27']), fresh, MON)).toBe(2);
  });

  it('keeps a bonus day without letting it extend the streak', () => {
    // Tuesday was not scheduled; doing it anyway neither counts nor breaks.
    const days = new Set(['2026-07-22', '2026-07-24', '2026-07-25', '2026-07-27']);
    expect(habitStreak(days, mwf, MON)).toBe(3);
  });

  it('is zero with no history', () => {
    expect(habitStreak(new Set(), mwf, MON)).toBe(0);
  });

  it('still behaves like the daily streak for a daily habit', () => {
    const days = new Set(['2026-07-25', '2026-07-26', '2026-07-27']);
    expect(habitStreak(days, daily, MON)).toBe(streakFromDays(days, MON).streak);
  });
});

describe('missedLastDue', () => {
  it('asks about the previous scheduled day, not yesterday', () => {
    // Kept Friday. Saturday and Sunday were never scheduled, so nothing is missed.
    const days = new Set(['2026-07-24']);
    expect(missedLastDue(days, mwf, MON)).toBe(false);
  });

  it('flags a genuinely missed occasion', () => {
    const days = new Set(['2026-07-22']); // kept Wed, skipped Fri
    expect(missedLastDue(days, mwf, MON)).toBe(true);
  });

  it('stays quiet for a habit with no history yet', () => {
    expect(missedLastDue(new Set(), mwf, MON)).toBe(false);
  });

  it('stays quiet before the habit existed', () => {
    const fresh = { ...mwf, createdAt: '2026-07-27T08:00:00.000Z' };
    expect(missedLastDue(new Set(['2026-07-27']), fresh, MON)).toBe(false);
  });
});
