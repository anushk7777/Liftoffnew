import { describe, it, expect } from 'vitest';
import {
  co2Nudge, noteForExercise, noteDigest, agoLabel, localDay,
  CO2_WINDOW_START, CO2_WINDOW_END, CO2_SLOT_MINUTES, CO2_TAGLINES, DEFAULT_RECALL_DAYS,
} from './recall';
import type { RecoveryEntry, WorkoutSession } from '../types';

// Local-time constructors throughout. A `Z` timestamp lands on a different
// clock hour per timezone, which is precisely what a "09:30 local" window must
// not depend on.
const at = (h: number, m: number, day = 28) => new Date(2026, 6, day, h, m, 0);
const DAY = 86_400_000;

const rec = (d: Date, score = 46): RecoveryEntry =>
  ({ id: `r${d.getTime()}`, date: d.toISOString(), co2Score: score }) as RecoveryEntry;

const sess = (
  when: Date,
  entries: [name: string, notes?: string][],
  dayName = 'Pull #1',
): WorkoutSession =>
  ({
    id: `s${when.getTime()}`,
    dayId: 'd1',
    dayName,
    date: when.toISOString(),
    completedAt: when.toISOString(),
    entries: entries.map(([name, notes]) => ({ name, notes: notes ?? '', sets: [] })),
  }) as unknown as WorkoutSession;

// ---------------------------------------------------------------------------

describe('co2Nudge — the window', () => {
  it('stays silent before 09:30 and fires exactly on it', () => {
    expect(co2Nudge([], new Set(), at(9, 29))).toBeNull();
    expect(co2Nudge([], new Set(), at(9, 30))).not.toBeNull();
  });

  it('fires exactly on 11:00 and never after', () => {
    expect(co2Nudge([], new Set(), at(11, 0))).not.toBeNull();
    expect(co2Nudge([], new Set(), at(11, 1))).toBeNull();
    // A reading taken in the afternoon is not comparable with the morning ones,
    // so the nudge must not drag the test out of its window.
    expect(co2Nudge([], new Set(), at(15, 0))).toBeNull();
    expect(co2Nudge([], new Set(), at(23, 59))).toBeNull();
    expect(co2Nudge([], new Set(), at(0, 0))).toBeNull();
  });

  it('walks one slot every half hour, with a distinct line each time', () => {
    const seen: string[] = [];
    const fired = new Set<string>();
    for (const [h, m] of [[9, 30], [10, 0], [10, 30], [11, 0]] as const) {
      const n = co2Nudge([], fired, at(h, m))!;
      expect(n).not.toBeNull();
      expect(n.slot).toBe(seen.length);
      seen.push(n.body);
      fired.add(n.key);
    }
    expect(new Set(seen).size).toBe(4); // four different taglines, not one repeated
    expect(seen).toEqual([...CO2_TAGLINES]);
  });

  it('does not fire twice in the same slot', () => {
    const fired = new Set<string>();
    const first = co2Nudge([], fired, at(9, 31))!;
    fired.add(first.key);
    // Same slot, ten minutes later — already asked.
    expect(co2Nudge([], fired, at(9, 41))).toBeNull();
    expect(co2Nudge([], fired, at(9, 59))).toBeNull();
    // Next slot opens.
    expect(co2Nudge([], fired, at(10, 0))).not.toBeNull();
  });

  it('never runs off the end of the tagline list', () => {
    // Even if the window or slot size is later widened, the last line repeats
    // rather than the body coming out undefined.
    const slots = Math.floor((CO2_WINDOW_END - CO2_WINDOW_START) / CO2_SLOT_MINUTES);
    for (let s = 0; s <= slots; s++) {
      const mins = CO2_WINDOW_START + s * CO2_SLOT_MINUTES;
      const n = co2Nudge([], new Set(), at(Math.floor(mins / 60), mins % 60));
      expect(n?.body).toBeTruthy();
      expect(typeof n?.body).toBe('string');
    }
  });
});

