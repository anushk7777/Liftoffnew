import { describe, it, expect } from 'vitest';
import { codeRecall, readNoteSignals, MAX_CUES } from './codeRecall';
import type { RecallBrief } from './codeRecall';
import type {
  LoggedSet,
  ProgramDay,
  RecoveryEntry,
  WorkoutProgram,
  WorkoutSession,
} from '../types';

// Code Recall's whole value rests on one thing: that it never says something it
// cannot back with the lifter's own numbers. So half of what follows tests the
// REFUSALS — a rule that fires on thin evidence is worse than no rule, because
// it teaches the lifter to ignore the ones that are right.

const NOW = new Date('2026-07-28T18:00:00');
const DAY_MS = 86_400_000;
const daysAgo = (n: number, h = 12) =>
  new Date(NOW.getTime() - n * DAY_MS - (18 - h) * 3_600_000).toISOString();

let seq = 0;
const set = (weight: number, reps: number, rpe?: number, rating = 0): LoggedSet => ({
  id: `s${seq++}`,
  weight: String(weight),
  reps: String(reps),
  rpe: rpe == null ? '' : String(rpe),
  rating,
  done: true,
});

const day = (over: Partial<ProgramDay> = {}): ProgramDay => ({
  id: 'push-a',
  name: 'Push A',
  source: 'powerbuilding',
  exercises: [
    { id: 'e1', name: 'Incline DB Press', workingSets: 3, reps: '8-10', rpe: '8' },
    { id: 'e2', name: 'Cable Flye', workingSets: 3, reps: '12-15', rpe: '9' },
  ],
  ...over,
});

function session(over: Partial<WorkoutSession> & { entries: WorkoutSession['entries'] }): WorkoutSession {
  return {
    id: `w${seq++}`,
    dayId: 'push-a',
    dayName: 'Push A',
    date: over.date ?? daysAgo(7),
    completedAt: over.completedAt ?? over.date ?? daysAgo(7),
    entries: [],
    ...over,
  };
}

const entry = (name: string, sets: LoggedSet[], notes = '') => ({
  exerciseId: name,
  name,
  target: { reps: '8-10', rpe: '8' },
  sets,
  notes,
});

/** A history that is deliberately unremarkable: on-target RPE, unrated sets,
 *  nothing to say. Rules must stay silent against this. */
function quietHistory(n = 6): WorkoutSession[] {
  return Array.from({ length: n }, (_, i) =>
    session({
      date: daysAgo((n - i) * 4),
      completedAt: daysAgo((n - i) * 4),
      entries: [
        entry('Incline DB Press', [set(30, 9, 8), set(30, 9, 8.5), set(30, 8, 8)]),
        entry('Cable Flye', [set(15, 13, 9), set(15, 12, 9)]),
      ],
    }),
  );
}

const brief = (over: Parameters<typeof codeRecall>[0]): RecallBrief =>
  codeRecall({ now: NOW, ...over });

const cueOf = (b: RecallBrief, kind: string) => b.cues.find((c) => c.kind === kind);
const has = (b: RecallBrief, kind: string) => b.cues.some((c) => c.kind === kind);

// ---------------------------------------------------------------------------

