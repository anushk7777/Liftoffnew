import { describe, it, expect } from 'vitest';
import { isMeasureDay, nextMeasureDay, dayKey, monthGrid, type Schedule } from './schedule';

const weekly: Schedule = { measureWeekday: 1, cadence: 'weekly', anchor: null, dailyWeight: true };
// Anchor on Mon 2026-07-06; biweekly means 07-06, 07-20, 08-03 …
const biweekly: Schedule = { measureWeekday: 1, cadence: 'biweekly', anchor: '2026-07-06', dailyWeight: true };

const d = (s: string) => new Date(`${s}T12:00:00`);

describe('weekly cadence', () => {
  it('matches every Monday only', () => {
    expect(isMeasureDay(d('2026-07-06'), weekly)).toBe(true); // Mon
    expect(isMeasureDay(d('2026-07-13'), weekly)).toBe(true); // Mon
    expect(isMeasureDay(d('2026-07-07'), weekly)).toBe(false); // Tue
    expect(isMeasureDay(d('2026-07-12'), weekly)).toBe(false); // Sun
  });
});

describe('biweekly cadence', () => {
  it('matches every other Monday from the anchor', () => {
    expect(isMeasureDay(d('2026-07-06'), biweekly)).toBe(true);  // anchor
    expect(isMeasureDay(d('2026-07-13'), biweekly)).toBe(false); // off week
    expect(isMeasureDay(d('2026-07-20'), biweekly)).toBe(true);
    expect(isMeasureDay(d('2026-07-27'), biweekly)).toBe(false);
    expect(isMeasureDay(d('2026-08-03'), biweekly)).toBe(true);
  });

  it('works backwards from the anchor too', () => {
    expect(isMeasureDay(d('2026-06-22'), biweekly)).toBe(true);
    expect(isMeasureDay(d('2026-06-29'), biweekly)).toBe(false);
  });
});

describe('nextMeasureDay', () => {
  it('returns the same day when today is due', () => {
    expect(dayKey(nextMeasureDay(d('2026-07-06'), weekly))).toBe('2026-07-06');
  });
  it('skips the off week for biweekly', () => {
    expect(dayKey(nextMeasureDay(d('2026-07-07'), biweekly))).toBe('2026-07-20');
  });
});

describe('monthGrid', () => {
  it('is 42 cells and starts on a Monday', () => {
    const g = monthGrid(2026, 6); // July 2026
    expect(g).toHaveLength(42);
    expect(g[0].getDay()).toBe(1);
    // must contain every day of the month
    expect(g.some((x) => dayKey(x) === '2026-07-01')).toBe(true);
    expect(g.some((x) => dayKey(x) === '2026-07-31')).toBe(true);
  });
});
