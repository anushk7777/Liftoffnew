import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { analyzeVolume, muscleSetsByWeek, microcycleDays, classifyExercise } from './afterburn/volume';
import { weeklyVolume, volumeByProgramWeek, volumeTrend, detectPRs, weekAdherence, platesPerSide, exerciseProgress, formatVolume } from './afterburn/store';
import { recoveryReadiness, co2Band } from './afterburn/recovery';
import { weightTrendKgPerWeek } from './afterburn/nutrition';
import { streakFromDays, longestRunFromDays } from './lib/streak';
import { habitStreak, isHabitDueOn, missedLastDue } from './lib/habits';
import { onThisDay, byMonth, searchMoments, excerpt, songLink } from './kairos/moments';

const bad = ['', ' ', '0', '-5', 'abc', '8-10', '1e400', 'NaN', 'Infinity', '1,5', '٣'];
const problems: string[] = [];
const note = (w: string, e: unknown) => problems.push(`${w}: ${e instanceof Error ? e.message : String(e)}`);
const scan = (o: unknown, path: string) => {
  if (o == null) return;
  if (typeof o === 'number') { if (!Number.isFinite(o)) problems.push(`${path} = ${o}`); return; }
  if (Array.isArray(o)) return o.forEach((v, i) => scan(v, `${path}[${i}]`));
  if (typeof o === 'object') for (const [k, v] of Object.entries(o)) scan(v, `${path}.${k}`);
};
const S = (over: Record<string, unknown> = {}, sets: unknown[] = []) =>
  ({ id: 'x', date: '2026-01-05T10:00:00.000Z', completedAt: '2026-01-05T10:00:00.000Z',
     entries: [{ name: 'L', sets }], ...over }) as never;

