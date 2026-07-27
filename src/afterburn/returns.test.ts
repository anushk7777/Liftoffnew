import { describe, it, expect } from 'vitest';
import { liftReturns, deadWeight, substitutionIndex } from './returns';
import type { WorkoutProgram, WorkoutSession } from './types';

const NOW = new Date('2026-07-27T12:00:00.000Z');
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

/** A session logging one lift for `sets` sets at a given weight × reps. */
const s = (
  id: string,
  daysAgo: number,
  lifts: [name: string, weight: number, reps: number, sets: number][],
  extra: Partial<WorkoutSession> = {},
): WorkoutSession =>
  ({
    id,
    date: ago(daysAgo),
    completedAt: ago(daysAgo),
    entries: lifts.map(([name, weight, reps, sets]) => ({
      name,
      sets: Array.from({ length: sets }, () => ({ weight: String(weight), reps: String(reps), done: true })),
    })),
    ...extra,
  }) as unknown as WorkoutSession;

const find = (rs: ReturnType<typeof liftReturns>, name: string) => rs.find((r) => r.name === name)!;

describe('liftReturns', () => {
  it('says unknown rather than flat when there is not enough evidence', () => {
    // Two sessions is not a trend, and calling it "flat" would have someone
    // drop a lift they have barely started.
    const rs = liftReturns([s('a', 20, [['DB Curl', 12, 10, 3]]), s('b', 10, [['DB Curl', 12, 10, 3]])], null, 90, NOW);
    expect(find(rs, 'DB Curl').verdict).toBe('unknown');
  });

  it('says unknown when three sessions are crammed into a few days', () => {
    const rs = liftReturns(
      [3, 2, 1].map((d, i) => s(`x${i}`, d, [['DB Curl', 12, 10, 3]])),
      null, 90, NOW,
    );
    expect(find(rs, 'DB Curl').verdict).toBe('unknown');
    expect(find(rs, 'DB Curl').spanDays).toBeLessThan(14);
  });

  it('calls a lift that has gone nowhere flat', () => {
    const rs = liftReturns(
      [60, 45, 30, 15, 1].map((d, i) => s(`p${i}`, d, [['Pec Deck', 40, 12, 3]])),
      null, 90, NOW,
    );
    const r = find(rs, 'Pec Deck');
    expect(r.verdict).toBe('flat');
    expect(r.sets).toBe(15);
    expect(Math.abs(r.gain)).toBeLessThan(1);
  });

  it('calls a lift that is climbing working, and reports the return per ten sets', () => {
    // 100 -> 120 kg over 60 days, 3 sets a session, 5 sessions = 15 sets.
    const weights = [100, 105, 110, 115, 120];
    const rs = liftReturns(
      [60, 45, 30, 15, 1].map((d, i) => s(`q${i}`, d, [['High-Bar Back Squat', weights[i], 8, 3]])),
      null, 90, NOW,
    );
    const r = find(rs, 'High-Bar Back Squat');
    expect(['working', 'strong']).toContain(r.verdict);
    expect(r.gain).toBeGreaterThan(20); // e1RM scales above raw weight
    expect(r.perTenSets).toBeCloseTo((r.gain / r.sets) * 10, 1);
  });

  it('spots a lift that is going backwards', () => {
    const weights = [120, 115, 110, 105, 100];
    const rs = liftReturns(
      [60, 45, 30, 15, 1].map((d, i) => s(`r${i}`, d, [['Leg Press', weights[i], 10, 3]])),
      null, 90, NOW,
    );
    expect(find(rs, 'Leg Press').verdict).toBe('declining');
    expect(find(rs, 'Leg Press').gain).toBeLessThan(0);
  });

  it('is not decided by one bad day at the end', () => {
    // Four sessions climbing hard, then one poor one. A least-squares fit let
    // that single session dominate — squaring its residual wrecked both the
    // slope and the scatter estimate, so the lift read as no trend at all.
    // Theil-Sen takes the MEDIAN pairwise slope, so the outlier is outvoted.
    const weights = [100, 108, 116, 124, 104];
    const rs = liftReturns(
      [60, 45, 30, 15, 1].map((d, i) => s(`t${i}`, d, [['Bench Press', weights[i], 8, 3]])),
      null, 90, NOW,
    );
    expect(find(rs, 'Bench Press').gain).toBeGreaterThan(0);
    // It must not be called a decline, whatever else it is called.
    expect(find(rs, 'Bench Press').verdict).not.toBe('declining');
  });

  it('admits it cannot tell, instead of calling a noisy lift flat', () => {
    // Strength never moves, but the sessions scatter wildly. "Flat" would be a
    // finding; the honest answer is that nothing could have been seen either
    // way — and crucially this must NOT trigger a swap suggestion.
    const noisy = [70, 130, 75, 125, 80, 120];
    const rs = liftReturns(
      [75, 60, 45, 30, 15, 1].map((d, i) => s(`n${i}`, d, [['Cable Fly', noisy[i], 10, 3]])),
      null, 90, NOW,
    );
    const r = find(rs, 'Cable Fly');
    expect(r.verdict).toBe('unknown');
    expect(r.diagnosis).toBeNull();
  });

  it('ignores sessions flagged as a rough day', () => {
    const clean = [60, 45, 30, 15].map((d, i) => s(`c${i}`, d, [['DB Curl', 12 + i * 2, 10, 3]]));
    const withRough = [...clean, s('bad', 1, [['DB Curl', 6, 10, 3]], { roughDay: true })];
    const a = find(liftReturns(clean, null, 90, NOW), 'DB Curl');
    const b = find(liftReturns(withRough, null, 90, NOW), 'DB Curl');
    expect(b.gain).toBe(a.gain);
    expect(b.sets).toBe(a.sets); // the rough day's sets are not charged either
  });

  it('ignores work older than the window', () => {
    const rs = liftReturns(
      [200, 190, 180].map((d, i) => s(`o${i}`, d, [['Ancient Lift', 50, 10, 3]])),
      null, 90, NOW,
    );
    expect(rs.find((r) => r.name === 'Ancient Lift')).toBeUndefined();
  });

  it('ranks the best return first and sinks the unjudgeable to the bottom', () => {
    const climbing = [60, 45, 30, 15].map((d, i) => s(`g${i}`, d, [['Squat', 100 + i * 8, 8, 3]]));
    const stuck = [60, 45, 30, 15].map((d, i) => s(`h${i}`, d, [['Pec Deck', 40, 12, 3]]));
    const brandNew = [s('n1', 3, [['New Lift', 20, 10, 3]])];
    const rs = liftReturns([...climbing, ...stuck, ...brandNew], null, 90, NOW);
    expect(rs[0].name).toBe('Squat');
    expect(rs[rs.length - 1].name).toBe('New Lift');
    expect(rs[rs.length - 1].verdict).toBe('unknown');
  });
});