describe('co2Nudge — stops once logged', () => {
  it('goes quiet the moment today has a reading', () => {
    const logged = [rec(at(9, 45))];
    expect(co2Nudge(logged, new Set(), at(10, 0))).toBeNull();
    expect(co2Nudge(logged, new Set(), at(10, 30))).toBeNull();
    expect(co2Nudge(logged, new Set(), at(11, 0))).toBeNull();
  });

  it('a reading logged LATER today still silences an earlier slot', () => {
    // Order of the log array must not matter.
    expect(co2Nudge([rec(at(20, 0))], new Set(), at(9, 30))).toBeNull();
  });

  it("yesterday's reading does not silence today", () => {
    expect(co2Nudge([rec(at(10, 0, 27))], new Set(), at(9, 30))).not.toBeNull();
  });

  it('a reading at 00:05 counts for that day, not the one before', () => {
    // Same local day as the 09:30 nudge, so it silences it.
    expect(co2Nudge([rec(at(0, 5))], new Set(), at(9, 30))).toBeNull();
    // Logged just before midnight yesterday — different day, so it does not.
    expect(co2Nudge([rec(at(23, 55, 27))], new Set(), at(9, 30))).not.toBeNull();
  });

  it('fires again the next morning after yesterday was completed', () => {
    const fired = new Set<string>();
    const n1 = co2Nudge([], fired, at(9, 30, 27))!;
    fired.add(n1.key);
    // Next day, same slot: a new key, so it asks again.
    const n2 = co2Nudge([], fired, at(9, 30, 28))!;
    expect(n2).not.toBeNull();
    expect(n2.key).not.toBe(n1.key);
  });
});

describe('co2Nudge — bad data', () => {
  it('survives null, undefined and unparseable entries', () => {
    const junk = [null, undefined, {}, { date: 'not-a-date' }, { date: '' }] as unknown as RecoveryEntry[];
    expect(() => co2Nudge(junk, new Set(), at(10, 0))).not.toThrow();
    // None of that counts as "logged today", so it still nudges.
    expect(co2Nudge(junk, new Set(), at(10, 0))).not.toBeNull();
    expect(() => co2Nudge(undefined as unknown as RecoveryEntry[], new Set(), at(10, 0))).not.toThrow();
  });
});

describe('noteForExercise', () => {
  const NOW = at(12, 0);

  it('returns the note left on that exercise', () => {
    const s = [sess(new Date(NOW.getTime() - 2 * DAY), [['Lat Pulldown', 'left elbow twinge on set 3']])];
    const n = noteForExercise(s, 'Lat Pulldown', 7, NOW)!;
    expect(n.text).toBe('left elbow twinge on set 3');
    expect(n.daysAgo).toBe(2);
    expect(n.dayName).toBe('Pull #1');
  });

  it('matches the name case- and whitespace-insensitively', () => {
    const s = [sess(new Date(NOW.getTime() - DAY), [['Lat Pulldown', 'note']])];
    expect(noteForExercise(s, '  lat pulldown  ', 7, NOW)?.text).toBe('note');
  });

  it('returns only the LATEST note, not a pile of them', () => {
    const s = [
      sess(new Date(NOW.getTime() - 5 * DAY), [['Bench Press', 'older note']]),
      sess(new Date(NOW.getTime() - 1 * DAY), [['Bench Press', 'newer note']]),
    ];
    expect(noteForExercise(s, 'Bench Press', 7, NOW)?.text).toBe('newer note');
  });

  it('ignores notes older than the window, at the exact boundary', () => {
    const justInside = [sess(new Date(NOW.getTime() - 7 * DAY + 1000), [['Squat', 'in']])];
    const justOutside = [sess(new Date(NOW.getTime() - 7 * DAY - 1000), [['Squat', 'out']])];
    expect(noteForExercise(justInside, 'Squat', 7, NOW)?.text).toBe('in');
    expect(noteForExercise(justOutside, 'Squat', 7, NOW)).toBeNull();
  });

  it('ignores empty and whitespace-only notes', () => {
    const s = [sess(new Date(NOW.getTime() - DAY), [['Squat', '   '], ['Squat', '']])];
    expect(noteForExercise(s, 'Squat', 7, NOW)).toBeNull();
  });

  it('ignores a different exercise', () => {
    const s = [sess(new Date(NOW.getTime() - DAY), [['Squat', 'knee']])];
    expect(noteForExercise(s, 'Leg Press', 7, NOW)).toBeNull();
  });

  it('returns nothing when recall is switched off', () => {
    const s = [sess(new Date(NOW.getTime() - DAY), [['Squat', 'knee']])];
    expect(noteForExercise(s, 'Squat', 0, NOW)).toBeNull();
  });

  it('honours a longer window when one is set', () => {
    const s = [sess(new Date(NOW.getTime() - 20 * DAY), [['Squat', 'old note']])];
    expect(noteForExercise(s, 'Squat', 7, NOW)).toBeNull();
    expect(noteForExercise(s, 'Squat', 28, NOW)?.text).toBe('old note');
  });

  it('ignores a session dated in the future', () => {
    // A clock skew or a hand-edited backup should not put a note in front of
    // you before you have written it.
    const s = [sess(new Date(NOW.getTime() + 2 * DAY), [['Squat', 'from the future']])];
    expect(noteForExercise(s, 'Squat', 7, NOW)).toBeNull();
  });

  it('survives malformed sessions and entries', () => {
    const junk = [
      null, undefined, {}, { entries: null }, { date: 'nope', entries: [] },
      { date: NOW.toISOString(), entries: [null, { notes: 'no name' }, { name: 'X' }] },
    ] as unknown as WorkoutSession[];
    expect(() => noteForExercise(junk, 'X', 7, NOW)).not.toThrow();
    expect(noteForExercise(junk, 'X', 7, NOW)).toBeNull();
    expect(() => noteForExercise(undefined as unknown as WorkoutSession[], 'X', 7, NOW)).not.toThrow();
    expect(noteForExercise([], '', 7, NOW)).toBeNull();
  });
});

