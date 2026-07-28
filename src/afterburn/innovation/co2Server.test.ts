import { describe, it, expect } from 'vitest';
import {
  wallClockIn,
  co2Due,
  CO2_WINDOW_START,
  CO2_WINDOW_END,
  CO2_SLOT_MINUTES,
  CO2_CRON_GRACE_MINUTES,
  CO2_TAGLINES,
  CO2_TITLE,
} from './co2Server';
import { co2Nudge, CO2_TAGLINES as RECALL_TAGLINES } from './recall';

// The scheduling rule that decides when a phone buzzes at 09:30. Everything the
// server does hangs off this, and none of it is observable until someone is
// woken at the wrong hour in another country — so it is tested against real
// zones, real DST transitions and the awkward offsets rather than against UTC.

/** The instant whose wall clock in `zone` reads `localIso` (e.g.
 *  '2026-07-28T09:30'). Solved by iteration rather than by hard-coding offsets,
 *  so the fixtures stay readable as local times and stay correct when the
 *  platform's tz database is updated. Not valid for a time that does not exist
 *  (inside a spring-forward gap) — no test asks for one. */
function instantOf(zone: string, localIso: string): Date {
  const want = Date.parse(`${localIso}:00Z`);
  let t = want;
  for (let i = 0; i < 4; i++) {
    const w = wallClockIn(new Date(t), zone);
    if (!w) throw new Error(`unusable zone ${zone}`);
    const hh = String(Math.floor(w.minutes / 60)).padStart(2, '0');
    const mm = String(w.minutes % 60).padStart(2, '0');
    const got = Date.parse(`${w.day}T${hh}:${mm}:00Z`);
    if (got === want) break;
    t += want - got;
  }
  return new Date(t);
}

const ZONES = {
  utc: 'UTC',
  india: 'Asia/Kolkata', // +5:30, no DST
  nepal: 'Asia/Kathmandu', // +5:45 — the awkward one
  la: 'America/Los_Angeles', // DST
  auckland: 'Pacific/Auckland', // southern-hemisphere DST
  lordHowe: 'Australia/Lord_Howe', // 30-minute DST shift
  kiritimati: 'Pacific/Kiritimati', // +14, the furthest ahead there is
};

describe('wallClockIn', () => {
  it('reads the clock in the requested zone, not the process zone', () => {
    // 2026-07-28T04:00Z is 09:30 in India and 21:00 the previous day in LA.
    const t = new Date('2026-07-28T04:00:00Z');
    expect(wallClockIn(t, ZONES.india)).toEqual({ day: '2026-07-28', minutes: 9 * 60 + 30 });
    expect(wallClockIn(t, ZONES.la)).toEqual({ day: '2026-07-27', minutes: 21 * 60 });
    expect(wallClockIn(t, ZONES.utc)).toEqual({ day: '2026-07-28', minutes: 4 * 60 });
  });

  it('reports midnight as minute 0, not minute 1440', () => {
    // The classic hour-24 bug: `hour12: false` gives "24" for midnight in
    // several engines, which would put 00:10 an hour past the end of any window.
    for (const zone of Object.values(ZONES)) {
      const w = wallClockIn(instantOf(zone, '2026-07-28T00:10'), zone)!;
      expect(w.minutes).toBe(10);
      expect(w.day).toBe('2026-07-28');
    }
  });

  it('handles the 45-minute and +14 offsets', () => {
    expect(wallClockIn(new Date('2026-07-28T03:45:00Z'), ZONES.nepal)).toEqual({
      day: '2026-07-28',
      minutes: 9 * 60 + 30,
    });
    // Kiritimati is a full day ahead of UTC for most of the UTC day.
    expect(wallClockIn(new Date('2026-07-27T19:30:00Z'), ZONES.kiritimati)).toEqual({
      day: '2026-07-28',
      minutes: 9 * 60 + 30,
    });
  });

  it('returns null rather than guessing for a missing or bogus zone', () => {
    const t = new Date('2026-07-28T04:00:00Z');
    expect(wallClockIn(t, '')).toBeNull();
    expect(wallClockIn(t, 'Not/AZone')).toBeNull();
    expect(wallClockIn(t, 'gibberish')).toBeNull();
    // A subscription row with a null zone arrives here as an empty string.
    expect(wallClockIn(t, undefined as unknown as string)).toBeNull();
  });
});

