import { describe, it, expect } from 'vitest';
import { weeklyVolume, detectPRs, formatVolume } from './store';
import type { WorkoutSession } from './types';

// Minimal session builder — only the fields weeklyVolume/detectPRs read.
const sess = (id: string, date: string, name: string, sets: [number, number][]): WorkoutSession =>
  ({
    id,
    date,
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