describe('noteDigest', () => {
  const NOW = at(12, 0);

  it('is empty when nothing was noted — the UI then shows nothing at all', () => {
    const s = [sess(new Date(NOW.getTime() - DAY), [['Squat'], ['Bench Press']])];
    const d = noteDigest(s, 7, NOW);
    expect(d.empty).toBe(true);
    expect(d.notes).toEqual([]);
    expect(noteDigest([], 7, NOW).empty).toBe(true);
  });

  it('collects one entry per exercise, newest first', () => {
    const s = [
      sess(new Date(NOW.getTime() - 5 * DAY), [['Squat', 'oldest']]),
      sess(new Date(NOW.getTime() - 3 * DAY), [['Bench Press', 'middle']]),
      sess(new Date(NOW.getTime() - 1 * DAY), [['Squat', 'newest squat note']]),
    ];
    const d = noteDigest(s, 7, NOW);
    expect(d.lifts).toBe(2);
    expect(d.notes.map((n) => n.exercise)).toEqual(['Squat', 'Bench Press']);
    // Superseded by the newer one — a digest is a summary, not a diary.
    expect(d.notes[0].text).toBe('newest squat note');
  });

  it('drops notes that have aged out of the window', () => {
    const s = [
      sess(new Date(NOW.getTime() - 9 * DAY), [['Squat', 'last week']]),
      sess(new Date(NOW.getTime() - 2 * DAY), [['Row', 'this week']]),
    ];
    // This is the "one week then gone" rule the owner asked for.
    const d = noteDigest(s, 7, NOW);
    expect(d.notes.map((n) => n.text)).toEqual(['this week']);
  });

  it('returns nothing when recall is switched off', () => {
    const s = [sess(new Date(NOW.getTime() - DAY), [['Squat', 'note']])];
    expect(noteDigest(s, 0, NOW).empty).toBe(true);
  });

  it('survives malformed data', () => {
    const junk = [null, { entries: null }, { date: 'x', entries: [null] }] as unknown as WorkoutSession[];
    expect(() => noteDigest(junk, 7, NOW)).not.toThrow();
    expect(noteDigest(junk, 7, NOW).empty).toBe(true);
  });
});

describe('agoLabel', () => {
  it('reads naturally', () => {
    expect(agoLabel(0)).toBe('today');
    expect(agoLabel(1)).toBe('yesterday');
    expect(agoLabel(4)).toBe('4 days ago');
    expect(agoLabel(-3)).toBe('today'); // clock skew must not print "-3 days ago"
  });
});