describe('substitutions', () => {
  const program = {
    name: 'P', unit: 'kg', custom: [],
    weeks: [{ id: 'w1', name: 'W1', days: [{ id: 'd1', name: 'D1', source: 'powerbuilding', exercises: [
      { id: 'e1', name: 'Pec Deck', warmup: '1', workingSets: 3, reps: '12', rpe: '9', lastSetRpe: '10', rest: '1m',
        substitutions: ['Bent-Over Cable Pec Flye', 'DB Flye'] },
    ] }] }],
  } as unknown as WorkoutProgram;

  it('offers the program its own sanctioned swaps', () => {
    const rs = liftReturns(
      [60, 45, 30, 15].map((d, i) => s(`p${i}`, d, [['Pec Deck', 40, 12, 3]])),
      program, 90, NOW,
    );
    expect(find(rs, 'Pec Deck').substitutions).toEqual(['Bent-Over Cable Pec Flye', 'DB Flye']);
  });

  it('indexes substitutions by exact exercise name', () => {
    expect(substitutionIndex(program).get('Pec Deck')).toHaveLength(2);
    expect(substitutionIndex(null).size).toBe(0);
  });

  it('offers alternatives to a lift you swapped IN, not just the sheet default', () => {
    // Once you swap to DB Flye, that name is not a program slot — so it would
    // be the one lift that never gets alternatives, which is backwards.
    const idx = substitutionIndex(program);
    expect(idx.get('DB Flye')).toEqual(['Pec Deck', 'Bent-Over Cable Pec Flye']);
    expect(idx.get('Bent-Over Cable Pec Flye')).toEqual(['Pec Deck', 'DB Flye']);
  });
});

