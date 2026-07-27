import { describe, it, expect } from 'vitest';
import { buildLoadModel, observationsFor, repsToFailure } from './loadModel';
import type { WorkoutSession, LoggedSet } from './types';

const NOW = Date.parse('2026-07-27T10:00:00.000Z');
const DAY = 86_400_000;

const set = (weight: number, reps: number, rpe: number): LoggedSet =>
  ({ id: `${weight}-${reps}-${rpe}`, weight: String(weight), reps: String(reps), rpe: String(rpe), rating: 0, done: true });

const sess = (
  id: string,
  daysAgo: number,
  sets: LoggedSet[],
  extra: Partial<WorkoutSession> = {},
  name = 'BACK SQUAT',
): WorkoutSession =>
  ({
    id,
    dayId: 'd',
    dayName: 'Day',
    date: new Date(NOW - daysAgo * DAY).toISOString(),
    completedAt: new Date(NOW - daysAgo * DAY).toISOString(),
    entries: [{ exerciseId: 'e', name, target: { reps: '5' }, sets }],
    ...extra,
  }) as WorkoutSession;

/**
 * A lifter whose true curve is weight = 120 - 4 * repsToFailure.
 * So 5 reps @ RPE 8 (rtf 7) should come out at 92.
 */
const truth = (rtf: number) => 120 - 4 * rtf;
const honestSet = (reps: number, rpe: number) => set(truth(repsToFailure(reps, rpe)), reps, rpe);

const goodHistory = (): WorkoutSession[] => [
  sess('s1', 21, [honestSet(8, 7), honestSet(6, 8), honestSet(4, 9)]),
  sess('s2', 14, [honestSet(8, 8), honestSet(5, 8), honestSet(3, 9)]),
  sess('s3', 7, [honestSet(10, 7), honestSet(6, 9), honestSet(4, 8)]),
  sess('s4', 2, [honestSet(8, 7), honestSet(5, 9), honestSet(3, 8)]),
];

describe('repsToFailure', () => {
  it('reads RPE as reps left in the tank', () => {
    expect(repsToFailure(5, 8)).toBe(7); // 5 done, ~2 left
    expect(repsToFailure(5, 10)).toBe(5); // nothing left
  });
});

describe('observationsFor', () => {
  it('ignores sets missing any of weight, reps or RPE', () => {
    const s = sess('a', 1, [set(100, 5, 8), { ...set(100, 5, 8), rpe: '' }, { ...set(100, 5, 8), weight: '' }]);
    expect(observationsFor([s], 'BACK SQUAT', NOW)).toHaveLength(1);
  });

  it('ignores other exercises', () => {
    const s = sess('a', 1, [set(100, 5, 8)], {}, 'BENCH PRESS');
    expect(observationsFor([s], 'BACK SQUAT', NOW)).toHaveLength(0);
  });

  it('skips a session the lifter flagged rough', () => {
    const s = sess('a', 1, [set(100, 5, 8)], { roughDay: true });
    expect(observationsFor([s], 'BACK SQUAT', NOW)).toHaveLength(0);
  });

  it('skips warm-ups by effort, not by rep count', () => {
    // RPE 2 is a warm-up however many reps it ran to.
    const warm = sess('a', 1, [set(40, 5, 2), set(100, 5, 8)]);
    expect(observationsFor([warm], 'BACK SQUAT', NOW)).toHaveLength(1);

    // …but genuine high-rep work is kept: 15 @ RPE 8 is 17 from failure and is
    // a real working set, which a distance-based cutoff would have discarded.
    const highRep = sess('b', 1, [set(60, 15, 8)]);
    expect(observationsFor([highRep], 'BACK SQUAT', NOW)).toHaveLength(1);
  });
});

describe('buildLoadModel — learning the lifter', () => {
  it('recovers the weight for a target reps and RPE', () => {
    const m = buildLoadModel(goodHistory(), 'BACK SQUAT', NOW);
    expect(m.confidence).toBe('good');
    // 5 @ RPE 8 is 7 from failure -> 120 - 28 = 92
    expect(m.predict(5, 8)!).toBeCloseTo(92, 0);
  });

  it('measures the lifter\'s own kilos per RPE point', () => {
    const m = buildLoadModel(goodHistory(), 'BACK SQUAT', NOW);
    // The textbook 3% of ~92kg would be 2.8; this lifter's real figure is 4.
    expect(m.kgPerRpe).toBeCloseTo(4, 0);
  });

  it('prescribes more weight for a harder target', () => {
    const m = buildLoadModel(goodHistory(), 'BACK SQUAT', NOW);
    expect(m.predict(5, 9)!).toBeGreaterThan(m.predict(5, 7)!);
  });
});

