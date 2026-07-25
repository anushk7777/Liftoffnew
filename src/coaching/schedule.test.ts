// Check-ins are user-driven: no day is prescribed, nothing is ever marked
// missed, and the only prompt fires when someone measures again within a couple
// of days. These tests pin that down — the old weekday/cadence prescription and
// its tests are gone with the feature.
import { describe, it, expect } from 'vitest';
import {
  dayKey, monthGrid, dayState, measuredRecently, hasMeasurements,
  lastMeasurementDay, indexByDay, reminderDueToday,
  RECOMMENDED_GAP_DAYS, type Schedule,
} from './schedule';
import type { Metric } from './api';

const d = (s: string) => new Date(`${s}T12:00:00`);

const metric = (taken_on: string, extra: Partial<Metric> = {}): Metric =>
  ({ id: taken_on, client_id: 'c', taken_on, ...extra }) as Metric;

const measured = (day: string) => metric(day, { waist_cm: 80, weight_kg: 70 });
const weighed = (day: string) => metric(day, { weight_kg: 70 });

const sched = (dailyWeight: boolean): Schedule => ({
  measureWeekday: 1, cadence: 'weekly', anchor: null, dailyWeight,
});

describe('hasMeasurements', () => {
  it('needs more than a weight', () => {
    expect(hasMeasurements(weighed('2026-07-06'))).toBe(false);
    expect(hasMeasurements(measured('2026-07-06'))).toBe(true);
    expect(hasMeasurements(metric('2026-07-06', { photo_front: 'p.jpg' }))).toBe(true);
    expect(hasMeasurements(undefined)).toBe(false);
  });
});

describe('dayState', () => {
  const byDay = indexByDay([measured('2026-07-06'), weighed('2026-07-07')]);

  it('marks a day measured only because it was measured', () => {
    expect(dayState(d('2026-07-06'), byDay)).toBe('measure-done');
  });

  it('marks a weight-only day with the lesser state', () => {
    expect(dayState(d('2026-07-07'), byDay)).toBe('weight-done');
  });

  it('never marks a day in advance, and never marks one missed', () => {
    // A past day with nothing logged, and a future day: both simply blank.
    expect(dayState(d('2026-06-01'), byDay)).toBe('none');
    expect(dayState(d('2099-01-04'), byDay)).toBe('none');
  });
});

describe('measuredRecently', () => {
  const byDay = indexByDay([measured('2026-07-06')]);

  it('prompts when measuring again within the recommended gap', () => {
    const r = measuredRecently(byDay, d('2026-07-08'));
    expect(r.tooSoon).toBe(true);
    expect(r.daysSince).toBe(2);
  });

  it('stays quiet once the gap has passed', () => {
    const r = measuredRecently(byDay, d(`2026-07-${6 + RECOMMENDED_GAP_DAYS}`));
    expect(r.tooSoon).toBe(false);
  });

  it('never prompts for a long gap — waiting is fine', () => {
    expect(measuredRecently(byDay, d('2026-12-25')).tooSoon).toBe(false);
  });

  it('never prompts on a first ever measurement', () => {
    const r = measuredRecently(indexByDay([]), d('2026-07-08'));
    expect(r).toEqual({ daysSince: null, tooSoon: false });
  });

  it('does not count the entry being edited as measuring again', () => {
    expect(measuredRecently(byDay, d('2026-07-06')).tooSoon).toBe(false);
  });

  it('ignores weight-only days', () => {
    const wd = indexByDay([measured('2026-07-01'), weighed('2026-07-08')]);
    expect(measuredRecently(wd, d('2026-07-09')).daysSince).toBe(8);
  });
});

describe('lastMeasurementDay', () => {
  it('picks the most recent measured day', () => {
    const byDay = indexByDay([measured('2026-07-01'), measured('2026-07-20'), weighed('2026-07-25')]);
    expect(dayKey(lastMeasurementDay(byDay)!)).toBe('2026-07-20');
  });

  it('is null when nothing was ever measured', () => {
    expect(lastMeasurementDay(indexByDay([weighed('2026-07-01')]))).toBeNull();
  });
});

describe('reminderDueToday', () => {
  it('never chases a measurement — only the opted-in daily weight', () => {
    const empty = indexByDay([]);
    expect(reminderDueToday(sched(true), empty)).toEqual({ due: true, kind: 'weight' });
    expect(reminderDueToday(sched(false), empty)).toEqual({ due: false, kind: null });
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