describe('localDay', () => {
  it('pads and uses the LOCAL date, not UTC', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
    expect(localDay(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });

  it('rolls over at local midnight', () => {
    expect(localDay(new Date(2026, 6, 28, 23, 59))).toBe('2026-07-28');
    expect(localDay(new Date(2026, 6, 29, 0, 0))).toBe('2026-07-29');
  });
});

// The nudge is defined in LOCAL wall-clock minutes, so the day a clock jumps
// is the one that can silently break it.
describe('daylight saving', () => {
  it('still opens at 09:30 wall-clock on a spring-forward day', () => {
    // 8 March 2026 — US DST begins 02:00 -> 03:00. 09:30 local still exists.
    const springForward = new Date(2026, 2, 8, 9, 30, 0);
    expect(springForward.getHours() * 60 + springForward.getMinutes()).toBe(CO2_WINDOW_START);
    expect(co2Nudge([], new Set(), springForward)).not.toBeNull();
  });

  it('still opens at 09:30 wall-clock on a fall-back day', () => {
    // 1 November 2026 — US DST ends. 09:30 occurs once.
    const fallBack = new Date(2026, 10, 1, 9, 30, 0);
    expect(co2Nudge([], new Set(), fallBack)).not.toBeNull();
  });

  it('keeps one nudge key per calendar day across a DST change', () => {
    const a = co2Nudge([], new Set(), new Date(2026, 2, 8, 9, 30))!;
    const b = co2Nudge([], new Set(), new Date(2026, 2, 9, 9, 30))!;
    expect(a.key).not.toBe(b.key);
    expect(a.key.startsWith('co2:2026-03-08:')).toBe(true);
    expect(b.key.startsWith('co2:2026-03-09:')).toBe(true);
  });
});

describe('defaults', () => {
  it('recall defaults to one week', () => {
    expect(DEFAULT_RECALL_DAYS).toBe(7);
  });
  it('the window is 09:30 to 11:00 in half-hour slots', () => {
    expect(CO2_WINDOW_START).toBe(570);
    expect(CO2_WINDOW_END).toBe(660);
    expect(CO2_SLOT_MINUTES).toBe(30);
  });
});

// Hand-picked instants prove the cases you thought of. This walks a simulated
// clock minute by minute for two months, with the test logged at a random time
// on most days and skipped on the rest, and asserts the invariants that must
// hold at EVERY tick.
describe('co2Nudge — simulated over two months, minute by minute', () => {
  // Deterministic PRNG so a failure is reproducible.
  let seed = 20260728;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

  it('holds its invariants at every minute of 60 days', () => {
    const fired = new Set<string>();
    const recovery: RecoveryEntry[] = [];
    const perDay = new Map<string, number>();
    let total = 0;

    for (let day = 0; day < 60; day++) {
      // 70% of days get logged, at a random minute of the day.
      const logs = rnd() < 0.7;
      const logMinute = Math.floor(rnd() * 1440);

      for (let minute = 0; minute < 1440; minute++) {
        const now = new Date(2026, 4, 1 + day, Math.floor(minute / 60), minute % 60);
        if (logs && minute === logMinute) recovery.push(rec(now));

        const n = co2Nudge(recovery, fired, now);
        if (!n) continue;

        // 1. Never outside 09:30-11:00.
        expect(minute).toBeGreaterThanOrEqual(CO2_WINDOW_START);
        expect(minute).toBeLessThanOrEqual(CO2_WINDOW_END);

        // 2. Never after the test was logged that day.
        expect(logs && logMinute <= minute).toBe(false);

        // 3. Never the same key twice.
        expect(fired.has(n.key)).toBe(false);

        // 4. Always carries a real message.
        expect(n.body.length).toBeGreaterThan(10);
        expect(n.title).toBe('CO2 tolerance test');

        fired.add(n.key);
        const k = localDay(now);
        perDay.set(k, (perDay.get(k) ?? 0) + 1);
        total++;
      }
    }

    // 5. At most one per slot per day — four nudges is the ceiling.
    for (const [day, count] of perDay) {
      expect(count, `too many nudges on ${day}`).toBeLessThanOrEqual(4);
    }
    // 6. It actually did something, or the test is vacuous.
    expect(total).toBeGreaterThan(20);
  });

  it('never nudges at all on a day logged before the window opens', () => {
    const fired = new Set<string>();
    const recovery = [rec(new Date(2026, 4, 2, 7, 15))]; // logged at 07:15
    for (let minute = 0; minute < 1440; minute++) {
      const now = new Date(2026, 4, 2, Math.floor(minute / 60), minute % 60);
      expect(co2Nudge(recovery, fired, now)).toBeNull();
    }
  });

  it('nudges the full four times on a day never logged', () => {
    const fired = new Set<string>();
    let count = 0;
    for (let minute = 0; minute < 1440; minute++) {
      const now = new Date(2026, 4, 3, Math.floor(minute / 60), minute % 60);
      const n = co2Nudge([], fired, now);
      if (n) { fired.add(n.key); count++; }
    }
    expect(count).toBe(4);
  });
});