describe('buildLoadModel — bad days', () => {
  it('is barely moved by one rough session', () => {
    const clean = buildLoadModel(goodHistory(), 'BACK SQUAT', NOW);
    // A day where everything felt two points harder than it should have.
    const withBadDay = [
      ...goodHistory(),
      sess('bad', 4, [
        set(truth(repsToFailure(8, 7)), 8, 9),
        set(truth(repsToFailure(6, 8)), 6, 10),
        set(truth(repsToFailure(4, 9)), 4, 10),
      ]),
    ];
    const m = buildLoadModel(withBadDay, 'BACK SQUAT', NOW);
    expect(m.offDays).toContain('bad');
    // The prescription barely moves rather than collapsing.
    expect(Math.abs(m.predict(5, 8)! - clean.predict(5, 8)!)).toBeLessThan(3);
  });

  it('does not learn from a session the lifter marked rough', () => {
    const flagged = [
      ...goodHistory(),
      sess('bad', 4, [set(60, 8, 10), set(55, 6, 10), set(50, 4, 10)], { roughDay: true }),
    ];
    const m = buildLoadModel(flagged, 'BACK SQUAT', NOW);
    const clean = buildLoadModel(goodHistory(), 'BACK SQUAT', NOW);
    expect(m.predict(5, 8)).toBeCloseTo(clean.predict(5, 8)!, 1);
  });

  it('does follow a real, sustained drop', () => {
    // Three consecutive sessions genuinely weaker is not a bad day.
    const weaker = (id: string, d: number) =>
      sess(id, d, [set(truth(repsToFailure(8, 7)) - 12, 8, 7), set(truth(repsToFailure(5, 8)) - 12, 5, 8), set(truth(repsToFailure(3, 9)) - 12, 3, 9)]);
    const m = buildLoadModel(
      [...goodHistory().slice(0, 2), weaker('w1', 6), weaker('w2', 4), weaker('w3', 1)],
      'BACK SQUAT',
      NOW,
    );
    const clean = buildLoadModel(goodHistory(), 'BACK SQUAT', NOW);
    expect(m.predict(5, 8)!).toBeLessThan(clean.predict(5, 8)!);
  });
});

describe('buildLoadModel — recency', () => {
  it('follows recent strength rather than an old level', () => {
    const old = [
      sess('o1', 150, [set(60, 8, 7), set(64, 6, 8), set(70, 4, 9)]),
      sess('o2', 140, [set(60, 8, 8), set(66, 5, 8), set(72, 3, 9)]),
    ];
    const m = buildLoadModel([...old, ...goodHistory()], 'BACK SQUAT', NOW);
    // Prediction should track the recent, stronger data, not the old numbers.
    expect(m.predict(5, 8)!).toBeGreaterThan(85);
  });
});

describe('buildLoadModel — refusing to answer', () => {
  it('says nothing without data', () => {
    const m = buildLoadModel([], 'BACK SQUAT', NOW);
    expect(m.confidence).toBe('none');
    expect(m.reason).toBe('no-data');
    expect(m.predict(5, 8)).toBeNull();
  });

  it('says nothing from a handful of sets', () => {
    const m = buildLoadModel([sess('a', 1, [honestSet(5, 8), honestSet(6, 8)])], 'BACK SQUAT', NOW);
    expect(m.reason).toBe('too-few');
  });

  it('says nothing when every set sat at the same distance from failure', () => {
    const same = [
      sess('a', 5, [honestSet(5, 8), honestSet(5, 8), honestSet(5, 8)]),
      sess('b', 2, [honestSet(5, 8), honestSet(5, 8), honestSet(5, 8)]),
    ];
    expect(buildLoadModel(same, 'BACK SQUAT', NOW).reason).toBe('no-spread');
  });

  it('goes quiet after a long layoff instead of quoting an old curve', () => {
    const stale = goodHistory().map((s) => ({
      ...s,
      date: new Date(Date.parse(s.date) - 60 * DAY).toISOString(),
      completedAt: new Date(Date.parse(s.completedAt!) - 60 * DAY).toISOString(),
    }));
    const m = buildLoadModel(stale, 'BACK SQUAT', NOW);
    expect(m.reason).toBe('stale');
    expect(m.predict(5, 8)).toBeNull();
  });

  it('drops to low confidence when recent sessions disagree wildly', () => {
    const noisy = [
      sess('a', 12, [set(70, 8, 7), set(130, 6, 8), set(60, 4, 9)]),
      sess('b', 8, [set(140, 8, 8), set(65, 5, 8), set(120, 3, 9)]),
      sess('c', 3, [set(60, 10, 7), set(135, 6, 9), set(70, 4, 8)]),
    ];
    const m = buildLoadModel(noisy, 'BACK SQUAT', NOW);
    expect(m.confidence).not.toBe('good');
  });
});
