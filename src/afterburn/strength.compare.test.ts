import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { fitTrend, sessionPoints } from './strength';
import type { WorkoutSession } from './types';

// OLD engine, reproduced exactly: best-set e1RM, OLS slope, flat 2.5kg/2% floor.
const epley = (w: number, r: number) => w * (1 + r / 30);
function oldVerdict(sessions: WorkoutSession[], name: string) {
  const series: { t: number; e: number }[] = [];
  for (const s of sessions) {
    const e = s.entries.find((x) => x.name === name);
    if (!e) continue;
    let best = 0;
    for (const st of e.sets) {
      const w = parseFloat(st.weight); const r = parseInt(st.reps, 10) || 0;
      if (Number.isFinite(w) && w > 0) best = Math.max(best, epley(w, r));
    }
    const t = Date.parse(s.completedAt ?? s.date);
    if (best > 0 && !Number.isNaN(t)) series.push({ t, e: best });
  }
  series.sort((a, b) => a.t - b.t);
  if (series.length < 3) return 'unknown';
  const span = (series[series.length - 1].t - series[0].t) / 864e5;
  if (span < 14) return 'unknown';
  const xs = series.map((p) => (p.t - series[0].t) / 864e5);
  const ys = series.map((p) => p.e);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  if (den === 0) return 'unknown';
  const m = num / den;
  const gain = m * (xs[xs.length - 1] - xs[0]);
  const noise = Math.max(2.5, my * 0.02);
  return gain < -noise ? 'declining' : gain <= noise ? 'flat' : gain > noise * 2 ? 'strong' : 'working';
}

function newVerdict(sessions: WorkoutSession[], name: string) {
  const pts = sessionPoints(sessions, name);
  if (pts.length < 3) return 'unknown';
  const span = (pts[pts.length - 1].t - pts[0].t) / 864e5;
  if (span < 14) return 'unknown';
  const t = fitTrend(pts);
  if (!t) return 'unknown';
  if (t.real) return t.gain < 0 ? 'declining' : t.gain > t.threshold * 2 ? 'strong' : 'working';
  return t.underpowered ? 'unknown' : 'flat';
}

function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const gauss = (r: () => number) => (r() + r() + r() + r() + r() + r() - 3) / Math.sqrt(0.5);

function lifter(r: () => number, n: number, start: number, trueGain: number, noise: number, drift: number): WorkoutSession[] {
  const T0 = Date.parse('2026-01-05T10:00:00.000Z');
  return Array.from({ length: n }, (_, i) => {
    const obs = (start + trueGain * (n > 1 ? i / (n - 1) : 0)) * (1 + gauss(r) * noise);
    const reps = Math.max(3, Math.round(10 + (r() - 0.5) * 2 * drift));
    const w = obs / (1 + reps / 30);
    return { id: `s${i}`, date: new Date(T0 + i * 9 * 864e5).toISOString(), completedAt: new Date(T0 + i * 9 * 864e5).toISOString(),
      entries: [{ name: 'Lift', sets: [0,1,2].map(() => ({ weight: (Math.round(w*2)/2).toFixed(1), reps: String(reps), rpe: '9', done: true })) }] } as unknown as WorkoutSession;
  });
}

