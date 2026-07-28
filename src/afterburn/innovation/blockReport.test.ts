import { describe, it, expect } from 'vitest';
import { blockReport } from './blockReport';
import type { WorkoutProgram, WorkoutSession } from '../types';

const NOW = new Date('2026-07-27T12:00:00.000Z');
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

/** A two-week program, three days each. */
const program = (weeks = 2, daysPerWeek = 3): WorkoutProgram =>
  ({
    name: 'Test Block',
    unit: 'kg',
    custom: [],
    weeks: Array.from({ length: weeks }, (_, w) => ({
      id: `w${w + 1}`,
      name: `Week ${w + 1}`,
      days: Array.from({ length: daysPerWeek }, (_, d) => ({
        id: `d${d + 1}`,
        name: `Day ${d + 1}`,
        source: 'powerbuilding',
        exercises: [
          { id: 'e1', name: 'Squat', warmup: '2', workingSets: 3, reps: '8', rpe: '9', lastSetRpe: '10', rest: '3m', substitutions: ['Front Squat'] },
        ],
      })),
    })),
  }) as unknown as WorkoutProgram;

const sess = (
  weekId: string,
  dayId: string,
  daysAgo: number,
  lifts: [name: string, weight: number, reps: number, sets: number][],
): WorkoutSession =>
  ({
    id: `${weekId}-${dayId}-${daysAgo}`,
    dayId,
    weekId,
    weekName: weekId,
    date: ago(daysAgo),
    completedAt: ago(daysAgo),
    entries: lifts.map(([name, weight, reps, sets]) => ({
      name,
      sets: Array.from({ length: sets }, () => ({ weight: String(weight), reps: String(reps), rpe: '9', done: true })),
    })),
  }) as unknown as WorkoutSession;

