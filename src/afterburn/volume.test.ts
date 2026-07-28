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

  // Found on review: the in-progress cycle was informing its own denominator.
  it('does not inflate the rate from a cycle still in progress', () => {
    const finished = [0, 1, 2, 4, 5, 6, 8, 10].map((d, i) =>
      sess(`f${i}`, new Date(Date.UTC(2026, 2, 9 + d, 10)).toISOString(), [['Cable Fly', 2]], w1),
    );
    // Three days into the next cycle, six chest sets in.
    const started = [0, 1, 2].map((d, i) =>
      sess(`n${i}`, new Date(Date.UTC(2026, 2, 23 + d, 10)).toISOString(), [['Cable Fly', 2]], w2),
    );
    const r = analyzeVolume([...finished, ...started]);
    // The finished 11-day cycle sets the basis, not the 3 days done so far.
    expect(r.windowDays).toBe(11);
    const chest = r.muscles.find((m) => m.muscle === 'chest')!;
    expect(chest.rawSets).toBe(6);
    expect(chest.sets).toBeCloseTo(3.8, 0); // 6 over 11 days, not 6 over 3
    expect(chest.status).not.toBe('excessive');
  });

  it('leaves the rate alone until a cycle has actually finished', () => {
    // Nothing complete yet, so there is no measured cycle length to scale by.
    const r = analyzeVolume(
      [0, 1, 2].map((d, i) =>
        sess(`n${i}`, new Date(Date.UTC(2026, 2, 23 + d, 10)).toISOString(), [['Cable Fly', 3]], w1),
      ),
    );
    expect(r.windowDays).toBe(7);
    const chest = r.muscles.find((m) => m.muscle === 'chest')!;
    expect(chest.sets).toBe(chest.rawSets);
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

// Reported from a real screen: one session into week 3, the card read
// "Week 3 · Build: 12 under-trained" and told the lifter to add sets to every
// muscle. One eighth of a week's work had genuinely been done, so the shortfall
// was arithmetic rather than a finding.
describe('analyzeVolume — a program week still in progress', () => {
  const w1 = { id: 'w1', name: 'Week 1 · Build' };
  const w2 = { id: 'w2', name: 'Week 2 · Build' };
  // Two weeks of four prescribed days each.
  const program = {
    weeks: [
      { id: 'w1', name: 'Week 1 · Build', days: [{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }, { id: 'd4' }] },
      { id: 'w2', name: 'Week 2 · Build', days: [{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }, { id: 'd4' }] },
    ],
  } as never;
  const day = (id: string, dayId: string, dayN: number, lifts: [string, number][], week: { id: string; name: string }) =>
    ({ ...sess(id, new Date(Date.UTC(2026, 2, dayN, 10)).toISOString(), lifts, week), dayId }) as WorkoutSession;

  const fullW1 = [1, 2, 3, 4].map((n) => day(`a${n}`, `d${n}`, 8 + n, [['Cable Fly', 4]], w1));
  // These fixtures are dated March 2026. "In progress" now expires, so `now` has
  // to be anchored near the sessions or every week reads as long abandoned.
  const soon = (sessions: WorkoutSession[]) =>
    new Date(Math.max(...sessions.map((x) => Date.parse(x.completedAt ?? x.date))) + 86_400_000);

  it('reads the last COMPLETE week and reports the pending one separately', () => {
    const started = [day('b1', 'd1', 20, [['Cable Fly', 1]], w2)]; // 1 of 4 days
    const all = [...fullW1, ...started];
    const r = analyzeVolume(all, program, soon(all));

    expect(r.windowLabel).toBe('Week 1 · Build');
    expect(r.inProgress).toEqual({ label: 'Week 2 · Build', done: 1, total: 4 });
    expect(r.provisional).toBe(false);
    // 16 chest sets from the finished week, not the 1 logged so far.
    expect(r.muscles.find((m) => m.muscle === 'chest')!.rawSets).toBe(16);
  });

  it('withholds the verdict when there is no complete week to fall back on', () => {
    const only = [day('b1', 'd1', 20, [['Cable Fly', 1]], w1)];
    const r = analyzeVolume(only, program, soon(only));
    expect(r.provisional).toBe(true);
    expect(r.inProgress).toEqual({ label: 'Week 1 · Build', done: 1, total: 4 });
    // The headline states what was logged; it does not name a shortfall.
    expect(r.headline).toContain('1 of 4 days in');
    expect(r.headline).not.toContain('under-trained');
  });

  it('judges the week normally once every prescribed day is logged', () => {
    const r = analyzeVolume(fullW1, program, soon(fullW1));
    expect(r.inProgress).toBeNull();
    expect(r.provisional).toBe(false);
    expect(r.windowLabel).toBe('Week 1 · Build');
    expect(r.headline).toContain('Week 1 · Build:');
  });

  it('behaves exactly as before when no program is supplied', () => {
    const started = [day('b1', 'd1', 20, [['Cable Fly', 1]], w2)];
    const r = analyzeVolume([...fullW1, ...started], null, soon([...fullW1, ...started]));
    expect(r.inProgress).toBeNull();
    expect(r.provisional).toBe(false);
    expect(r.windowLabel).toBe('Week 2 · Build');
  });
});

// "What if I end early, leave a workout half done, or skip one completely?"
// Each of these was measured; two of them used to leave the card stuck on an
// older week permanently.
describe('analyzeVolume — real-life interruptions', () => {
  const DAY = 86_400_000;
  const t0 = Date.UTC(2026, 5, 1, 10);
  const program = {
    weeks: [1, 2, 3].map((w) => ({
      id: `w${w}`, name: `Week ${w}`, days: [1, 2, 3, 4].map((d) => ({ id: `d${d}` })),
    })),
  } as never;
  const day = (weekId: string, dayId: string, offset: number, sets: number, endedEarly = false) =>
    ({
      id: `${weekId}-${dayId}`, dayId, weekId, weekName: `Week ${weekId.slice(1)}`,
      date: new Date(t0 + offset * DAY).toISOString(),
      completedAt: new Date(t0 + offset * DAY).toISOString(),
      endedEarly: endedEarly || undefined,
      entries: [{ name: 'Cable Fly', sets: Array.from({ length: sets }, () => ({ weight: '50', reps: '10', done: true })) }],
    }) as unknown as WorkoutSession;
  const full = (weekId: string, start: number, days = 4, sets = 3) =>
    Array.from({ length: days }, (_, i) => day(weekId, `d${i + 1}`, start + i * 2, sets));
  const at = (sessions: WorkoutSession[], daysAfterLast: number) =>
    new Date(Math.max(...sessions.map((x) => Date.parse(x.completedAt!))) + daysAfterLast * DAY);

  it('ending a workout early still completes the day, and the week', () => {
    // The day is logged, so it counts — the week is not held open by it.
    const sessions = [...full('w1', 0), ...full('w2', 10)];
    sessions[6] = day('w2', 'd3', 14, 1, true); // ended early, one set
    const r = analyzeVolume(sessions, program, at(sessions, 1));
    expect(r.inProgress).toBeNull();
    expect(r.provisional).toBe(false);
    expect(r.windowLabel).toBe('Week 2');
  });

  it('skipping a day and starting the next week reads the short week', () => {
    const sessions = [...full('w1', 0), ...full('w2', 10, 3), day('w3', 'd1', 20, 3)];
    const r = analyzeVolume(sessions, program, at(sessions, 1));
    expect(r.windowLabel).toBe('Week 2'); // 3 of 4 days, but it is what happened
    expect(r.inProgress).toEqual({ label: 'Week 3', done: 1, total: 4 });
  });

  it('skipping a day and stopping waits a while, then reads it anyway', () => {
    const sessions = [...full('w1', 0), ...full('w2', 10, 3)];
    // Right after: you might still finish it, so the last complete week stands.
    const soon = analyzeVolume(sessions, program, at(sessions, 1));
    expect(soon.windowLabel).toBe('Week 1');
    expect(soon.inProgress).toEqual({ label: 'Week 2', done: 3, total: 4 });
    // A month on you are not going to. Waiting forever would strand the card on
    // Week 1 and hide three logged sessions — the bug this test exists for.
    const later = analyzeVolume(sessions, program, at(sessions, 30));
    expect(later.windowLabel).toBe('Week 2');
    expect(later.inProgress).toBeNull();
  });

  it('abandoning a week after one session eventually reads that one session', () => {
    const sessions = [...full('w1', 0), day('w2', 'd1', 10, 3)];
    const later = analyzeVolume(sessions, program, at(sessions, 30));
    expect(later.windowLabel).toBe('Week 2');
    expect(later.provisional).toBe(false);
    expect(later.muscles.find((m) => m.muscle === 'chest')!.rawSets).toBe(3);
  });

  it('a slow but genuine week is not cut off early', () => {
    // Three of four days done, still inside one cycle plus the grace week.
    const sessions = [...full('w1', 0), ...full('w2', 10, 3)];
    const r = analyzeVolume(sessions, program, at(sessions, 5));
    expect(r.windowLabel).toBe('Week 1');
    expect(r.inProgress?.done).toBe(3);
  });
});

describe('muscles with no minimum effective volume', () => {
  const w1 = { id: 'w1', name: 'Week 1' };
  const legs = (lifts: [string, number][]) =>
    analyzeVolume([sess('a', '2026-03-09T10:00:00.000Z', lifts, w1)]);

  it('never calls an untrained optional muscle a shortfall', () => {
    // Adductors have MEV 0 — the compounds cover them. Skipping them is a
    // choice, so they must not appear as a missed muscle every single week.
    const r = legs([['Back Squat', 4]]);
    const add = r.muscles.find((m) => m.muscle === 'adductors')!;
    expect(add.sets).toBe(0);
    expect(add.status).not.toBe('untrained');
    expect(add.status).not.toBe('below');
    expect(r.neglected).not.toContain('adductors');
    // …and it must not pad the "dialed in" tally either.
    expect(r.headline).not.toContain('1 dialed in');
  });

  it('still counts the direct work when it is done', () => {
    const r = legs([['Machine Hip Adduction', 3]]);
    expect(r.muscles.find((m) => m.muscle === 'adductors')!.sets).toBe(3);
    expect(r.trained.map((m) => m.muscle)).toContain('adductors');
  });

  it('still enforces the ceiling on an optional muscle', () => {
    const r = legs([['Machine Hip Adduction', 20]]);
    const add = r.muscles.find((m) => m.muscle === 'adductors')!;
    expect(add.sets).toBeGreaterThan(LANDMARKS.adductors.mrv);
    expect(add.status).toBe('excessive');
  });
});
