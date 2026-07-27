import { describe, it, expect } from 'vitest';
import { classifyExercise, muscleSetsByWeek, analyzeVolume, LANDMARKS } from './volume';
import type { WorkoutSession } from './types';

// Build a session with N entries, each a name + a count of completed sets.
const sess = (id: string, date: string, lifts: [name: string, sets: number][], week?: { id: string; name: string }): WorkoutSession =>
  ({
    id,
    date,
    weekId: week?.id,
    weekName: week?.name,
    entries: lifts.map(([name, n]) => ({
      name,
      sets: Array.from({ length: n }, () => ({ weight: '100', reps: '8', done: true })),
    })),
  }) as unknown as WorkoutSession;

describe('classifyExercise', () => {
  it('maps compound lifts to primary + secondary muscles', () => {
    expect(classifyExercise('Barbell Bench Press')).toEqual({ primary: ['chest'], secondary: ['triceps', 'shoulders'] });
    expect(classifyExercise('Lat Pulldown')).toEqual({ primary: ['back'], secondary: ['biceps'] });
    expect(classifyExercise('Romanian Deadlift')).toEqual({ primary: ['hamstrings'], secondary: ['glutes', 'back'] });
    expect(classifyExercise('Back Squat')).toEqual({ primary: ['quads'], secondary: ['glutes'] });
  });

  it('disambiguates lookalike names via rule ordering', () => {
    expect(classifyExercise('Seated Leg Curl')?.primary).toEqual(['hamstrings']); // not biceps "curl"
    expect(classifyExercise('Upright Row')?.primary).toEqual(['shoulders']); // not back "row"
    expect(classifyExercise('Overhead Press')?.primary).toEqual(['shoulders']); // not triceps "overhead extension"
    expect(classifyExercise('Overhead Tricep Extension')?.primary).toEqual(['triceps']);
    expect(classifyExercise('Close-Grip Bench Press')?.primary).toEqual(['triceps']); // before chest "bench"
    expect(classifyExercise('Standing Calf Raise')?.primary).toEqual(['calves']); // before "lateral raise"
    expect(classifyExercise('Hammer Curl')).toEqual({ primary: ['biceps'], secondary: ['forearms'] });
  });

  it('returns null for unrecognized names', () => {
    expect(classifyExercise('Underwater Basket Weaving')).toBeNull();
  });
});

describe('muscleSetsByWeek', () => {
  it('credits 1.0 to primary and 0.5 to secondary muscles per hard set', () => {
    // 3 bench sets → chest 3, triceps 1.5, shoulders 1.5.
    const wk = muscleSetsByWeek([sess('a', '2026-03-10T10:00:00.000Z', [['Bench Press', 3]])]);
    expect(wk).toHaveLength(1);
    expect(wk[0].sets.chest).toBe(3);
    expect(wk[0].sets.triceps).toBe(1.5);
    expect(wk[0].sets.shoulders).toBe(1.5);
  });

  it('counts bodyweight sets (no weight) that have reps or are marked done', () => {
    const s = {
      id: 'p',
      date: '2026-03-10T10:00:00.000Z',
      entries: [{ name: 'Pull Up', sets: [{ weight: '', reps: '10', done: false }, { weight: '', reps: '', done: true }] }],
    } as unknown as WorkoutSession;
    expect(muscleSetsByWeek([s])[0].sets.back).toBe(2);
  });

  it('buckets sessions into Monday-start weeks', () => {
    const wk = muscleSetsByWeek([
      sess('a', '2026-03-10T10:00:00.000Z', [['Bench Press', 2]]), // Tue
      sess('b', '2026-03-17T10:00:00.000Z', [['Bench Press', 2]]), // next Tue
    ]);
    expect(wk).toHaveLength(2);
  });
});