describe('co2Due — the window', () => {
  it('opens at 09:30 local and not a minute earlier, in every zone', () => {
    for (const zone of Object.values(ZONES)) {
      expect(co2Due(zone, [], instantOf(zone, '2026-07-28T09:29'))).toBeNull();
      expect(co2Due(zone, [], instantOf(zone, '2026-07-28T09:30'))).not.toBeNull();
    }
  });

  it('closes at 11:00 local, with grace only for the cron and only on the server', () => {
    const z = ZONES.india;
    expect(co2Due(z, [], instantOf(z, '2026-07-28T11:00'))).not.toBeNull();
    // No grace (the browser's setting): 11:01 is over.
    expect(co2Due(z, [], instantOf(z, '2026-07-28T11:01'))).toBeNull();
    // With the cron's grace: a tick that ran late still delivers the last call…
    expect(co2Due(z, [], instantOf(z, '2026-07-28T11:04'), CO2_CRON_GRACE_MINUTES)).not.toBeNull();
    expect(co2Due(z, [], instantOf(z, '2026-07-28T11:05'), CO2_CRON_GRACE_MINUTES)).not.toBeNull();
    // …but not indefinitely.
    expect(co2Due(z, [], instantOf(z, '2026-07-28T11:06'), CO2_CRON_GRACE_MINUTES)).toBeNull();
  });

  it('stays silent for the rest of the day and all night', () => {
    const z = ZONES.la;
    for (const at of ['00:00', '03:00', '08:59', '12:00', '15:30', '19:00', '23:59']) {
      expect(co2Due(z, [], instantOf(z, `2026-07-28T${at}`), CO2_CRON_GRACE_MINUTES)).toBeNull();
    }
  });

  it('maps each half hour to its own slot and its own line', () => {
    const z = ZONES.utc;
    const cases: [string, number][] = [
      ['09:30', 0],
      ['09:59', 0],
      ['10:00', 1],
      ['10:29', 1],
      ['10:30', 2],
      ['10:59', 2],
      ['11:00', 3],
    ];
    for (const [at, slot] of cases) {
      const due = co2Due(z, [], instantOf(z, `2026-07-28T${at}`))!;
      expect(due.slot, at).toBe(slot);
      expect(due.body, at).toBe(CO2_TAGLINES[slot]);
      expect(due.title).toBe(CO2_TITLE);
      expect(due.day).toBe('2026-07-28');
    }
  });

  it('keeps the last slot through the grace, so grace never adds a fifth nudge', () => {
    const z = ZONES.utc;
    for (let m = 0; m <= CO2_CRON_GRACE_MINUTES; m++) {
      const at = `11:0${m}`;
      const due = co2Due(z, [], instantOf(z, `2026-07-28T${at}`), CO2_CRON_GRACE_MINUTES)!;
      expect(due.slot, at).toBe(CO2_TAGLINES.length - 1);
    }
  });

  it('never nudges at all for a zone it cannot read', () => {
    for (let m = 0; m < 1440; m += 7) {
      const t = new Date(Date.UTC(2026, 6, 28, 0, m));
      expect(co2Due('Not/AZone', [], t, CO2_CRON_GRACE_MINUTES)).toBeNull();
      expect(co2Due('', [], t, CO2_CRON_GRACE_MINUTES)).toBeNull();
    }
  });
});