describe('blockReport', () => {
  it('says it has nothing rather than inventing a report', () => {
    expect(blockReport([], program(), NOW).hasData).toBe(false);
    expect(blockReport([sess('w1', 'd1', 5, [['Squat', 100, 8, 3]])], null, NOW).hasData).toBe(false);
    // A program with no weeks is not a program.
    expect(blockReport([], { name: 'x', unit: 'kg', weeks: [], custom: [] } as unknown as WorkoutProgram, NOW).hasData).toBe(false);
  });

  it('ignores sessions that belong to a different program', () => {
    // Stale sessions from a previous program must not be counted into this
    // block's tonnage — the weekId is what ties a session to its program.
    const foreign = sess('OTHER', 'd1', 10, [['Squat', 200, 10, 5]]);
    const mine = sess('w1', 'd1', 5, [['Squat', 100, 8, 3]]);
    const r = blockReport([foreign, mine], program(), NOW);
    expect(r.sessions).toBe(1);
    expect(r.tonnage).toBe(100 * 8 * 3);
  });

  it('adds up the block: sessions, tonnage, sets, span and adherence', () => {
    const s = [
      sess('w1', 'd1', 20, [['Squat', 100, 8, 3]]),
      sess('w1', 'd2', 18, [['Squat', 100, 8, 3]]),
      sess('w2', 'd1', 13, [['Squat', 105, 8, 3]]),
    ];
    const r = blockReport(s, program(), NOW);
    expect(r.hasData).toBe(true);
    expect(r.sessions).toBe(3);
    expect(r.sets).toBe(9);
    expect(r.tonnage).toBe(100 * 8 * 3 + 100 * 8 * 3 + 105 * 8 * 3);
    expect(r.spanDays).toBe(8); // 20 days ago to 13 days ago, inclusive
    // 3 of 6 prescribed days across the two weeks that were touched.
    expect(r.daysDone).toBe(3);
    expect(r.daysPlanned).toBe(6);
    expect(r.adherencePct).toBe(50);
    expect(r.lifts).toBe(1);
  });

  it('only lists weeks that were actually trained', () => {
    const r = blockReport([sess('w1', 'd1', 10, [['Squat', 100, 8, 3]])], program(4), NOW);
    expect(r.weeks.map((w) => w.id)).toEqual(['w1']);
    expect(r.weeks[0].done).toBe(1);
    expect(r.weeks[0].planned).toBe(3);
  });

  it('is only "complete" when every week of the program is finished', () => {
    const p = program(2, 2);
    const partial = [
      sess('w1', 'd1', 20, [['Squat', 100, 8, 3]]),
      sess('w1', 'd2', 18, [['Squat', 100, 8, 3]]),
    ];
    // Week 1 done in full, but week 2 untouched — the BLOCK is not complete.
    expect(blockReport(partial, p, NOW).complete).toBe(false);

    const all = [
      ...partial,
      sess('w2', 'd1', 10, [['Squat', 105, 8, 3]]),
      sess('w2', 'd2', 8, [['Squat', 105, 8, 3]]),
    ];
    expect(blockReport(all, p, NOW).complete).toBe(true);
  });

  it('names the lift that gained most, and ranks PRs by the size of the jump', () => {
    const p = program(4, 2);
    const s = [
      sess('w1', 'd1', 60, [['Squat', 100, 8, 3], ['Curl', 12, 10, 3]]),
      sess('w1', 'd2', 55, [['Squat', 108, 8, 3], ['Curl', 12, 10, 3]]),
      sess('w2', 'd1', 40, [['Squat', 116, 8, 3], ['Curl', 12, 10, 3]]),
      sess('w2', 'd2', 35, [['Squat', 124, 8, 3], ['Curl', 12, 10, 3]]),
      sess('w3', 'd1', 20, [['Squat', 132, 8, 3], ['Curl', 12, 10, 3]]),
      sess('w3', 'd2', 15, [['Squat', 140, 8, 3], ['Curl', 12, 10, 3]]),
    ];
    const r = blockReport(s, p, NOW);
    expect(r.bestLift?.name).toBe('Squat');
    expect(r.bestLift!.gain).toBeGreaterThan(0);
    // Every squat session beat the last, so there are PRs, biggest jump first.
    expect(r.prs.length).toBeGreaterThan(0);
    expect(r.prs[0].lift).toBe('Squat');
    for (let i = 1; i < r.prs.length; i++) {
      expect(r.prs[i - 1].value - r.prs[i - 1].prev).toBeGreaterThanOrEqual(r.prs[i].value - r.prs[i].prev);
    }
  });

  it('names an expensive stall but ignores a cheap one', () => {
    const p = program(4, 2);
    const s = [
      // Curl: 6 sessions x 3 sets = 18 sets, never moved. Expensive.
      // Calf: 6 sessions x 1 set = 6 sets... also >= 6, so make it 5 sessions.
      ...[60, 55, 40, 35, 20, 15].map((d, i) =>
        sess(`w${Math.floor(i / 2) + 1}`, `d${(i % 2) + 1}`, d, [
          ['Squat', 100 + i * 8, 8, 3],
          ['Curl', 12, 10, 3],
        ]),
      ),
    ];
    const r = blockReport(s, p, NOW);
    expect(r.stalledLift?.name).toBe('Curl');
    expect(r.stalledLift!.sets).toBe(18);
    expect(r.wastedSets).toBeGreaterThanOrEqual(18);
  });

  it('does not name a stalled lift that was barely trained', () => {
    const p = program(4, 2);
    // Only two sets of the accessory across the block — not worth a callout.
    const s = [60, 40].map((d, i) =>
      sess(`w${i + 1}`, 'd1', d, [['Squat', 100 + i * 10, 8, 3], ['Rare Lift', 20, 10, 1]]),
    );
    expect(blockReport(s, p, NOW).stalledLift).toBeNull();
  });

  it('stays quiet about gains when there is not enough to judge', () => {
    // One session. A headline is fine; a "biggest gain" would be invented.
    const r = blockReport([sess('w1', 'd1', 5, [['Squat', 100, 8, 3]])], program(), NOW);
    expect(r.hasData).toBe(true);
    expect(r.sessions).toBe(1);
    expect(r.bestLift).toBeNull();
    expect(r.stalledLift).toBeNull();
    expect(r.prs).toEqual([]);
  });

  it('survives a malformed program without throwing', () => {
    const broken = { name: 'B', unit: 'kg', custom: [], weeks: [{ id: 'w1', name: 'W1', days: null }] } as unknown as WorkoutProgram;
    expect(() => blockReport([sess('w1', 'd1', 5, [['Squat', 100, 8, 3]])], broken, NOW)).not.toThrow();
  });
});

describe('sets taken to failure', () => {
  const withRpe = (weekId: string, dayId: string, daysAgo: number, rpes: string[]): WorkoutSession =>
    ({ id: `${weekId}${dayId}${daysAgo}`, dayId, weekId, weekName: weekId,
       date: ago(daysAgo), completedAt: ago(daysAgo),
       entries: [{ name: 'Squat', sets: rpes.map((rpe) => ({ weight: '100', reps: '8', rpe, done: true })) }],
     }) as unknown as WorkoutSession;

  it('counts RPE 10 sets, the lifts they came from, and the share of rated sets', () => {
    const s = [
      withRpe('w1', 'd1', 20, ['8', '9', '10']),
      withRpe('w1', 'd2', 18, ['8', '9', '10']),
      withRpe('w2', 'd1', 13, ['9', '9', '9']),
    ];
    const r = blockReport(s, program(), NOW);
    expect(r.failureSets).toBe(2);
    expect(r.failureLifts).toBe(1);
    expect(r.failureRate).toBe(22); // 2 of 9 rated sets
  });

  it('measures the share against RATED sets, not every set', () => {
    // An unrated set says nothing about how hard it was. Counting it as
    // "not to failure" would punish you for leaving the RPE box empty.
    const s = [withRpe('w1', 'd1', 20, ['10', '', ' ']), withRpe('w1', 'd2', 18, ['10', '', ''])];
    const r = blockReport(s, program(), NOW);
    expect(r.failureSets).toBe(2);
    expect(r.failureRate).toBe(100); // 2 of 2 RATED sets, not 2 of 6
  });

  it('treats anything above 10 as failure too, and nothing below', () => {
    const s = [withRpe('w1', 'd1', 20, ['9.5', '10', '10.5'])];
    expect(blockReport(s, program(), NOW).failureSets).toBe(2);
  });

  it('is zero when nothing was pushed that hard', () => {
    const r = blockReport([withRpe('w1', 'd1', 20, ['7', '8', '8.5'])], program(), NOW);
    expect(r.failureSets).toBe(0);
    expect(r.failureLifts).toBe(0);
    expect(r.failureRate).toBe(0);
  });
});

