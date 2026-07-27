import { describe, it, expect } from 'vitest';
import { weeklyVolume, volumeByProgramWeek, volumeTrend, detectPRs, formatVolume, exerciseProgress } from './store';
import type { WorkoutSession } from './types';

// Minimal session builder — only the fields weeklyVolume/detectPRs read.
const sess = (id: string, date: string, name: string, sets: [number, number][], week?: { id: string; name: string }): WorkoutSession =>
  ({
    id,
    date,
    weekId: week?.id,
    weekName: week?.name,
    entries: [{ name, sets: sets.map(([weight, reps]) => ({ weight: String(weight), reps: String(reps) })) }],
  }) as unknown as WorkoutSession;

describe('weeklyVolume', () => {
  it('sums weight x reps and counts sets per week', () => {
    const out = weeklyVolume([sess('a', '2026-03-10T10:00:00.000Z', 'Bench', [[100, 5], [100, 5]])]);
    expect(out).toHaveLength(1);
    expect(out[0].volume).toBe(1000);
    expect(out[0].sets).toBe(2);
  });

  it('ignores blank/non-numeric sets', () => {
    const out = weeklyVolume([sess('a', '2026-03-10T10:00:00.000Z', 'Bench', [[0, 5], [100, 5]])]);
    expect(out[0].volume).toBe(500);
    expect(out[0].sets).toBe(1);
  });
});

describe('detectPRs', () => {
  it('flags a new top-set weight versus prior sessions', () => {
    const prior = sess('s1', '2026-01-01T10:00:00.000Z', 'Bench', [[100, 5]]);
    const current = sess('s2', '2026-01-08T10:00:00.000Z', 'Bench', [[110, 5]]);
    const hits = detectPRs([prior, current], current);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ lift: 'Bench', kind: 'weight', value: 110, prev: 100 });
  });

  it('does not count a lift with no prior best', () => {
    const current = sess('s2', '2026-01-08T10:00:00.000Z', 'Bench', [[110, 5]]);
    expect(detectPRs([current], current)).toEqual([]);
  });
});

describe('formatVolume', () => {
  it('collapses big loads to tonnes and keeps small ones in unit·reps', () => {
    expect(formatVolume(33205)).toBe('33.2 t');
    expect(formatVolume(8823, 'kg')).toBe('8,823 kg·reps');
  });
});

describe('volumeTrend', () => {
  it('uses trailing 7-day windows, not partial calendar weeks', () => {
    // Sun + following Wed are different Monday buckets but both inside the
    // trailing week — must NOT read as a drop.
    const t = volumeTrend([
      sess('a', '2026-03-15T10:00:00.000Z', 'Bench', [[100, 5]]), // Sunday
      sess('b', '2026-03-18T10:00:00.000Z', 'Bench', [[100, 5]]), // Wednesday
    ]);
    expect(t.thisWeek).toBe(1000);
    expect(t.dir).toBe('na'); // no prior-window data → no fake -50%
  });

  it('compares against the prior 7-day window', () => {
    const t = volumeTrend([
      sess('a', '2026-03-08T10:00:00.000Z', 'Bench', [[100, 10]]), // prior window: 1000
      sess('b', '2026-03-14T10:00:00.000Z', 'Bench', [[100, 6]]), // current: 600
      sess('c', '2026-03-15T10:00:00.000Z', 'Bench', [[100, 6]]), // current: +600
    ]);
    expect(t.lastWeek).toBe(1000);
    expect(t.thisWeek).toBe(1200);
    expect(t.deltaPct).toBe(20);
    expect(t.dir).toBe('up');
  });
});

describe('volumeByProgramWeek', () => {
  const w1 = { id: 'w1', name: 'Week 1 · Build' };
  const w2 = { id: 'w2', name: 'Week 2 · Build' };

  it("keeps a program week's spillover sessions in that week's bucket", () => {
    // Week 1 spans 9 calendar days (async 8-day cycle) — the last session falls
    // in the NEXT calendar week but must still count toward Week 1.
    const out = volumeByProgramWeek([
      sess('a', '2026-03-09T10:00:00.000Z', 'Bench', [[100, 5]], w1), // Mon
      sess('b', '2026-03-17T10:00:00.000Z', 'Bench', [[100, 5]], w1), // next Tue — spillover
      sess('c', '2026-03-19T10:00:00.000Z', 'Bench', [[100, 8]], w2), // Week 2 starts fresh
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].label).toBe('Week 1 · Build');
    expect(out[0].volume).toBe(1000); // both Week 1 sessions
    expect(out[1].label).toBe('Week 2 · Build');
    expect(out[1].volume).toBe(800);
  });

  it('falls back to calendar weeks for untagged sessions', () => {
    const out = volumeByProgramWeek([
      sess('a', '2026-03-09T10:00:00.000Z', 'Bench', [[100, 5]]),
      sess('b', '2026-03-17T10:00:00.000Z', 'Bench', [[100, 5]]),
    ]);
    expect(out).toHaveLength(2); // different calendar Mondays
  });
});

describe('exerciseProgress e1RM', () => {
  const s = (id: string, date: string, sets: [string, string][]): WorkoutSession =>
    ({ id, date, completedAt: date, entries: [{ name: 'Squat', sets: sets.map(([weight, reps]) => ({ weight, reps, done: true })) }] }) as unknown as WorkoutSession;

  it('takes the best estimated 1RM across the sets, not just the heaviest one', () => {
    // 80×3 estimates 88; the back-off 60×15 estimates 90. The heaviest set is
    // still 80, but the better strength estimate came from the lighter set.
    const [p] = exerciseProgress([s('a', '2026-07-01T10:00:00.000Z', [['80', '3'], ['60', '15']])], 'Squat');
    expect(p.weight).toBe(80);
    expect(p.est1RM).toBe(90);
  });

  it('ignores sets with no weight logged', () => {
    const [p] = exerciseProgress([s('a', '2026-07-01T10:00:00.000Z', [['', '8'], ['100', '5']])], 'Squat');
    expect(p.weight).toBe(100);
    expect(p.est1RM).toBe(117);
  });

  it('skips a session where the lift was never loaded', () => {
    expect(exerciseProgress([s('a', '2026-07-01T10:00:00.000Z', [['', '']])], 'Squat')).toEqual([]);
  });
});
