import { describe, it, expect } from 'vitest';
import { co2Band, recoveryReadiness } from './recovery';
import { performedEntries } from './store';
import type { RecoveryEntry, LoggedExercise } from './types';

const entry = (date: string, co2Score: number): RecoveryEntry => ({ id: date, date, co2Score });

describe('co2Band', () => {
  it('classifies scores into recovery bands', () => {
    expect(co2Band(15).band).toBe('poor');
    expect(co2Band(30).band).toBe('moderate');
    expect(co2Band(50).band).toBe('good');
    expect(co2Band(72).band).toBe('excellent');
  });

  it('handles the band boundaries inclusively', () => {
    expect(co2Band(25).band).toBe('moderate');
    expect(co2Band(40).band).toBe('good');
    expect(co2Band(60).band).toBe('excellent');
  });
});

describe('recoveryReadiness', () => {
  it('returns na with no data', () => {
    expect(recoveryReadiness([]).verdict).toBe('na');
  });

  it('flags a poor latest score as under-recovered', () => {
    const r = recoveryReadiness([entry('2026-03-10T08:00:00.000Z', 18)]);
    expect(r.band).toBe('poor');
    expect(r.verdict).toBe('under');
  });

  it('flags a big drop below baseline as under-recovered', () => {
    // Baseline ~50 (good), latest 40 → -20% → under.
    const r = recoveryReadiness([
      entry('2026-03-12T08:00:00.000Z', 40),
      entry('2026-03-11T08:00:00.000Z', 50),
      entry('2026-03-10T08:00:00.000Z', 50),
    ]);
    expect(r.baseline).toBe(50);
    expect(r.deltaPct).toBe(-20);
    expect(r.verdict).toBe('under');
  });

  it('reads a good score near baseline as recovered', () => {
    const r = recoveryReadiness([
      entry('2026-03-12T08:00:00.000Z', 55),
      entry('2026-03-11T08:00:00.000Z', 54),
      entry('2026-03-10T08:00:00.000Z', 52),
    ]);
    expect(r.verdict).toBe('recovered');
    expect(r.latest).toBe(55);
  });
});

describe('performedEntries', () => {
  const ex = (name: string, sets: { weight?: string; reps?: string; done?: boolean }[]): LoggedExercise =>
    ({ name, sets: sets.map((s) => ({ weight: s.weight ?? '', reps: s.reps ?? '', rpe: '', rating: 0, done: !!s.done })) }) as unknown as LoggedExercise;

  it('drops blank/undone sets and exercises with none', () => {
    const out = performedEntries([
      ex('Bench', [{ weight: '100', reps: '8' }, { weight: '', reps: '' }]),
      ex('Skipped', [{ weight: '', reps: '' }]),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Bench');
    expect(out[0].sets).toHaveLength(1);
  });

  it('keeps a marked-done bodyweight set with no weight/reps', () => {
    const out = performedEntries([ex('Pull Up', [{ done: true }])]);
    expect(out).toHaveLength(1);
    expect(out[0].sets).toHaveLength(1);
  });
});
