import { describe, it, expect } from 'vitest';
import { prescribe, dropOff } from './prescribe';
import type { LoggedSet, WorkoutSession } from '../types';
import type { LoadModel } from './loadModel';

// A prescription is the first thing this app has produced that is FALSIFIABLE at
// the moment it is given: it names a number you are about to test. So the tests
// care about two things above all — that the number is defensible, and that the
// engine says which rung of the ladder it came from rather than presenting a
// population rule of thumb as if it were your own curve.

const NOW = new Date('2026-07-28T18:00:00');
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();

let seq = 0;
const set = (w: number, r: number, rpe?: number): LoggedSet => ({
  id: `s${seq++}`,
  weight: String(w),
  reps: String(r),
  rpe: rpe == null ? '' : String(rpe),
  rating: 0,
  done: true,
});

const session = (date: string, sets: LoggedSet[], name = 'Incline DB Press', extra: Partial<WorkoutSession> = {}): WorkoutSession =>
  ({
    id: `w${seq++}`,
    dayId: 'push-a',
    dayName: 'Push A',
    date,
    completedAt: date,
    entries: [{ exerciseId: name, name, target: { reps: '8-10', rpe: '8' }, sets, notes: '' }],
    ...extra,
  }) as WorkoutSession;

const base = {
  exercise: 'Incline DB Press',
  workingSets: 3,
  reps: '8-10',
  rpe: '8',
  now: NOW,
  unit: 'kg' as const,
};

/** A model that answers whatever the test wants, so the ladder can be exercised
 *  without having to hand-build six sets at three distinct efforts each time. */
const fakeModel = (predicted: number | null, confidence: LoadModel['confidence'] = 'good'): LoadModel =>
  ({
    confidence,
    predict: () => predicted,
    kgPerRpe: 1.4,
    samples: 12,
    freshnessDays: 3,
    offDays: [],
    spreadKg: 1.1,
  }) as LoadModel;

// ---------------------------------------------------------------------------

describe('the ladder — and saying which rung it is', () => {
  it('uses the lifter’s own curve when it is confident', () => {
    const p = prescribe({ ...base, sessions: [session(daysAgo(4), [set(30, 10, 6)])], model: fakeModel(35) });
    expect(p.basis).toBe('personal');
    expect(p.sets[0].weight).toBe(35);
    expect(p.why).toMatch(/your own 12 sets/);
    expect(p.tentative).toBe(false);
  });

  it('marks a low-confidence model as tentative rather than hiding it', () => {
    const p = prescribe({ ...base, sessions: [session(daysAgo(4), [set(30, 10, 6)])], model: fakeModel(35, 'low') });
    expect(p.basis).toBe('personal');
    expect(p.tentative).toBe(true);
  });

  it('repeats the weight when the rep target was missed — load is not the problem', () => {
    // 6 of 10 reps at 40kg. A curve that only sees weight and RPE would happily
    // suggest going up; double progression says clear the reps first, and the
    // sheet's own rule outranks the model here.
    const p = prescribe({ ...base, sessions: [session(daysAgo(4), [set(40, 6, 8)])], model: fakeModel(45) });
    expect(p.basis).toBe('repeat');
    expect(p.sets[0].weight).toBe(40);
    expect(p.why).toMatch(/6 of 10 at 40kg/);
  });

  it('falls back to the population rule, and calls it one', () => {
    const p = prescribe({ ...base, sessions: [session(daysAgo(4), [set(30, 10, 6)])] });
    expect(p.basis).toBe('rule');
    // 2 RPE points under target, 3% a point, rounded to the dumbbell step.
    expect(p.sets[0].weight).toBe(32.5);
    expect(p.why).toMatch(/rough 3% per point/);
  });

  it('says so plainly when nothing has been lifted yet', () => {
    const p = prescribe({ ...base, sessions: [] });
    expect(p.basis).toBe('sheet');
    expect(p.sets[0].weight).toBeNull();
    // Still gives the reps and the effort, which the sheet does know.
    expect(p.sets[0].reps).toBe(10);
    expect(p.sets[0].rpe).toBe(8);
  });

  it('repeats last time when there is no RPE to adjust from', () => {
    const p = prescribe({ ...base, sessions: [session(daysAgo(4), [set(30, 10)])] });
    expect(p.sets[0].weight).toBe(30);
    expect(p.why).toMatch(/no RPE was logged/);
  });

  it('ignores a day marked rough — it says nothing about the load', () => {
    const sessions = [
      session(daysAgo(10), [set(30, 10, 8)]),
      session(daysAgo(2), [set(20, 10, 10)], 'Incline DB Press', { roughDay: true }),
    ];
    const p = prescribe({ ...base, sessions });
    expect(p.sets[0].weight).toBe(30);
  });

  it('never reads a session from the future', () => {
    const p = prescribe({ ...base, sessions: [session(daysAgo(-3), [set(90, 10, 5)])] });
    expect(p.basis).toBe('sheet');
  });
});