describe('new engine vs the one it replaces', () => {
  const run = (mk: (r: () => number, s: number) => WorkoutSession[], seed: number) => {
    const r = rng(seed);
    let oldMoved = 0, newMoved = 0, newUnknown = 0; const n = 400;
    for (let i = 0; i < n; i++) {
      const sess = mk(r, 40 + r() * 120);
      const o = oldVerdict(sess, 'Lift'), nn = newVerdict(sess, 'Lift');
      if (o === 'strong' || o === 'working' || o === 'declining') oldMoved++;
      if (nn === 'strong' || nn === 'working' || nn === 'declining') newMoved++;
      if (nn === 'unknown') newUnknown++;
    }
    return { oldMoved: oldMoved / n, newMoved: newMoved / n, newUnknown: newUnknown / n };
  };

  it('stops inventing a direction for a lift that is genuinely going nowhere', () => {
    // The finding that justified this whole rewrite: on lifters whose strength
    // truly never moved, the old engine asserted a direction roughly two thirds
    // of the time. Most of the ledger's confident verdicts were noise.
    const flat = run((r, s) => lifter(r, 8, s, 0, 0.06, 1), 101);
    expect(flat.oldMoved).toBeGreaterThan(0.5);
    expect(flat.newMoved).toBeLessThan(0.25);
    expect(flat.newMoved).toBeLessThan(flat.oldMoved / 2);
  });

  it('is far harder to fool with a very noisy but flat lift', () => {
    const noisy = run((r, s) => lifter(r, 8, s, 0, 0.12, 1), 202);
    expect(noisy.oldMoved).toBeGreaterThan(0.6);
    expect(noisy.newMoved).toBeLessThan(0.3);
    // …and it says so, rather than picking a side.
    expect(noisy.newUnknown).toBeGreaterThan(0.4);
  });

  it('is not fooled by reps wandering while strength stands still', () => {
    const drift = run((r, s) => lifter(r, 8, s, 0, 0.06, 5), 303);
    expect(drift.oldMoved).toBeGreaterThan(0.5);
    expect(drift.newMoved).toBeLessThan(0.25);
  });

  it('still finds real movement, at a cost in sensitivity that is worth paying', () => {
    const up = run((r, s) => lifter(r, 8, s, s * 0.12, 0.06, 1), 404);
    // Lower than the old engine's 89% — but the old engine also "found"
    // movement in 64% of lifters who had none, so most of that was noise.
    expect(up.newMoved).toBeGreaterThan(0.35);
    // Discrimination is what matters: the gap between calling a real mover and
    // calling a stalled lifter a mover.
    const flat = run((r, s) => lifter(r, 8, s, 0, 0.06, 1), 101);
    expect(up.newMoved - flat.newMoved).toBeGreaterThan(up.oldMoved - flat.oldMoved);
  });
});

it('records the full old-vs-new table for the record', () => {
  const kinds = [
    ['genuinely progressing', (r: () => number, s: number) => lifter(r, 8, s, s * 0.12, 0.06, 1)],
    ['genuinely stalled',     (r: () => number, s: number) => lifter(r, 8, s, 0, 0.06, 1)],
    ['genuinely declining',   (r: () => number, s: number) => lifter(r, 8, s, -s * 0.12, 0.06, 1)],
    ['flat, but reps drift',  (r: () => number, s: number) => lifter(r, 8, s, 0, 0.06, 5)],
    ['flat and very noisy',   (r: () => number, s: number) => lifter(r, 8, s, 0, 0.12, 1)],
  ] as const;

  const out: string[] = ['OLD vs NEW verdicts. 400 simulated lifters per row, known ground truth.', ''];
  for (const [label, mk] of kinds) {
    const r = rng(label.length * 97 + 3);
    const tally: Record<string, Record<string, number>> = {};
    for (let i = 0; i < 400; i++) {
      const s = 40 + r() * 120;
      const sess = mk(r, s);
      const o = oldVerdict(sess, 'Lift'); const nn = newVerdict(sess, 'Lift');
      tally[o] ??= {}; tally[o][nn] = (tally[o][nn] ?? 0) + 1;
    }
    const pct = (n: number) => `${((n / 400) * 100).toFixed(0)}%`;
    const oldTot: Record<string, number> = {}; const newTot: Record<string, number> = {};
    for (const [o, m] of Object.entries(tally)) for (const [nn, c] of Object.entries(m)) { oldTot[o] = (oldTot[o] ?? 0) + c; newTot[nn] = (newTot[nn] ?? 0) + c; }
    const keys = ['strong', 'working', 'flat', 'declining', 'unknown'];
    out.push(`--- ${label} ---`);
    out.push(`  OLD: ${keys.filter(k => oldTot[k]).map(k => `${k} ${pct(oldTot[k])}`).join('  ')}`);
    out.push(`  NEW: ${keys.filter(k => newTot[k]).map(k => `${k} ${pct(newTot[k])}`).join('  ')}`);
    out.push('');
  }
  writeFileSync('/tmp/claude-0/-home-user-Liftoffnew/b5453a7c-91dd-57ef-9d9c-819db9424195/scratchpad/lab/compare.txt', out.join('\n'));
});
