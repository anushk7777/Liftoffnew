import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { sessionPoints, fitTrend, diagnoseFlat } from './strength';
import { liftReturns, substitutionIndex, targetRpeIndex } from './returns';
import { equipmentOf, loadStep } from './equipment';
import { buildLoadModel } from './loadModel';
import type { WorkoutSession } from './types';

// Real logs are messy: blank weights, "8-10" typed into a reps box, a session
// with no entries, two sessions at the same instant, absurd numbers. None of
// that should throw, and none of it should produce NaN/Infinity in a field the
// UI renders.
const BAD_STRINGS = ['', ' ', '0', '-5', 'abc', '8-10', '1e400', 'NaN', 'Infinity', '12.5.3', '٣', '1,5'];

const sess = (over: Partial<Record<string, unknown>> = {}, sets: unknown[] = []): WorkoutSession =>
  ({ id: 'x', date: '2026-01-05T10:00:00.000Z', completedAt: '2026-01-05T10:00:00.000Z',
     entries: [{ name: 'L', sets }], ...over }) as unknown as WorkoutSession;

const finite = (v: unknown): boolean =>
  typeof v !== 'number' || (Number.isFinite(v) && !Number.isNaN(v));

function scanFinite(obj: unknown, path: string, bad: string[]) {
  if (obj == null) return;
  if (typeof obj === 'number') { if (!finite(obj)) bad.push(path); return; }
  if (Array.isArray(obj)) { obj.forEach((v, i) => scanFinite(v, `${path}[${i}]`, bad)); return; }
  if (typeof obj === 'object') for (const [k, v] of Object.entries(obj)) scanFinite(v, `${path}.${k}`, bad);
}

describe('malformed data must not crash or produce NaN', () => {
  it('survives every shape a real log can take', () => {
  const problems: string[] = [];
  const note = (what: string, e: unknown) => problems.push(`${what}: ${e instanceof Error ? e.message : String(e)}`);

  // 1. Every malformed weight/reps/rpe combination.
  for (const w of BAD_STRINGS) for (const r of BAD_STRINGS) for (const rpe of BAD_STRINGS) {
    const s = [sess({}, [{ weight: w, reps: r, rpe, done: true }])];
    try {
      const pts = sessionPoints(s, 'L');
      scanFinite(pts, `points(${w}|${r}|${rpe})`, problems);
      const t = fitTrend(pts);
      if (t) scanFinite(t, `trend(${w}|${r}|${rpe})`, problems);
      const out = liftReturns(s, null, 90, new Date('2026-01-10T00:00:00Z'));
      scanFinite(out, `returns(${w}|${r}|${rpe})`, problems);
    } catch (e) { note(`malformed ${w}|${r}|${rpe}`, e); }
  }

  // 2. Structural nasties.
  const structural: [string, WorkoutSession[]][] = [
    ['no sessions', []],
    ['no entries', [sess({ entries: [] })]],
    ['no sets', [sess({}, [])]],
    ['bad date', [sess({ date: 'not-a-date', completedAt: undefined }, [{ weight: '100', reps: '8', done: true }])]],
    ['identical timestamps', [0,1,2,3,4].map(() => sess({}, [{ weight: '100', reps: '8', done: true }]))],
    ['huge numbers', [sess({}, [{ weight: '1e308', reps: '1e308', done: true }])]],
    ['negative', [sess({}, [{ weight: '-100', reps: '-8', done: true }])]],
    ['missing fields', [sess({}, [{} as never])]],
  ];
  for (const [label, s] of structural) {
    try {
      const pts = sessionPoints(s, 'L');
      scanFinite(pts, `points/${label}`, problems);
      const t = fitTrend(pts);
      if (t) scanFinite(t, `trend/${label}`, problems);
      if (pts.length) scanFinite(diagnoseFlat(pts, 9), `diagnose/${label}`, problems);
      scanFinite(liftReturns(s, null, 90, new Date('2026-01-10T00:00:00Z')), `returns/${label}`, problems);
      buildLoadModel(s, 'L');
    } catch (e) { note(label, e); }
  }

  // 3. Program indexes with broken programs.
  for (const p of [null, undefined, {} as never, { weeks: null } as never,
                   { weeks: [{ days: null }] } as never,
                   { weeks: [{ days: [{ exercises: null }] }] } as never]) {
    try { substitutionIndex(p); targetRpeIndex(p); } catch (e) { note('program index', e); }
  }

  // 4. Equipment with odd names.
  for (const n of ['', ' ', '123', '🏋️', 'a'.repeat(5000), 'DB '.repeat(500)]) {
    try { loadStep(equipmentOf(n)); } catch (e) { note(`equipment "${n.slice(0,12)}"`, e); }
  }

  writeFileSync('/tmp/fuzz.txt', problems.length
      ? `${problems.length} PROBLEM(S):\n` + [...new Set(problems)].slice(0, 40).join('\n')
      : 'No crashes and no non-finite values across every case.');

    // Anything here would reach the user as a crashed Progress screen or a
    // rendered "NaN". Fuzzing originally found substitutionIndex and
    // targetRpeIndex throwing "is not iterable" on a program whose `days` or
    // `exercises` was missing — reachable from a partial localStorage write or
    // an older schema, since the program object is persisted and restored
    // verbatim.
    expect([...new Set(problems)]).toEqual([]);
  });
});