describe('analyzeVolume', () => {
  it('flags a muscle below MEV with an add-sets recommendation', () => {
    // 1 bench session, 3 sets → chest 3, well under MEV 10.
    const r = analyzeVolume([sess('a', '2026-03-10T10:00:00.000Z', [['Bench Press', 3]])]);
    const chest = r.muscles.find((m) => m.muscle === 'chest')!;
    expect(chest.status).toBe('below');
    expect(chest.sets).toBe(3);
    expect(chest.suggestedSets).toBe(LANDMARKS.chest.mev);
  });

  it('flags excessive volume over MRV', () => {
    // 30 bench sets → chest 30, over MRV 22.
    const r = analyzeVolume([sess('a', '2026-03-10T10:00:00.000Z', [['Bench Press', 30]])]);
    const chest = r.muscles.find((m) => m.muscle === 'chest')!;
    expect(chest.status).toBe('excessive');
    expect(chest.suggestedSets).toBe(LANDMARKS.chest.mav);
  });

  it('marks volume inside the MEV–MAV band as optimal', () => {
    // 14 chest-fly sets → chest 14 (isolation, no secondary), within 10–18.
    const r = analyzeVolume([sess('a', '2026-03-10T10:00:00.000Z', [['Cable Fly', 14]])]);
    const chest = r.muscles.find((m) => m.muscle === 'chest')!;
    expect(chest.status).toBe('optimal');
  });

  it('lists never-trained muscles as neglected and surfaces unclassified names', () => {
    const r = analyzeVolume([sess('a', '2026-03-10T10:00:00.000Z', [['Bench Press', 3], ['Mystery Machine', 2]])]);
    expect(r.neglected).toContain('quads');
    expect(r.unclassified).toContain('Mystery Machine');
    expect(r.hasData).toBe(true);
  });

  it('computes a week-over-week direction', () => {
    const r = analyzeVolume([
      sess('a', '2026-03-10T10:00:00.000Z', [['Cable Fly', 5]]),
      sess('b', '2026-03-17T10:00:00.000Z', [['Cable Fly', 12]]),
    ]);
    const chest = r.muscles.find((m) => m.muscle === 'chest')!;
    expect(chest.sets).toBe(12);
    expect(chest.prevSets).toBe(5);
    expect(chest.dir).toBe('up');
  });

  it('handles no data', () => {
    expect(analyzeVolume([]).hasData).toBe(false);
  });

  it('uses a trailing 7-day window, aggregating across a calendar-week boundary', () => {
    // Sun then the following Wed (4 days apart) fall in different Monday buckets,
    // but a rolling 7-day window ending at the latest session captures both.
    const r = analyzeVolume([
      sess('a', '2026-03-15T10:00:00.000Z', [['Cable Fly', 4]]), // Sunday
      sess('b', '2026-03-18T10:00:00.000Z', [['Cable Fly', 4]]), // Wednesday
    ]);
    const chest = r.muscles.find((m) => m.muscle === 'chest')!;
    expect(chest.sets).toBe(8); // both sessions counted, not split into two weeks
  });

  it('excludes sessions older than 7 days from the current window', () => {
    const r = analyzeVolume([
      sess('old', '2026-03-01T10:00:00.000Z', [['Cable Fly', 10]]), // >7d before anchor
      sess('now', '2026-03-18T10:00:00.000Z', [['Cable Fly', 3]]),
    ]);
    const chest = r.muscles.find((m) => m.muscle === 'chest')!;
    expect(chest.sets).toBe(3); // only the recent session
  });
});

describe('analyzeVolume — program-week (microcycle) mode', () => {
  const w1 = { id: 'w1', name: 'Week 1 · Build' };
  const w2 = { id: 'w2', name: 'Week 2 · Build' };

  it('counts a whole 9-day program week as one window (no 7-day cutoff)', () => {
    const r = analyzeVolume([
      sess('a', '2026-03-09T10:00:00.000Z', [['Cable Fly', 6]], w1),
      sess('b', '2026-03-17T10:00:00.000Z', [['Cable Fly', 6]], w1), // 8 days later, same program week
    ]);
    const chest = r.muscles.find((m) => m.muscle === 'chest')!;
    // Raw tally is unchanged: a trailing-7-day window would have dropped session a.
    expect(chest.rawSets).toBe(12);
    // Judged as a rate, because the landmarks are sets per SEVEN days and this
    // microcycle spans nine: 12 over 9 days is 9.3 a week, not 12.
    expect(r.windowDays).toBe(9);
    expect(chest.sets).toBeCloseTo(9.5, 1);
    expect(chest.sets).toBeLessThan(chest.rawSets);
    expect(r.windowLabel).toBe('Week 1 · Build');
  });

  it('starts the tally anew when the next program week begins', () => {
    const r = analyzeVolume([
      sess('a', '2026-03-09T10:00:00.000Z', [['Cable Fly', 6]], w1),
      sess('b', '2026-03-17T10:00:00.000Z', [['Cable Fly', 6]], w1),
      sess('c', '2026-03-19T10:00:00.000Z', [['Cable Fly', 4]], w2), // Week 2, 2 days after w1 ended
    ]);
    const chest = r.muscles.find((m) => m.muscle === 'chest')!;
    expect(chest.rawSets).toBe(4); // only Week 2 — Week 1 concluded
    // Both windows are put on the same 7-day basis before being compared.
    expect(chest.sets).toBeLessThan(chest.prevSets);
    expect(r.windowLabel).toBe('Week 2 · Build');
  });

  // The bug this normalisation exists for. Pure Bodybuilding runs eight
  // training days, which with rest days lands around eleven calendar days.
  it('does not call a normal 11-day microcycle "over MRV"', () => {
    const days = [0, 1, 2, 4, 5, 6, 8, 10];
    const sessions = days.map((d, i) =>
      sess(
        `s${i}`,
        new Date(Date.UTC(2026, 2, 9 + d, 10)).toISOString(),
        [['Cable Fly', 3]], // 24 chest sets across the cycle — above the 22 MRV
        w1,
      ),
    );
    const r = analyzeVolume(sessions);
    const chest = r.muscles.find((m) => m.muscle === 'chest')!;

    expect(r.windowDays).toBe(11);
    expect(chest.rawSets).toBe(24); // more than MRV as a raw total…
    expect(chest.sets).toBeCloseTo(15.5, 0); // …but ~15 a week, which is productive
    expect(chest.status).not.toBe('excessive');
    expect(chest.status).toBe('optimal');
  });

  it('still flags genuinely excessive volume once normalised', () => {
    const days = [0, 1, 2, 4, 5, 6, 8, 10];
    const sessions = days.map((d, i) =>
      sess(`s${i}`, new Date(Date.UTC(2026, 2, 9 + d, 10)).toISOString(), [['Cable Fly', 6]], w1),
    );
    const r = analyzeVolume(sessions);
    const chest = r.muscles.find((m) => m.muscle === 'chest')!;
    expect(chest.sets).toBeGreaterThan(chest.landmark.mrv);
    expect(chest.status).toBe('excessive');
  });
});