describe('deadWeight', () => {
  it('surfaces only lifts that are both stuck and expensive', () => {
    const stuck = [60, 45, 30, 15].map((d, i) => s(`p${i}`, d, [['Pec Deck', 40, 12, 3]]));
    const stuckButCheap = [60, 45, 30, 15].map((d, i) => s(`c${i}`, d, [['Calf Raise', 40, 12, 1]]));
    const rs = liftReturns([...stuck, ...stuckButCheap], null, 90, NOW);
    const dead = deadWeight(rs, 6).map((r) => r.name);
    expect(dead).toContain('Pec Deck'); // 12 sets for nothing
    expect(dead).not.toContain('Calf Raise'); // only 4 sets — not worth a nudge
  });
});

describe('diagnosing a flat lift', () => {
  const prog = {
    name: 'P', unit: 'kg', custom: [],
    weeks: [{ id: 'w1', name: 'W1', days: [{ id: 'd1', name: 'D1', source: 'powerbuilding', exercises: [
      { id: 'e1', name: 'Pec Deck', warmup: '1', workingSets: 3, reps: '12', rpe: '~9', lastSetRpe: '10', rest: '1m', substitutions: ['DB Flye'] },
    ] }] }],
  } as unknown as WorkoutProgram;

  const withRpe = (id: string, daysAgo: number, weight: number, rpe: string): WorkoutSession =>
    ({ id, date: ago(daysAgo), completedAt: ago(daysAgo),
       entries: [{ name: 'Pec Deck', sets: Array.from({ length: 3 }, () => ({ weight: String(weight), reps: '12', rpe, done: true })) }] }) as unknown as WorkoutSession;

  it('blames effort first when the sets were nowhere near failure', () => {
    // Sheet asks RPE 9, logged at 7 throughout. Swapping the exercise would
    // just get you a new exercise done at RPE 7.
    const rs = liftReturns([60, 45, 30, 15].map((d, i) => withRpe(`e${i}`, d, 40, '7')), prog, 90, NOW);
    const r = find(rs, 'Pec Deck');
    expect(r.verdict).toBe('flat');
    expect(r.diagnosis?.cause).toBe('effort');
    expect(r.diagnosis?.targetRpe).toBe(9); // "~9" parsed
  });

  it('separates a weight that dropped from one that never moved', () => {
    const dropped = liftReturns([60, 45, 30, 15].map((d, i) => withRpe(`d${i}`, d, 50 - i * 2, '9')), prog, 90, NOW);
    expect(find(dropped, 'Pec Deck').diagnosis?.cause).toBe('load-dropping');
    expect(find(dropped, 'Pec Deck').diagnosis?.loadChange).toBeLessThan(0);

    const stuckLoad = liftReturns([60, 45, 30, 15].map((d, i) => withRpe(`s${i}`, d, 40, '9')), prog, 90, NOW);
    expect(find(stuckLoad, 'Pec Deck').diagnosis?.cause).toBe('load-static');
  });

  it('only blames the exercise once effort and load are ruled out', () => {
    // Trained hard, load nudged up, and the strength still did not follow.
    const rs = liftReturns([60, 45, 30, 15].map((d, i) => withRpe(`x${i}`, d, 40 + i * 0.2, '9')), prog, 90, NOW);
    const r = find(rs, 'Pec Deck');
    expect(r.diagnosis?.cause).toBe('exercise');
    expect(r.substitutions).toContain('DB Flye');
  });

  it('does not diagnose a lift that is working', () => {
    const rs = liftReturns([60, 45, 30, 15].map((d, i) => withRpe(`w${i}`, d, 40 + i * 6, '9')), prog, 90, NOW);
    expect(find(rs, 'Pec Deck').diagnosis).toBeNull();
  });
});