describe('the sheet\'s own deload weeks', () => {
  const p = (): WorkoutProgram =>
    ({
      name: 'P', unit: 'kg', custom: [],
      weeks: [1, 2, 3, 4, 5].map((n) => ({
        id: `w${n}`,
        name: n === 5 ? `Week ${n} · Deload` : `Week ${n} · Build`,
        days: [{ id: 'd1', name: 'D1', source: 'powerbuilding', exercises: [
          { id: 'e1', name: 'Squat', warmup: '2', workingSets: 3, reps: '8', rpe: '9', lastSetRpe: '10', rest: '3m', substitutions: [] },
        ] }],
      })),
    }) as unknown as WorkoutProgram;

  const block = (loads: number[]) =>
    loads.map((w, i) =>
      sess(`w${i + 1}`, 'd1', 55 - i * 11, [['Squat', w, 8, 3]]),
    );

  it('reads the deload label from the program, not the session\'s stored copy', () => {
    // These sessions carry weekName "w5", not "Week 5 · Deload" — a session
    // keeps whatever it was stamped with, which can be stale or missing. The
    // exclusion must still work, because the program says what the week is.
    const r = blockReport(block([100, 108, 116, 124, 85]), p(), NOW);
    expect(r.bestLift?.name).toBe('Squat');
  });

  it('does not let a deload erase the block\'s progress', () => {
    // Four weeks climbing 100 -> 124, then the sheet's deload drops to 85.
    // Including that taper flattens every trend, so at the end of a block —
    // which is exactly when this report is read — there would be no "biggest
    // gain" at all. This program ends BOTH of its blocks with a deload.
    const withDeload = blockReport(block([100, 108, 116, 124, 85]), p(), NOW);
    expect(withDeload.bestLift?.name).toBe('Squat');
    expect(withDeload.bestLift!.gain).toBeGreaterThan(0);
  });

  it('still counts the deload everywhere it belongs', () => {
    // The work was done and must show up in tonnage, sets and adherence — it is
    // only excluded from the STRENGTH trend.
    const r = blockReport(block([100, 108, 116, 124, 85]), p(), NOW);
    expect(r.weeks.map((w) => w.name)).toContain('Week 5 · Deload');
    expect(r.sessions).toBe(5);
    expect(r.tonnage).toBe((100 + 108 + 116 + 124 + 85) * 8 * 3);
    expect(r.adherencePct).toBe(100);
  });

  it('falls back to using everything if the block is all deload', () => {
    const allDeload = {
      name: 'P', unit: 'kg', custom: [],
      weeks: [1, 2, 3, 4].map((n) => ({
        id: `w${n}`, name: `Week ${n} · Deload`,
        days: [{ id: 'd1', name: 'D1', source: 'powerbuilding', exercises: [] }],
      })),
    } as unknown as WorkoutProgram;
    const r = blockReport(
      [100, 110, 120, 130].map((w, i) => sess(`w${i + 1}`, 'd1', 55 - i * 11, [['Squat', w, 8, 3]])),
      allDeload, NOW,
    );
    // Nothing is silently dropped — it still produces a report.
    expect(r.hasData).toBe(true);
    expect(r.sessions).toBe(4);
  });
});

describe('blockReport — placeholder slots', () => {
  it('counts neither the lift nor its PRs, and never names it as the biggest gain', () => {
    const p = program(2, 3);
    // Six sessions, each logging a real lift and an unfilled slot, both climbing.
    const sessions = [
      sess('w1', 'd1', 40, [['Squat', 100, 8, 3], ['Weak Point Exercise 1', 40, 8, 3]]),
      sess('w1', 'd2', 37, [['Squat', 105, 8, 3], ['Weak Point Exercise 1', 45, 8, 3]]),
      sess('w1', 'd3', 34, [['Squat', 110, 8, 3], ['Weak Point Exercise 1', 50, 8, 3]]),
      sess('w2', 'd1', 20, [['Squat', 115, 8, 3], ['Weak Point Exercise 1', 60, 8, 3]]),
      sess('w2', 'd2', 17, [['Squat', 120, 8, 3], ['Weak Point Exercise 1', 70, 8, 3]]),
      sess('w2', 'd3', 14, [['Squat', 125, 8, 3], ['Weak Point Exercise 1', 80, 8, 3]]),
    ];
    const r = blockReport(sessions, p, NOW);

    // The slot climbs faster than the squat, so before the filter it won both.
    expect(r.bestLift?.name).toBe('Squat');
    expect(r.prs.every((x) => !/weak point/i.test(x.lift))).toBe(true);
    expect(r.lifts).toBe(1);
    // The sets themselves still happened and are still counted.
    expect(r.sets).toBe(36);
  });
});