describe('co2Due — already logged', () => {
  const z = ZONES.india;
  const logged = (localIso: string) => [{ date: instantOf(z, localIso).toISOString() }];

  it('goes quiet once the test is logged on that local day', () => {
    expect(co2Due(z, logged('2026-07-28T08:00'), instantOf(z, '2026-07-28T10:00'))).toBeNull();
    // Even a reading logged inside the window silences the rest of it.
    expect(co2Due(z, logged('2026-07-28T09:35'), instantOf(z, '2026-07-28T10:30'))).toBeNull();
    // And one logged just after midnight counts as today.
    expect(co2Due(z, logged('2026-07-28T00:05'), instantOf(z, '2026-07-28T09:30'))).toBeNull();
  });

  it('yesterday’s reading does not silence today', () => {
    expect(co2Due(z, logged('2026-07-27T23:59'), instantOf(z, '2026-07-28T09:30'))).not.toBeNull();
  });

  it('judges "today" in the device’s zone, not in UTC', () => {
    // 2026-07-27T22:00Z is already the 28th in Auckland and still the 27th in
    // Los Angeles. A phone in Auckland has logged today; one in LA has not.
    const reading = [{ date: '2026-07-27T22:00:00Z' }];
    expect(co2Due(ZONES.auckland, reading, instantOf(ZONES.auckland, '2026-07-28T09:30'))).toBeNull();
    expect(co2Due(ZONES.la, reading, instantOf(ZONES.la, '2026-07-28T09:30'))).not.toBeNull();
  });

  it('ignores malformed and empty entries instead of throwing', () => {
    const junk = [
      {},
      { date: null },
      { date: '' },
      { date: 'not a date' },
      { date: '2026-13-45T99:99:99Z' },
    ];
    expect(() => co2Due(z, junk, instantOf(z, '2026-07-28T09:30'))).not.toThrow();
    expect(co2Due(z, junk, instantOf(z, '2026-07-28T09:30'))).not.toBeNull();
    expect(co2Due(z, null, instantOf(z, '2026-07-28T09:30'))).not.toBeNull();
    expect(co2Due(z, undefined, instantOf(z, '2026-07-28T09:30'))).not.toBeNull();
  });
});

describe('co2Due — daylight saving', () => {
  // The window is defined in wall-clock time, so the whole point is that it
  // keeps opening at 09:30 on the mornings when the clocks have just moved.
  const days: [string, string][] = [
    [ZONES.la, '2026-03-08'], // spring forward, 02:00 -> 03:00
    [ZONES.la, '2026-11-01'], // fall back, 02:00 -> 01:00 (an hour happens twice)
    [ZONES.auckland, '2026-09-27'], // southern spring forward
    [ZONES.auckland, '2026-04-05'], // southern fall back
    [ZONES.lordHowe, '2026-10-04'], // a 30-minute DST shift
    [ZONES.lordHowe, '2026-04-05'],
  ];

  for (const [zone, day] of days) {
    it(`${zone} still opens at 09:30 on ${day}`, () => {
      expect(co2Due(zone, [], instantOf(zone, `${day}T09:29`))).toBeNull();
      const due = co2Due(zone, [], instantOf(zone, `${day}T09:30`))!;
      expect(due).not.toBeNull();
      expect(due.slot).toBe(0);
      expect(due.day).toBe(day);
      expect(co2Due(zone, [], instantOf(zone, `${day}T11:01`))).toBeNull();
    });
  }

  it('a reading logged on the long fall-back day still silences that day', () => {
    const zone = ZONES.la;
    // 01:30 happens twice on 2026-11-01; both instants are the same local day,
    // so either one must count as "logged today".
    const first = Date.parse('2026-11-01T08:30:00Z'); // 01:30 PDT
    const second = Date.parse('2026-11-01T09:30:00Z'); // 01:30 PST
    for (const t of [first, second]) {
      expect(
        co2Due(zone, [{ date: new Date(t).toISOString() }], instantOf(zone, '2026-11-01T10:00')),
      ).toBeNull();
    }
  });
});