describe('the shape of a brief', () => {
  it('says nothing at all without a session to brief', () => {
    const b = brief({ day: null, sessions: quietHistory() });
    expect(b.cues).toEqual([]);
    expect(b.spark).toBeNull();
    expect(b.dayName).toBeNull();
  });

  it('never returns more cues than a person will read', () => {
    // Everything wrong at once: under-recovered, over target, badly rated,
    // a note waiting, a flat RPE, a technique to remember.
    const sessions = [
      ...quietHistory(),
      session({
        date: daysAgo(3),
        completedAt: daysAgo(3),
        entries: [
          entry('Incline DB Press', [set(35, 6, 10), set(35, 5, 10)], 'shoulder felt off'),
          entry('Cable Flye', [set(15, 12, 9, 1), set(15, 11, 9, 2)]),
        ],
      }),
    ];
    const b = brief({
      day: day(),
      sessions,
      recovery: [{ id: 'r', date: daysAgo(0, 10), co2Score: 20 } as RecoveryEntry],
    });
    expect(b.cues.length).toBeGreaterThan(0);
    expect(b.cues.length).toBeLessThanOrEqual(MAX_CUES);
  });

  it('does not spend the whole brief on one lift', () => {
    const sessions = [
      ...quietHistory(),
      session({
        date: daysAgo(3),
        completedAt: daysAgo(3),
        entries: [
          entry('Incline DB Press', [set(35, 6, 10, 1), set(35, 5, 10, 1)], 'this hurt'),
        ],
      }),
      session({
        date: daysAgo(6),
        completedAt: daysAgo(6),
        entries: [entry('Incline DB Press', [set(35, 6, 10, 1), set(35, 5, 10, 2)])],
      }),
    ];
    const b = brief({ day: day(), sessions });
    const named = b.cues.filter((c) => c.exercise).map((c) => c.exercise);
    expect(new Set(named).size).toBe(named.length);
  });

  it('reports how much history is behind it', () => {
    expect(brief({ day: day(), sessions: [] }).depth).toBe('none');
    expect(brief({ day: day(), sessions: quietHistory(2) }).depth).toBe('thin');
    expect(brief({ day: day(), sessions: quietHistory(6) }).depth).toBe('solid');
  });

  it('counts a session with nothing logged in it as no history', () => {
    const empty = session({ entries: [entry('Incline DB Press', [set(NaN as never, NaN as never)])] });
    expect(brief({ day: day(), sessions: [empty] }).depth).toBe('none');
  });

  it('every cue carries its evidence and its reason', () => {
    const b = brief({
      day: day(),
      sessions: quietHistory(),
      recovery: [{ id: 'r', date: daysAgo(0, 10), co2Score: 18 } as RecoveryEntry],
    });
    expect(b.cues.length).toBeGreaterThan(0);
    for (const c of b.cues) {
      expect(c.headline.length, c.id).toBeGreaterThan(10);
      expect(c.evidence.length, c.id).toBeGreaterThan(5);
      expect(c.basis.length, c.id).toBeGreaterThan(10);
    }
  });

  it('stays quiet on an unremarkable history rather than filling the slots', () => {
    const b = brief({ day: day(), sessions: quietHistory() });
    // No readiness data, nothing over or under target, nothing rated, no notes.
    expect(has(b, 'load')).toBe(false);
    expect(has(b, 'rating')).toBe(false);
    expect(has(b, 'readiness')).toBe(false);
    expect(has(b, 'note')).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('readiness', () => {
  // The baseline entries must be strictly OLDER than the one under test, or
  // `recoveryReadiness` picks one of them as "latest" and the age being tested
  // is not the age being read.
  const fresh = (score: number, hoursAgo = 8): RecoveryEntry[] => [
    { id: 'r1', date: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString(), co2Score: score },
    ...Array.from({ length: 6 }, (_, i) => ({
      id: `r${i + 2}`,
      date: new Date(NOW.getTime() - (hoursAgo + 24 * (i + 1)) * 3_600_000).toISOString(),
      co2Score: 55,
    })),
  ];

  it('turns a low reading into an instruction, not a diagnosis', () => {
    const c = cueOf(brief({ day: day(), sessions: quietHistory(), recovery: fresh(20) }), 'readiness')!;
    expect(c).toBeDefined();
    expect(c.headline).toMatch(/autoregulate/i);
    expect(c.evidence).toContain('CO2 20s');
    expect(c.evidence).toContain('55s baseline');
  });

  it('says go when the reading is above your own baseline', () => {
    const c = cueOf(brief({ day: day(), sessions: quietHistory(), recovery: fresh(70) }), 'readiness')!;
    expect(c.headline).toMatch(/green light/i);
  });

  it('refuses to quote a stale reading', () => {
    // A score from four days ago describes a Tuesday. Acting on it today is
    // worse than saying nothing.
    for (const hours of [37, 48, 96, 24 * 7]) {
      const b = brief({ day: day(), sessions: quietHistory(), recovery: fresh(20, hours) });
      expect(has(b, 'readiness'), `${hours}h`).toBe(false);
    }
    // …and is happy right up to the boundary.
    expect(has(brief({ day: day(), sessions: quietHistory(), recovery: fresh(20, 35) }), 'readiness')).toBe(true);
  });

  it('says nothing when the test has never been taken', () => {
    expect(has(brief({ day: day(), sessions: quietHistory(), recovery: [] }), 'readiness')).toBe(false);
  });

  it('ignores a reading dated in the future rather than treating it as fresh', () => {
    const ahead = [{ id: 'r', date: new Date(NOW.getTime() + 6 * 3_600_000).toISOString(), co2Score: 15 }];
    expect(has(brief({ day: day(), sessions: quietHistory(), recovery: ahead as RecoveryEntry[] }), 'readiness')).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('load, from the RPE actually logged', () => {
  const withLast = (sets: LoggedSet[]) => [
    ...quietHistory(4),
    session({ date: daysAgo(2), completedAt: daysAgo(2), entries: [entry('Incline DB Press', sets)] }),
  ];

  it('tells you to open lighter after an overshoot', () => {
    const c = cueOf(brief({ day: day(), sessions: withLast([set(35, 6, 10)]) }), 'load')!;
    expect(c.headline).toMatch(/lighter/);
    expect(c.exercise).toBe('Incline DB Press');
    expect(c.evidence).toContain('35kg × 6 @ RPE 10');
    expect(c.evidence).toContain('RPE 8');
    expect(c.evidence).toContain('2 days ago');
  });

  it('tells you to go up when you finished under target', () => {
    const c = cueOf(brief({ day: day(), sessions: withLast([set(30, 10, 6)]) }), 'load')!;
    expect(c.headline).toMatch(/room|go up/i);
  });

  it('stays silent inside the noise of rating your own effort', () => {
    // One point is not a signal; a point and a half is.
    expect(has(brief({ day: day(), sessions: withLast([set(30, 9, 9)]) }), 'load')).toBe(false);
    expect(has(brief({ day: day(), sessions: withLast([set(30, 9, 7)]) }), 'load')).toBe(false);
    expect(has(brief({ day: day(), sessions: withLast([set(30, 9, 9.5)]) }), 'load')).toBe(true);
  });

  it('reads the top set, not the last one logged', () => {
    // Back-off sets are lighter and easier by design; judging the load on them
    // would tell everyone to add weight after every session.
    const c = cueOf(brief({ day: day(), sessions: withLast([set(40, 5, 10), set(25, 12, 6)]) }), 'load')!;
    expect(c.evidence).toContain('40kg');
    expect(c.headline).toMatch(/lighter/);
  });

  it('ignores a day the lifter marked rough', () => {
    // A rough day makes everything read heavy and says nothing about the load.
    const hard = [set(35, 6, 10)];
    const rough = [
      ...quietHistory(4),
      session({ date: daysAgo(2), completedAt: daysAgo(2), roughDay: true, entries: [entry('Incline DB Press', hard)] }),
    ];
    // Same session, same numbers, without the flag — to prove the flag is what
    // silenced it rather than the fixture simply having nothing to say.
    const normal = [
      ...quietHistory(4),
      session({ date: daysAgo(2), completedAt: daysAgo(2), entries: [entry('Incline DB Press', hard)] }),
    ];
    expect(has(brief({ day: day(), sessions: rough }), 'load')).toBe(false);
    expect(cueOf(brief({ day: day(), sessions: normal }), 'load')!.evidence).toContain('35kg');
  });

  it('says nothing when the sheet names no target', () => {
    const noTarget = day({
      exercises: [{ id: 'e1', name: 'Incline DB Press', workingSets: 3, reps: '8-10' }],
    });
    expect(has(brief({ day: noTarget, sessions: withLast([set(35, 6, 10)]) }), 'load')).toBe(false);
  });

  it('says nothing when no RPE was recorded', () => {
    expect(has(brief({ day: day(), sessions: withLast([set(35, 6)]) }), 'load')).toBe(false);
  });

  it('speaks the lifter’s unit', () => {
    const c = cueOf(brief({ day: day(), sessions: withLast([set(80, 6, 10)]), unit: 'lb' }), 'load')!;
    expect(c.evidence).toContain('80lb');
  });
});

// ---------------------------------------------------------------------------

describe('the star ratings nothing was reading', () => {
  const rated = (ratings: number[][], rpe = 9) =>
    ratings.map((rs, i) =>
      session({
        date: daysAgo((ratings.length - i) * 4),
        completedAt: daysAgo((ratings.length - i) * 4),
        entries: [entry('Cable Flye', rs.map((r) => set(15, 12, rpe, r)))],
      }),
    );

  it('stops you loading a lift you keep rating badly', () => {
    const c = cueOf(brief({ day: day(), sessions: rated([[1, 2], [2, 1, 2]]) }), 'rating')!;
    expect(c).toBeDefined();
    expect(c.exercise).toBe('Cable Flye');
    expect(c.headline).toMatch(/not add weight/i);
    expect(c.evidence).toMatch(/2★ or worse/);
    // The effort was there — so it is not a loading problem, and the cue says so.
    expect(c.evidence).toContain('RPE 9');
    expect(c.basis).toMatch(/execution/i);
  });

  it('offers the sheet’s own alternatives instead of inventing one', () => {
    const program: WorkoutProgram = {
      name: 'p',
      unit: 'kg',
      custom: [],
      weeks: [
        {
          id: 'w1',
          name: 'Week 1',
          days: [
            day({
              exercises: [
                { id: 'e2', name: 'Cable Flye', workingSets: 3, reps: '12-15', rpe: '9', substitutions: ['Pec Deck', 'DB Flye'] },
              ],
            }),
          ],
        },
      ],
    };
    const c = cueOf(brief({ day: day(), sessions: rated([[1, 2], [2, 1, 2]]), program }), 'rating')!;
    expect(c.basis).toContain('Pec Deck');
  });

  it('names the lift you should be pushing', () => {
    // Rated highly AND comfortably under target: the least ambiguous "add load"
    // signal there is, and it was being thrown away.
    const c = cueOf(brief({ day: day(), sessions: rated([[5, 5], [4, 5, 5]], 7) }), 'rating')!;
    expect(c.headline).toMatch(/push today/i);
    expect(c.evidence).toContain('★');
  });

  it('needs a pattern, not one bad day', () => {
    // Both guards matter and they are separate. Four poor sets is enough SETS,
    // but all in one outing it is a bad session — a tweaked back, a rushed
    // lunch hour — and condemning the lift on it would be exactly the blind
    // recommending this engine exists to avoid.
    expect(has(brief({ day: day(), sessions: rated([[1, 1, 2, 1]]) }), 'rating')).toBe(false);
    // Too few sets, spread over enough sessions: also not enough.
    expect(has(brief({ day: day(), sessions: rated([[1], [2]]) }), 'rating')).toBe(false);
    // Two sessions and four sets is the bar.
    expect(has(brief({ day: day(), sessions: rated([[1, 1], [1, 1]]) }), 'rating')).toBe(true);
  });

  it('ignores unrated sets rather than counting them as zero stars', () => {
    // rating 0 means "not rated". Counting it would drag every mean to the floor
    // and condemn every lift the moment anyone skipped the stars.
    expect(has(brief({ day: day(), sessions: rated([[0, 0], [0, 0, 0]]) }), 'rating')).toBe(false);
  });

  it('does not condemn a lift that is merely hard', () => {
    // Middling stars at a hard prescribed RPE is what a working set looks like.
    expect(has(brief({ day: day(), sessions: rated([[3, 4], [3, 3, 4]]) }), 'rating')).toBe(false);
  });

  it('does not call a lift easy on the stars alone', () => {
    // Five stars at the prescribed effort is a good set, not an under-loaded one.
    expect(has(brief({ day: day(), sessions: rated([[5, 5], [5, 5]], 9) }), 'rating')).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('the session you cut short', () => {
  it('tells you to rebuild from what you finished', () => {
    const sessions = [
      ...quietHistory(3),
      session({
        date: daysAgo(2),
        completedAt: daysAgo(2),
        endedEarly: true,
        endNote: 'ran out of time',
        entries: [entry('Incline DB Press', [set(30, 9, 8)])],
      }),
    ];
    const c = cueOf(brief({ day: day(), sessions }), 'restart')!;
    expect(c.headline).toMatch(/what you finished/i);
    expect(c.evidence).toContain('1 of 2 lifts');
    expect(c.evidence).toContain('ran out of time');
  });

  it('covers a day marked rough too', () => {
    const sessions = [
      session({ date: daysAgo(4), completedAt: daysAgo(4), roughDay: true, entries: [entry('Incline DB Press', [set(30, 9, 8)])] }),
    ];
    expect(cueOf(brief({ day: day(), sessions }), 'restart')!.evidence).toMatch(/rough one/);
  });

  it('says nothing about a day that finished normally', () => {
    expect(has(brief({ day: day(), sessions: quietHistory() }), 'restart')).toBe(false);
  });

  it('only looks at the most recent outing of THIS day', () => {
    // An early finish three sessions ago has been superseded by two clean ones.
    const sessions = [
      session({ date: daysAgo(20), completedAt: daysAgo(20), endedEarly: true, entries: [entry('Incline DB Press', [set(30, 9, 8)])] }),
      ...quietHistory(3),
    ];
    expect(has(brief({ day: day(), sessions }), 'restart')).toBe(false);
  });

  it('does not confuse another day’s early finish with this one', () => {
    const other = session({
      dayId: 'pull-a',
      dayName: 'Pull A',
      date: daysAgo(1),
      completedAt: daysAgo(1),
      endedEarly: true,
      entries: [entry('Row', [set(60, 8, 8)])],
    });
    expect(has(brief({ day: day(), sessions: [...quietHistory(3), other] }), 'restart')).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('an RPE that never moves', () => {
  const allEight = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      session({
        date: daysAgo(i + 1),
        completedAt: daysAgo(i + 1),
        entries: [entry('Incline DB Press', [set(30, 9, 8), set(30, 9, 8), set(30, 9, 8)])],
      }),
    );

  it('points out that the number cannot steer anything', () => {
    const c = cueOf(brief({ day: day(), sessions: allEight(5) }), 'calibration')!;
    expect(c).toBeDefined();
    expect(c.evidence).toMatch(/RPE 8/);
    expect(c.basis).toMatch(/gap/i);
  });

  it('needs enough sets to call it a habit', () => {
    // Three sets an outing, so four sessions is the twelve-set bar and three is
    // one short. Everyone logs a run of identical RPEs sooner or later.
    expect(has(brief({ day: day(), sessions: allEight(4) }), 'calibration')).toBe(true);
    expect(has(brief({ day: day(), sessions: allEight(3) }), 'calibration')).toBe(false);
  });

  it('says nothing to someone whose ratings actually vary', () => {
    expect(has(brief({ day: day(), sessions: quietHistory(6) }), 'calibration')).toBe(false);
  });

  it('only looks at the recent past', () => {
    const old = Array.from({ length: 6 }, (_, i) =>
      session({
        date: daysAgo(60 + i),
        completedAt: daysAgo(60 + i),
        entries: [entry('Incline DB Press', [set(30, 9, 8), set(30, 9, 8), set(30, 9, 8)])],
      }),
    );
    expect(has(brief({ day: day(), sessions: old }), 'calibration')).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('your own note, before the first set', () => {
  it('comes back on the lift it was written on', () => {
    const sessions = [
      session({
        date: daysAgo(3),
        completedAt: daysAgo(3),
        entries: [entry('Incline DB Press', [set(30, 9, 8)], 'remember what we discussed')],
      }),
    ];
    const c = cueOf(brief({ day: day(), sessions }), 'note')!;
    expect(c.evidence).toContain('remember what we discussed');
    expect(c.exercise).toBe('Incline DB Press');
  });

  it('expires with the window the lifter set', () => {
    const sessions = [
      session({ date: daysAgo(20), completedAt: daysAgo(20), entries: [entry('Incline DB Press', [set(30, 9, 8)], 'old note')] }),
    ];
    expect(has(brief({ day: day(), sessions, noteRecallDays: 7 }), 'note')).toBe(false);
    expect(has(brief({ day: day(), sessions, noteRecallDays: 28 }), 'note')).toBe(true);
    expect(has(brief({ day: day(), sessions, noteRecallDays: 0 }), 'note')).toBe(false);
  });

  it('says when it was written', () => {
    const sessions = [
      session({ date: daysAgo(3), completedAt: daysAgo(3), entries: [entry('Incline DB Press', [set(30, 9, 8)], 'note text')] }),
    ];
    expect(cueOf(brief({ day: day(), sessions }), 'note')!.evidence).toContain('3 days ago');
  });
});

// ---------------------------------------------------------------------------

describe('notes steering the engine, not just being repeated back', () => {
  // A note is the only place the lifter says something the numbers cannot. Some
  // of them have to CHANGE the advice rather than sit underneath it.

  /** Under target on RPE — every numeric rule says "add weight" — plus a note. */
  const underTargetWith = (note: string) => [
    ...quietHistory(3),
    session({
      date: daysAgo(2),
      completedAt: daysAgo(2),
      entries: [entry('Incline DB Press', [set(30, 10, 6, 5), set(30, 10, 6, 5)], note)],
    }),
    session({
      date: daysAgo(6),
      completedAt: daysAgo(6),
      entries: [entry('Incline DB Press', [set(30, 10, 6, 5), set(30, 10, 6, 4)])],
    }),
  ];

  it('a pain note outranks every number that says add weight', () => {
    // Without the note this is the clearest "go up" case the engine has: RPE two
    // points under target and five stars. The note has to win.
    const clean = brief({ day: day(), sessions: underTargetWith('felt fine') });
    expect(clean.cues.some((c) => /room|go up|push today/i.test(c.headline))).toBe(true);

    const hurt = brief({ day: day(), sessions: underTargetWith('left shoulder pinched on the last set') });
    expect(hurt.cues.some((c) => /room|go up|push today/i.test(c.headline))).toBe(false);
    const c = cueOf(hurt, 'note')!;
    expect(c.headline).toMatch(/leave the weight where it is/i);
    expect(c.basis).toMatch(/outranks/i);
  });

  it('vetoes the load cue on a lift whose note did not win the slot', () => {
    // Only one note cue fits in a brief. The lift that loses it must still not
    // be told to add weight — otherwise the veto is an accident of which cue
    // happened to sort first, and a second painful lift gets loaded anyway.
    const sessions = [
      ...quietHistory(3),
      session({
        date: daysAgo(2),
        completedAt: daysAgo(2),
        entries: [
          entry('Incline DB Press', [set(30, 10, 6)], 'shoulder pinched'),
          entry('Cable Flye', [set(15, 15, 6)], 'elbow pain again'),
        ],
      }),
    ];
    const b = brief({ day: day(), sessions });
    expect(b.cues.filter((c) => c.kind === 'note')).toHaveLength(1);
    // Both lifts are two RPE points under target — the clearest "go up" case
    // the engine has — and neither may be offered it.
    expect(b.cues.some((c) => /room|go up|push today/i.test(c.headline))).toBe(false);
  });

  it('a missed-rep note makes you repeat the weight rather than build on it', () => {
    const b = brief({ day: day(), sessions: underTargetWith('failed the last rep, had to rack it') });
    expect(b.cues.some((c) => /room|go up|push today/i.test(c.headline))).toBe(false);
    expect(cueOf(b, 'note')!.headline).toMatch(/repeat last time'?s weight/i);
  });

  it('a form note sharpens the overshoot instead of standing apart from it', () => {
    const sessions = [
      ...quietHistory(3),
      session({
        date: daysAgo(2),
        completedAt: daysAgo(2),
        entries: [entry('Incline DB Press', [set(35, 6, 10)], 'form broke on rep 5')],
      }),
    ];
    const c = cueOf(brief({ day: day(), sessions }), 'load')!;
    expect(c.headline).toMatch(/lighter/);
    expect(c.evidence).toContain('form broke on rep 5');
  });

  it('a set-up note warns that the numbers are not comparable', () => {
    const sessions = [
      session({ date: daysAgo(3), completedAt: daysAgo(3), entries: [entry('Incline DB Press', [set(30, 9, 8)], 'seat notch 4, not 5')] }),
    ];
    const c = cueOf(brief({ day: day(), sessions }), 'note')!;
    expect(c.headline).toMatch(/match your set-up/i);
    expect(c.basis).toMatch(/leverage/i);
  });

  it('the most consequential note in the day takes the slot', () => {
    const sessions = [
      session({
        date: daysAgo(3),
        completedAt: daysAgo(3),
        entries: [
          entry('Incline DB Press', [set(30, 9, 8)], 'seat notch 4'),
          entry('Cable Flye', [set(15, 12, 9)], 'elbow hurt through all three sets'),
        ],
      }),
    ];
    const c = cueOf(brief({ day: day(), sessions }), 'note')!;
    expect(c.exercise).toBe('Cable Flye');
    expect(c.headline).toMatch(/leave the weight where it is/i);
  });
});

describe('reading a note', () => {
  const cases: [string, string[]][] = [
    ['left knee pain on the last set', ['pain']],
    ['shoulder hurt', ['pain']],
    ['tweaked my back', ['pain']],
    ['slight twinge in the elbow', ['pain']],
    ['failed rep 8', ['failure']],
    ['missed the last two reps', ['failure']],
    ['had to rack it', ['failure']],
    ['form broke on the last set', ['form']],
    ['used momentum, sloppy', ['form']],
    ['seat notch 4, not 5', ['setup']],
    ['pin 7 on the machine', ['setup']],
    ['felt great, smooth throughout', ['positive']],
    ['', []],
    ['ate late, gym was busy', []],
  ];

  for (const [text, expected] of cases) {
    it(`reads "${text}" as ${expected.join('+') || 'nothing'}`, () => {
      const got = readNoteSignals(text);
      for (const e of expected) expect(got, text).toContain(e);
      if (!expected.length) expect(got, text).toEqual([]);
    });
  }

  it('does not read a clean bill of health as an injury', () => {
    // The single worst false positive available: the best note a lifter can
    // write becoming the one that blocks their progress.
    for (const t of [
      'no pain today',
      'shoulder pain free at last',
      "didn't hurt at all",
      'zero knee pain, first time in weeks',
      'not painful anymore',
    ]) {
      expect(readNoteSignals(t), t).not.toContain('pain');
    }
  });

  it('does not treat ordinary training soreness as an injury', () => {
    // "Sore" and "tight" are what people write after every hard session; vetoing
    // load on them would mean the engine never suggested a load increase again.
    for (const t of ['chest sore next day', 'felt tight warming up', 'stiff after squats']) {
      expect(readNoteSignals(t), t).not.toContain('pain');
    }
  });
});

// ---------------------------------------------------------------------------

describe('the technique the sheet asks for', () => {
  it('reminds you what the last set is meant to be', () => {
    const d = day({
      exercises: [
        { id: 'e1', name: 'Incline DB Press', workingSets: 3, reps: '8-10', rpe: '8', lastSetRpe: '10', lastSetTechnique: 'Myo-reps' },
      ],
    });
    const c = cueOf(brief({ day: d, sessions: [] }), 'technique')!;
    expect(c.headline).toContain('Myo-reps');
    expect(c.evidence).toContain('RPE 10');
  });

  it('says nothing when the sheet prescribes none', () => {
    expect(has(brief({ day: day(), sessions: [] }), 'technique')).toBe(false);
  });

  it('is the fallback, not the headline, once there is real history', () => {
    const d = day({
      exercises: [
        { id: 'e1', name: 'Incline DB Press', workingSets: 3, reps: '8-10', rpe: '8', lastSetTechnique: 'Myo-reps' },
      ],
    });
    const sessions = [
      ...quietHistory(4),
      session({ date: daysAgo(2), completedAt: daysAgo(2), entries: [entry('Incline DB Press', [set(35, 6, 10)])] }),
    ];
    const b = brief({ day: d, sessions });
    expect(b.cues[0].kind).toBe('load');
  });
});

// ---------------------------------------------------------------------------

describe('placeholder slots', () => {
  it('are never briefed about — they are gaps in the sheet, not lifts', () => {
    const d = day({
      exercises: [
        { id: 'e1', name: 'Weak Point Exercise 2 (optional)', workingSets: 3, reps: '10', rpe: '8', weakPointSlot: 2 },
      ],
    });
    const sessions = [
      ...quietHistory(3),
      session({
        date: daysAgo(2),
        completedAt: daysAgo(2),
        entries: [entry('Weak Point Exercise 2 (optional)', [set(20, 10, 10, 1)])],
      }),
    ];
    const b = brief({ day: d, sessions });
    expect(b.cues.every((c) => c.exercise !== 'Weak Point Exercise 2 (optional)')).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('the motivational half', () => {
  it('quotes a gain you actually made on a lift you are about to do', () => {
    const sessions = [
      session({ date: daysAgo(40), completedAt: daysAgo(40), entries: [entry('Incline DB Press', [set(25, 8, 8)])] }),
      session({ date: daysAgo(20), completedAt: daysAgo(20), entries: [entry('Incline DB Press', [set(30, 8, 8)])] }),
      session({ date: daysAgo(5), completedAt: daysAgo(5), entries: [entry('Incline DB Press', [set(35, 8, 8)])] }),
    ];
    const s = brief({ day: day(), sessions }).spark!;
    expect(s.kind).toBe('gain');
    expect(s.headline).toContain('Incline DB Press');
    expect(s.headline).toMatch(/stronger/);
    expect(s.detail).toMatch(/weeks/);
  });

  it('will not celebrate noise', () => {
    // Under the same 2.5 kg bar the rest of the app uses for a real change.
    const sessions = [
      session({ date: daysAgo(40), completedAt: daysAgo(40), entries: [entry('Incline DB Press', [set(30, 8, 8)])] }),
      session({ date: daysAgo(20), completedAt: daysAgo(20), entries: [entry('Incline DB Press', [set(30, 8, 8)])] }),
      session({ date: daysAgo(5), completedAt: daysAgo(5), entries: [entry('Incline DB Press', [set(30, 8, 8)])] }),
    ];
    expect(brief({ day: day(), sessions }).spark?.kind).not.toBe('gain');
  });

  it('counts down the last sessions of the week', () => {
    const program: WorkoutProgram = {
      name: 'p',
      unit: 'kg',
      custom: [],
      weeks: [
        {
          id: 'w1',
          name: 'Week 3',
          days: [day(), { ...day(), id: 'pull-a', name: 'Pull A' }, { ...day(), id: 'legs-a', name: 'Legs A' }],
        },
      ],
    };
    const sessions = [
      session({ dayId: 'pull-a', weekId: 'w1', date: daysAgo(4), completedAt: daysAgo(4), entries: [entry('Row', [set(60, 8, 8)])] }),
      session({ dayId: 'legs-a', weekId: 'w1', date: daysAgo(2), completedAt: daysAgo(2), entries: [entry('Squat', [set(100, 5, 8)])] }),
    ];
    const s = brief({ day: day(), sessions, program }).spark!;
    expect(s.kind).toBe('proximity');
    expect(s.headline).toContain('Last session of Week 3');
  });

  it('falls back to turning up', () => {
    const sessions = Array.from({ length: 5 }, (_, i) =>
      session({
        date: daysAgo(i * 5 + 1),
        completedAt: daysAgo(i * 5 + 1),
        entries: [entry('Incline DB Press', [set(30, 9, 8)])],
      }),
    );
    const s = brief({ day: day(), sessions }).spark!;
    expect(s.kind).toBe('consistency');
    expect(s.headline).toMatch(/sessions in the last four weeks/);
  });

  it('gives a first-timer something to do rather than something to feel', () => {
    const s = brief({ day: day(), sessions: [] }).spark!;
    expect(s.kind).toBe('first');
    expect(s.headline).toMatch(/log the rpe/i);
  });

  it('never invents a number', () => {
    // Whatever the spark says, it must be traceable: a gain quotes a lift, a
    // countdown quotes a week, consistency quotes a count.
    for (const sessions of [[], quietHistory(1), quietHistory(6)]) {
      const s = brief({ day: day(), sessions }).spark;
      if (!s) continue;
      expect(s.headline.length).toBeGreaterThan(5);
      expect(s.detail.length).toBeGreaterThan(5);
    }
  });
});

// ---------------------------------------------------------------------------

describe('robustness', () => {
  it('survives the malformed history a restored backup can hand it', () => {
    const junk = [
      undefined,
      null,
      {},
      { entries: null },
      { entries: [{}] },
      { entries: [{ name: 'Incline DB Press', sets: null }] },
      { entries: [{ name: 'Incline DB Press', sets: [{}] }] },
      { date: 'not a date', entries: [{ name: 'Incline DB Press', sets: [set(30, 9, 8)] }] },
    ] as unknown as WorkoutSession[];
    expect(() => brief({ day: day(), sessions: junk })).not.toThrow();
    expect(() => brief({ day: day(), sessions: junk, program: {} as WorkoutProgram })).not.toThrow();
  });

  it('survives a day whose exercises are missing', () => {
    const broken = { id: 'x', name: 'Broken', source: 'custom' } as unknown as ProgramDay;
    expect(() => brief({ day: broken, sessions: quietHistory() })).not.toThrow();
  });

  it('is deterministic — the same input twice gives the same brief', () => {
    const sessions = [
      ...quietHistory(4),
      session({ date: daysAgo(2), completedAt: daysAgo(2), entries: [entry('Incline DB Press', [set(35, 6, 10)])] }),
    ];
    const a = brief({ day: day(), sessions });
    const b = brief({ day: day(), sessions });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('reads nothing from the future', () => {
    const ahead = [
      session({ date: daysAgo(-3), completedAt: daysAgo(-3), entries: [entry('Incline DB Press', [set(60, 6, 10)])] }),
    ];
    const b = brief({ day: day(), sessions: ahead });
    expect(b.cues.some((c) => c.evidence.includes('60kg'))).toBe(false);
  });
});