describe('the sheet is read, never rewritten', () => {
  it('takes the top of the rep range as the target', () => {
    // Double progression: you add load after clearing the top of the range, so
    // that is the number worth aiming at.
    expect(prescribe({ ...base, reps: '8-10', sessions: [] }).sets[0].reps).toBe(10);
    expect(prescribe({ ...base, reps: '8', sessions: [] }).sets[0].reps).toBe(8);
  });

  it('gives the last set its own target RPE when the sheet splits them', () => {
    const p = prescribe({ ...base, rpe: '8', lastSetRpe: '10', sessions: [] });
    expect(p.sets.map((s) => s.rpe)).toEqual([8, 8, 10]);
  });

  it('prescribes exactly the working sets the sheet asks for', () => {
    for (const n of [1, 2, 3, 5]) {
      expect(prescribe({ ...base, workingSets: n, sessions: [] }).sets).toHaveLength(n);
    }
  });

  it('survives a sheet with no numbers in it at all', () => {
    const p = prescribe({ ...base, reps: undefined, rpe: undefined, sessions: [] });
    expect(p.basis).toBe('none');
    expect(() => p.sets.length).not.toThrow();
  });
});

describe('rounding to what the equipment can actually make', () => {
  it('rounds a dumbbell lift to the dumbbell step', () => {
    const p = prescribe({ ...base, sessions: [session(daysAgo(4), [set(30, 10, 6)])], model: fakeModel(33.7) });
    expect(p.sets[0].weight! % 2.5).toBe(0);
  });

  it('rounds a machine lift to the pin stack', () => {
    // Pec Deck is a machine (5 kg pins); a cable is 2.5 kg despite also being a
    // stack, which is exactly the distinction `equipmentOf` exists to make.
    const p = prescribe({
      ...base,
      exercise: 'Pec Deck',
      sessions: [session(daysAgo(4), [set(30, 10, 6)], 'Pec Deck')],
      model: fakeModel(33.7),
    });
    expect(p.sets[0].weight! % 5).toBe(0);
  });

  it('uses imperial steps for a lifter logging in pounds', () => {
    const p = prescribe({
      ...base,
      unit: 'lb',
      sessions: [session(daysAgo(4), [set(70, 10, 6)])],
      model: fakeModel(78),
    });
    expect(p.sets[0].weight! % 5).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe('the fade nothing has ever measured', () => {
  /** `n` outings of three sets each with the given weights. */
  const outings = (n: number, weights: number[], reps = [10, 10, 10]) =>
    Array.from({ length: n }, (_, i) =>
      session(daysAgo((n - i) * 4), weights.map((w, k) => set(w, reps[k], 8))),
    );

  it('measures a real fade from the log', () => {
    // 30 / 27.5 / 25 — roughly 8% then 17% down.
    const d = dropOff(outings(4, [30, 27.5, 25]), 'Incline DB Press', NOW);
    expect(d.assumed).toBe(false);
    expect(d.samples).toBeGreaterThanOrEqual(3);
    expect(d.factors[1]).toBeLessThan(1);
    expect(d.factors[2]).toBeLessThan(d.factors[1]);
  });

  it('counts dropped REPS as a fade too, not just dropped weight', () => {
    // Same weight throughout, but 10 → 8 → 6 reps. A profile built on weight
    // alone would call this flat, and prescribe set 3 far too heavy.
    const d = dropOff(outings(4, [30, 30, 30], [10, 8, 6]), 'Incline DB Press', NOW);
    expect(d.assumed).toBe(false);
    expect(d.factors[2]).toBeLessThan(0.95);
  });

  it('assumes no fade rather than inventing one', () => {
    // Two outings is not a profile. Being wrong flat is a smaller error than
    // being wrong in a direction.
    const d = dropOff(outings(2, [30, 27.5, 25]), 'Incline DB Press', NOW);
    expect(d.assumed).toBe(true);
    expect(d.factors).toEqual([1]);
  });

  it('never lets a later set be prescribed heavier than an earlier one', () => {
    // A lifter who ramps UP across sets. The profile describes fatigue; a rising
    // one is noise, and prescribing it would contradict the rep target.
    const d = dropOff(outings(5, [25, 27.5, 30]), 'Incline DB Press', NOW);
    for (let i = 1; i < d.factors.length; i++) {
      expect(d.factors[i]).toBeLessThanOrEqual(d.factors[i - 1]);
    }
  });

  it('throws out a swapped exercise or a fat-fingered weight', () => {
    // Set 2 at a third of set 1 is not fatigue, it is a different movement or a
    // typo, and it must not define the profile.
    const d = dropOff(outings(5, [30, 10, 27.5]), 'Incline DB Press', NOW);
    expect(d.factors[1] ?? 1).toBeGreaterThan(0.6);
  });

  it('ignores rough days and stale history', () => {
    const rough = outings(5, [30, 20, 15]).map((s) => ({ ...s, roughDay: true }));
    expect(dropOff(rough, 'Incline DB Press', NOW).assumed).toBe(true);

    const old = Array.from({ length: 5 }, (_, i) =>
      session(daysAgo(200 + i), [set(30, 10, 8), set(20, 10, 8)]),
    );
    expect(dropOff(old, 'Incline DB Press', NOW).assumed).toBe(true);
  });

  it('shapes the prescription: set 3 is lighter than set 1', () => {
    const sessions = outings(5, [30, 27.5, 25]);
    const p = prescribe({ ...base, sessions, model: fakeModel(30) });
    expect(p.sets[0].weight).toBe(30);
    expect(p.sets[2].weight!).toBeLessThan(p.sets[0].weight!);
    expect(p.drop.assumed).toBe(false);
  });

  it('gives one weight for every set when there is no measured fade', () => {
    const p = prescribe({ ...base, sessions: [session(daysAgo(4), [set(30, 10, 6)])], model: fakeModel(32.5) });
    expect(p.sets.map((s) => s.weight)).toEqual([32.5, 32.5, 32.5]);
    expect(p.drop.assumed).toBe(true);
  });

  it('carries the last measured factor rather than extrapolating off the end', () => {
    // Profile measured for sets 1-2 only; a fourth set must not keep falling.
    const twoSetOutings = Array.from({ length: 5 }, (_, i) =>
      session(daysAgo((5 - i) * 4), [set(30, 10, 8), set(27.5, 10, 8)]),
    );
    const p = prescribe({ ...base, workingSets: 4, sessions: twoSetOutings, model: fakeModel(30) });
    expect(p.sets[2].weight).toBe(p.sets[1].weight);
    expect(p.sets[3].weight).toBe(p.sets[1].weight);
  });
});

describe('robustness', () => {
  it('survives the malformed history a restored backup can hand it', () => {
    const junk = [
      undefined,
      null,
      {},
      { entries: null },
      { entries: [{}] },
      { entries: [{ name: 'Incline DB Press', sets: null }] },
      { date: 'nope', entries: [{ name: 'Incline DB Press', sets: [set(30, 10, 8)] }] },
    ] as unknown as WorkoutSession[];
    expect(() => prescribe({ ...base, sessions: junk })).not.toThrow();
    expect(() => dropOff(junk, 'Incline DB Press', NOW)).not.toThrow();
  });

  it('is deterministic', () => {
    const sessions = [session(daysAgo(4), [set(30, 10, 6)])];
    const a = prescribe({ ...base, sessions });
    const b = prescribe({ ...base, sessions });
    expect(JSON.stringify(a.sets)).toBe(JSON.stringify(b.sets));
  });

  it('never prescribes nothing, or an absurd jump', () => {
    // A 0.5 kg accessory rounded to a 2.5 kg step gave ZERO before the floor
    // went in — the app would have prescribed an empty bar.
    for (const w of [0.5, 1, 2.5, 60, 500]) {
      const p = prescribe({ ...base, sessions: [session(daysAgo(4), [set(w, 10, 5)])] });
      const first = p.sets[0].weight;
      if (first == null) continue;
      expect(first, `${w}kg`).toBeGreaterThan(0);
      // Either a sane step up from what was lifted, or the lightest makeable
      // load when the lift is lighter than one increment.
      expect(first, `${w}kg`).toBeLessThanOrEqual(Math.max(w * 1.5, 2.5));
    }
  });
});