describe('co2Due — a minute-by-minute sweep', () => {
  it('never exceeds four nudges a local day, and never fires outside the window', () => {
    for (const zone of Object.values(ZONES)) {
      const seen = new Map<string, Set<number>>();
      // Three whole UTC days at one-minute resolution, which covers every zone's
      // local morning at least twice over.
      const start = Date.UTC(2026, 6, 27, 0, 0);
      for (let m = 0; m < 3 * 24 * 60; m++) {
        const t = new Date(start + m * 60_000);
        const due = co2Due(zone, [], t, CO2_CRON_GRACE_MINUTES);
        if (!due) continue;

        const wall = wallClockIn(t, zone)!;
        expect(wall.minutes, `${zone} ${wall.day} ${wall.minutes}`).toBeGreaterThanOrEqual(CO2_WINDOW_START);
        expect(wall.minutes).toBeLessThanOrEqual(CO2_WINDOW_END + CO2_CRON_GRACE_MINUTES);
        expect(due.day).toBe(wall.day);
        expect(due.slot).toBeGreaterThanOrEqual(0);
        expect(due.slot).toBeLessThan(CO2_TAGLINES.length);

        const slots = seen.get(due.day) ?? new Set<number>();
        slots.add(due.slot);
        seen.set(due.day, slots);
      }
      for (const [day, slots] of seen) {
        // Distinct slots is what the de-dup ledger keys on, so this is the real
        // ceiling on how often a phone can buzz.
        expect(slots.size, `${zone} ${day}`).toBeLessThanOrEqual(CO2_TAGLINES.length);
      }
      // Every zone must have had a morning in three days.
      expect(seen.size, zone).toBeGreaterThanOrEqual(3);
    }
  });

  it('a logged reading ends that day’s nudges and does not touch the next', () => {
    const zone = ZONES.nepal;
    const reading = [{ date: instantOf(zone, '2026-07-28T09:40').toISOString() }];
    const fired: string[] = [];
    const start = Date.UTC(2026, 6, 27, 0, 0);
    for (let m = 0; m < 3 * 24 * 60; m++) {
      const t = new Date(start + m * 60_000);
      const due = co2Due(zone, reading, t, CO2_CRON_GRACE_MINUTES);
      if (due) fired.push(`${due.day}:${due.slot}`);
    }
    const days = new Set(fired.map((f) => f.split(':')[0]));
    expect(days.has('2026-07-28')).toBe(false); // silenced
    expect(days.has('2026-07-27')).toBe(true);
    expect(days.has('2026-07-29')).toBe(true);
  });
});

describe('the browser and the server agree', () => {
  it('produce the same slot and the same words for the same instant', () => {
    // co2Nudge reads the process clock; co2Due is told a zone. Handed this
    // process's own zone they must be indistinguishable — otherwise the app
    // would say one thing on screen and the push another.
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    let compared = 0;
    for (const at of ['09:29', '09:30', '09:45', '10:00', '10:30', '11:00', '11:01', '14:00']) {
      const t = instantOf(zone, `2026-07-28T${at}`);
      const server = co2Due(zone, [], t);
      const client = co2Nudge([], new Set(), t);
      if (!server || !client) {
        expect(server, at).toBeNull();
        expect(client, at).toBeNull();
        continue;
      }
      expect(client.slot, at).toBe(server.slot);
      expect(client.body, at).toBe(server.body);
      expect(client.title, at).toBe(server.title);
      compared++;
    }
    expect(compared).toBeGreaterThan(0);
  });

  it('share one copy of the constants, so the wording cannot drift', () => {
    expect(RECALL_TAGLINES).toBe(CO2_TAGLINES);
    expect(CO2_WINDOW_START).toBe(9 * 60 + 30);
    expect(CO2_WINDOW_END).toBe(11 * 60);
    expect(CO2_SLOT_MINUTES).toBe(30);
    // Four slots across a 90-minute window: 09:30, 10:00, 10:30 and the 11:00
    // last call. If a fifth line is ever added the window has to grow with it.
    expect((CO2_WINDOW_END - CO2_WINDOW_START) / CO2_SLOT_MINUTES + 1).toBe(CO2_TAGLINES.length);
  });
});