describe('malformed data across the app', () => {
  it('never crashes and never produces a non-finite number', () => {
  // ---- Afterburn volume + store ----
  for (const w of bad) for (const r of bad) {
    const s = [S({}, [{ weight: w, reps: r, done: true }])];
    try { scan(analyzeVolume(s), `analyzeVolume(${w}|${r})`); } catch (e) { note(`analyzeVolume ${w}|${r}`, e); }
    try { scan(weeklyVolume(s), 'weeklyVolume'); } catch (e) { note('weeklyVolume', e); }
    try { scan(volumeByProgramWeek(s), 'volumeByProgramWeek'); } catch (e) { note('volumeByProgramWeek', e); }
    try { scan(exerciseProgress(s, 'L'), 'exerciseProgress'); } catch (e) { note('exerciseProgress', e); }
  }
  const structural: [string, never[]][] = [
    ['empty', [] as never[]],
    ['no entries', [S({ entries: [] })] as never[]],
    ['no sets', [S({}, [])] as never[]],
    ['bad date', [S({ date: 'zzz', completedAt: undefined }, [{ weight: '100', reps: '8', done: true }])] as never[]],
    ['same instant', [S({}, [{ weight: '100', reps: '8', done: true }]), S({}, [{ weight: '100', reps: '8', done: true }])] as never[]],
    ['missing set fields', [S({}, [{}])] as never[]],
  ];
  for (const [label, s] of structural) {
    for (const [fn, name] of [[analyzeVolume, 'analyzeVolume'], [muscleSetsByWeek, 'muscleSetsByWeek'], [microcycleDays, 'microcycleDays'], [weeklyVolume, 'weeklyVolume'], [volumeByProgramWeek, 'volumeByProgramWeek'], [volumeTrend, 'volumeTrend']] as const) {
      try { scan((fn as (x: unknown) => unknown)(s), `${name}/${label}`); } catch (e) { note(`${name}/${label}`, e); }
    }
    try { scan(detectPRs(s, s[0] ?? S()), `detectPRs/${label}`); } catch (e) { note(`detectPRs/${label}`, e); }
    try { scan(exerciseProgress(s, 'L'), `exerciseProgress/${label}`); } catch (e) { note(`exerciseProgress/${label}`, e); }
  }
  // weekAdherence with broken programs
  for (const p of [{ weeks: null }, { weeks: [{ id: 'w', name: 'w', days: null }] }, { weeks: [] }]) {
    try { scan(weekAdherence(p as never, [], 'w'), 'weekAdherence'); } catch (e) { note('weekAdherence', e); }
  }
  // plate calc
  for (const t of [0, -10, 1e308, NaN, 20, 20.3]) for (const barW of [0, -20, 20, NaN]) {
    try { scan(platesPerSide(t, barW, [25, 20, 10, 5, 2.5, 1.25]), `plates(${t},${barW})`); } catch (e) { note(`plates ${t}/${barW}`, e); }
    try { platesPerSide(t, barW, []); } catch (e) { note(`plates no-plates ${t}`, e); }
  }
  for (const v of [0, -1, NaN, Infinity, 1e12]) { try { formatVolume(v); } catch (e) { note(`formatVolume ${v}`, e); } }

  // ---- recovery / nutrition ----
  for (const arr of [[], [{ date: 'zzz', score: NaN }], [{ date: '2026-01-01', score: 0 }], [{ date: '2026-01-01', score: -5 }]]) {
    try { scan(recoveryReadiness(arr as never), 'recoveryReadiness'); } catch (e) { note('recoveryReadiness', e); }
  }
  for (const v of [0, -1, NaN, 1e9]) { try { co2Band(v); } catch (e) { note(`co2Band ${v}`, e); } }
  for (const arr of [[], [{ date: 'zzz', weight: 'abc' }], [{ date: '2026-01-01', weight: '0' }]]) {
    try { scan(weightTrendKgPerWeek(arr as never), 'weightTrend'); } catch (e) { note('weightTrend', e); }
  }

  // ---- streaks / habits ----
  for (const d of [new Set<string>(), new Set(['zzz']), new Set(['2026-13-45'])]) {
    try { scan(streakFromDays(d), 'streakFromDays'); } catch (e) { note('streakFromDays', e); }
    try { scan(longestRunFromDays(d), 'longestRunFromDays'); } catch (e) { note('longestRunFromDays', e); }
    for (const h of [{ cadence: 'daily', createdAt: 'zzz' }, { cadence: 'weekly', daysOfWeek: [], createdAt: '' }, { cadence: 'weekly', daysOfWeek: [99], createdAt: '2026-01-01' }]) {
      try { scan(habitStreak(d, h as never), 'habitStreak'); } catch (e) { note('habitStreak', e); }
      try { missedLastDue(d, h as never); isHabitDueOn(h as never, new Date()); } catch (e) { note('habit due', e); }
    }
  }

  // ---- kairos ----
  const moments = [{ id: '1', createdAt: 'zzz', text: 'a' }, { id: '2', createdAt: '2020-02-29T00:00:00Z', text: 'b' }, { id: '3', createdAt: '', text: '' }];
  try { onThisDay(moments as never); byMonth(moments as never); searchMoments(moments as never, 'a'); } catch (e) { note('kairos', e); }
  for (const t of ['', ' ', 'x'.repeat(10000)]) { try { excerpt(t); } catch (e) { note('excerpt', e); } }
  try { songLink({} as never); songLink({ song: '  ' } as never); } catch (e) { note('songLink', e); }
  for (const n of ['', ' ', 'x'.repeat(5000)]) { try { classifyExercise(n); } catch (e) { note('classify', e); } }

    writeFileSync('/tmp/bughunt.txt', problems.length
      ? `${problems.length} PROBLEM(S):\n` + [...new Set(problems)].slice(0, 40).join('\n')
      : 'Clean — no crashes, no non-finite values.');

    // Anything here reaches the user as a blank screen or a rendered "NaN".
    // This sweep originally found weekAdherence throwing on a program whose
    // `weeks` or `days` was missing — and it is called from Progress on every
    // render, so a throw there blanks the page rather than losing one number.
    expect([...new Set(problems)]).toEqual([]);
  });
});
