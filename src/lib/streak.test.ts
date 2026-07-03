import { describe, it, expect } from 'vitest';
import { dayKey, streakFromDays, longestRunFromDays, isMilestone } from './streak';

// Build a yyyy-MM-dd key N days before today using the same helper under test.
const keyDaysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dayKey(d);
};

describe('dayKey', () => {
  it('formats a Date and an ISO string to yyyy-MM-dd', () => {
    expect(dayKey('2026-03-09T15:04:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dayKey(new Date('2026-03-09T00:00:00'))).toBe('2026-03-09');
  });
});

describe('streakFromDays', () => {
  it('returns 0 with the freeze available for no activity', () => {
    expect(streakFromDays(new Set())).toEqual({ streak: 0, freezeAvailable: true });
  });

  it('counts consecutive days including today', () => {
    const days = new Set([keyDaysAgo(0), keyDaysAgo(1), keyDaysAgo(2)]);
    expect(streakFromDays(days).streak).toBe(3);
  });

  it('does not punish a not-yet-logged today', () => {
    const days = new Set([keyDaysAgo(1), keyDaysAgo(2)]);
    const { streak } = streakFromDays(days);
    expect(streak).toBe(2);
  });

  it('spends the single grace day to bridge one gap', () => {
    // today + a one-day hole + two more days -> grace bridges the hole
    const days = new Set([keyDaysAgo(0), keyDaysAgo(2), keyDaysAgo(3)]);
    const { streak, freezeAvailable } = streakFromDays(days);
    expect(streak).toBe(3);
    expect(freezeAvailable).toBe(false);
  });
});

describe('longestRunFromDays', () => {
  it('finds the best historical run, not just the current one', () => {
    // A 3-day run months ago beats a lone recent day.
    const days = new Set(['2026-01-01', '2026-01-02', '2026-01-03', '2026-03-10']);
    expect(longestRunFromDays(days)).toBe(3);
  });

  it('breaks runs on gaps and handles single/empty sets', () => {
    expect(longestRunFromDays(new Set(['2026-01-01', '2026-01-03']))).toBe(1);
    expect(longestRunFromDays(new Set(['2026-01-01']))).toBe(1);
    expect(longestRunFromDays(new Set())).toBe(0);
  });

  it('counts across a month boundary', () => {
    expect(longestRunFromDays(new Set(['2026-01-31', '2026-02-01', '2026-02-02']))).toBe(3);
  });
});

describe('isMilestone', () => {
  it('recognises milestone streak lengths', () => {
    expect(isMilestone(7)).toBe(true);
    expect(isMilestone(8)).toBe(false);
  });
});
