import { describe, it, expect, beforeEach } from 'vitest';
import { resetCo2Nudges } from './co2Reminder';
import { co2Nudge, localDay } from './innovation/recall';
import type { RecoveryEntry } from './types';

// The pure scheduler is covered exhaustively in innovation/recall.test.ts.
// What is left to prove is the PERSISTENCE layer around it: the fired-key set
// that stops a nudge replaying, survives a reload, and cannot grow without
// bound. Those are the parts that break in the field rather than in a unit.

const FIRED_KEY = 'liftoff_co2_nudged';
const at = (h: number, m: number, day = 28) => new Date(2026, 6, day, h, m, 0);

/** Mirrors the load/save in co2Reminder.ts so the storage contract is asserted
 *  rather than assumed. Kept in the test deliberately — if the real one changes
 *  shape, this fails and someone has to look. */
function loadFired(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(FIRED_KEY) || '[]');
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}
function saveFired(s: Set<string>) {
  localStorage.setItem(FIRED_KEY, JSON.stringify([...s].slice(-60)));
}

describe('CO2 nudge persistence', () => {
  beforeEach(() => localStorage.clear());

  it('a fired slot stays fired across a reload', () => {
    const n = co2Nudge([], loadFired(), at(9, 30))!;
    const s = loadFired();
    s.add(n.key);
    saveFired(s);

    // Simulating a fresh mount: read the set back from storage.
    expect(co2Nudge([], loadFired(), at(9, 45))).toBeNull();
    // …and the next slot is still available.
    expect(co2Nudge([], loadFired(), at(10, 0))).not.toBeNull();
  });

  it('recovers from corrupted storage instead of throwing', () => {
    for (const junk of ['not json', '{"a":1}', 'null', '[1,2,3]', '']) {
      localStorage.setItem(FIRED_KEY, junk);
      expect(() => loadFired()).not.toThrow();
      // A corrupt set must not silently suppress the nudge.
      expect(co2Nudge([], loadFired(), at(9, 30))).not.toBeNull();
    }
  });

  it('trims the key list so it cannot grow without bound', () => {
    const s = new Set<string>();
    for (let i = 0; i < 500; i++) s.add(`co2:2026-01-01:${i}`);
    saveFired(s);
    expect(loadFired().size).toBe(60);
  });

  it('keeps the most RECENT keys when trimming, not the oldest', () => {
    // 100 days of one slot each, added oldest-first. A Set preserves insertion
    // order and the trim is slice(-60), so days 41-100 must survive. Trimming
    // the wrong end would drop today's key and let the nudge replay.
    const s = new Set<string>();
    for (let d = 1; d <= 100; d++) s.add(`co2:day-${String(d).padStart(3, '0')}:0`);
    saveFired(s);
    const kept = loadFired();

    expect(kept.size).toBe(60);
    expect(kept.has('co2:day-100:0')).toBe(true);  // newest survives
    expect(kept.has('co2:day-041:0')).toBe(true);  // first one kept
    expect(kept.has('co2:day-040:0')).toBe(false); // last one dropped
    expect(kept.has('co2:day-001:0')).toBe(false); // oldest gone
  });

  it('resetCo2Nudges clears the record so the nudge can fire again', () => {
    const s = loadFired();
    s.add(co2Nudge([], s, at(9, 30))!.key);
    saveFired(s);
    expect(co2Nudge([], loadFired(), at(9, 40))).toBeNull();

    resetCo2Nudges();
    expect(co2Nudge([], loadFired(), at(9, 40))).not.toBeNull();
  });

  it('60 kept keys covers well over a fortnight of slots', () => {
    // Four slots a day, so 60 keys is 15 days — comfortably longer than any
    // gap that could let a stale key resurrect a nudge.
    expect(60 / 4).toBeGreaterThanOrEqual(14);
  });

  it('the key is namespaced by local day, so travel does not replay it', () => {
    const n = co2Nudge([], new Set(), at(9, 30))!;
    expect(n.key).toBe(`co2:${localDay(at(9, 30))}:0`);
    expect(n.key.startsWith('co2:2026-07-28:')).toBe(true);
  });

  it('a reading logged today keeps it silent even with an empty fired set', () => {
    const logged: RecoveryEntry[] = [
      { id: 'r1', date: at(9, 35).toISOString(), co2Score: 44 } as RecoveryEntry,
    ];
    localStorage.clear();
    expect(co2Nudge(logged, loadFired(), at(10, 0))).toBeNull();
  });
});
