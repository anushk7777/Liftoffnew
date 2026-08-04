import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fitTrend, sessionPoints, DRIFT_PER_REP, MIN_MEANINGFUL_KG, Z_CRITICAL } from './strength';
import type { WorkoutSession } from '../types';

/** Where the backtest dumps its working, when it can.
 *
 *  These files are diagnostics for a human reading a calibration run, not
 *  assertions — so the write must never be able to fail the suite. It used to be
 *  a hardcoded absolute path inside one machine's scratch directory, which meant
 *  the whole test suite failed on every CI runner on earth: seven consecutive
 *  Sunday maintenance runs died here, and the failure looked like a dependency
 *  problem rather than a stray path.
 *
 *  `node_modules/.cache` is already gitignored and already exists wherever npm
 *  has run, which is everywhere this suite runs. */
function dumpLab(name: string, body: string): void {
  try {
    const dir = join(process.cwd(), 'node_modules', '.cache', 'liftoff-lab');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), body);
  } catch {
    /* a diagnostic dump is never worth failing a test over */
  }
}

// Calibration by backtest.
//
// The thresholds in strength.ts decide whether a lift is called "working" or
// "flat". Picking them by intuition is how you end up with a feature that is
// confidently wrong, so they are set here instead: simulate lifters whose truth
// is KNOWN, run the real code over them, and count how often it agrees.
//
// Four populations, each 200 lifters:
//   progressing — genuinely getting stronger
//   stalled     — genuinely flat, only noise moving
//   declining   — genuinely losing strength
//   drifting    — flat strength, but the rep count wanders (the trap: this
//                 manufactures fake e1RM movement and must NOT be called a trend)
//
// A good threshold catches the real movers without being fooled by the last two.

// Deterministic PRNG so the numbers in the committed report are reproducible.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
/** Roughly normal, via the mean of several uniforms. */
const gauss = (r: () => number) => (r() + r() + r() + r() + r() + r() - 3) / Math.sqrt(0.5);

const DAY = 86_400_000;
const T0 = Date.parse('2026-01-05T10:00:00.000Z');

/** Build a session history for one lift with known behaviour. */
function makeLifter(opts: {
  r: () => number;
  sessions: number;
  /** True e1RM at the start, and how much it truly changes across the window. */
  start: number;
  trueGain: number;
  /** Session-to-session noise, as a share of e1RM (trained lifters ~5-8%). */
  noise: number;
  /** Reps wander by up to this many, flat strength or not. */
  repDrift: number;
  everyDays: number;
}): WorkoutSession[] {
  const { r, sessions, start, trueGain, noise, repDrift, everyDays } = opts;
  const out: WorkoutSession[] = [];
  const baseReps = 10;
  for (let i = 0; i < sessions; i++) {
    const frac = sessions > 1 ? i / (sessions - 1) : 0;
    const trueE1 = start + trueGain * frac;
    const observed = trueE1 * (1 + gauss(r) * noise);
    // Reps wander independently of strength — this is what creates fake signal.
    const reps = Math.max(3, Math.round(baseReps + (r() - 0.5) * 2 * repDrift));
    // Invert Epley to get the load that yields this e1RM at these reps.
    const weight = observed / (1 + reps / 30);
    out.push({
      id: `s${i}`,
      date: new Date(T0 + i * everyDays * DAY).toISOString(),
      completedAt: new Date(T0 + i * everyDays * DAY).toISOString(),
      entries: [
        {
          name: 'Lift',
          sets: [0, 1, 2].map(() => ({
            weight: (Math.round(weight * 2) / 2).toFixed(1),
            reps: String(reps),
            rpe: '9',
            done: true,
          })),
        },
      ],
    } as unknown as WorkoutSession);
  }
  return out;
}

type Pop = 'progressing' | 'stalled' | 'declining' | 'drifting';

function population(kind: Pop, seed: number, n = 200) {
  const r = rng(seed);
  const lifters: WorkoutSession[][] = [];
  for (let i = 0; i < n; i++) {
    const start = 40 + r() * 120; // 40-160 kg e1RM, isolation through compound
    const sessions = 4 + Math.floor(r() * 6); // 4-9 sessions in the window
    const everyDays = 7 + Math.floor(r() * 5);
    const noise = 0.04 + r() * 0.04; // 4-8%
    const base = { r, sessions, start, noise, everyDays };
    if (kind === 'progressing') lifters.push(makeLifter({ ...base, trueGain: start * (0.06 + r() * 0.1), repDrift: 1 }));
    else if (kind === 'declining') lifters.push(makeLifter({ ...base, trueGain: -start * (0.06 + r() * 0.1), repDrift: 1 }));
    else if (kind === 'stalled') lifters.push(makeLifter({ ...base, trueGain: 0, repDrift: 1 }));
    else lifters.push(makeLifter({ ...base, trueGain: 0, repDrift: 5 })); // reps wander hard
  }
  return lifters;
}

/** Re-implements the decision with a given z, so thresholds can be swept. */
function callsAt(z: number, lifters: WorkoutSession[][]): { moved: number; total: number } {
  let moved = 0;
  for (const sess of lifters) {
    const t = fitTrend(sessionPoints(sess, 'Lift'));
    if (!t) continue;
    const passes = (t.tStat ?? 0) >= z && Math.abs(t.gain) >= t.threshold;
    if (passes) moved++;
  }
  return { moved, total: lifters.length };
}

describe('threshold calibration', () => {
  const pops: Record<Pop, WorkoutSession[][]> = {
    progressing: population('progressing', 11),
    stalled: population('stalled', 22),
    declining: population('declining', 33),
    drifting: population('drifting', 44),
  };

  it('sweeps the threshold and records what each choice costs', () => {
    const lines: string[] = [
      'Threshold sweep. 200 simulated lifters per population, known ground truth.',
      '',
      '  "caught"      = correctly called moving (progressing + declining)  -> want HIGH',
      '  "false alarm" = called moving when truth is flat (stalled)         -> want LOW',
      '  "drift fooled"= called moving when only the reps moved             -> want LOW',
      '',
      '   z    caught   false alarm   drift fooled   score',
    ];
    let best = { z: 0, score: -Infinity };
    for (const z of [0, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5]) {
      const prog = callsAt(z, pops.progressing);
      const decl = callsAt(z, pops.declining);
      const stal = callsAt(z, pops.stalled);
      const drif = callsAt(z, pops.drifting);
      const caught = (prog.moved + decl.moved) / (prog.total + decl.total);
      const falseAlarm = stal.moved / stal.total;
      const driftFooled = drif.moved / drif.total;
      // Being fooled is worse than missing something: a wrong call makes you
      // change a program for no reason, a missed call just waits another week.
      const score = caught - 1.5 * falseAlarm - 1.5 * driftFooled;
      if (score > best.score) best = { z, score };
      lines.push(
        `${z.toFixed(2).padStart(5)}  ${(caught * 100).toFixed(0).padStart(6)}%  ${(falseAlarm * 100).toFixed(0).padStart(10)}%  ${(driftFooled * 100).toFixed(0).padStart(12)}%   ${score.toFixed(3).padStart(6)}`,
      );
    }
    lines.push('', `best z = ${best.z} (score ${best.score.toFixed(3)})`);
    dumpLab('sweep.txt', lines.join('\n'));
    expect(best.z).toBeGreaterThanOrEqual(0);
  });

  it('sweeps how much evidence is needed before the call is trustworthy', () => {
    const lines: string[] = [
      'How detection improves with more sessions. z = 1.0 throughout.',
      '',
      'sessions   caught   false alarm   drift fooled',
    ];
    for (const nSessions of [4, 6, 8, 10, 12, 16, 20]) {
      const mk = (kind: Pop, seed: number) => {
        const r = rng(seed);
        const out: WorkoutSession[][] = [];
        for (let i = 0; i < 200; i++) {
          const start = 40 + r() * 120;
          const noise = 0.04 + r() * 0.04;
          const base = { r, sessions: nSessions, start, noise, everyDays: 9 };
          if (kind === 'progressing') out.push(makeLifter({ ...base, trueGain: start * (0.06 + r() * 0.1), repDrift: 1 }));
          else if (kind === 'declining') out.push(makeLifter({ ...base, trueGain: -start * (0.06 + r() * 0.1), repDrift: 1 }));
          else if (kind === 'stalled') out.push(makeLifter({ ...base, trueGain: 0, repDrift: 1 }));
          else out.push(makeLifter({ ...base, trueGain: 0, repDrift: 5 }));
        }
        return out;
      };
      const prog = callsAt(1.0, mk('progressing', 11));
      const decl = callsAt(1.0, mk('declining', 33));
      const stal = callsAt(1.0, mk('stalled', 22));
      const drif = callsAt(1.0, mk('drifting', 44));
      const caught = (prog.moved + decl.moved) / (prog.total + decl.total);
      lines.push(
        `${String(nSessions).padStart(8)}  ${(caught * 100).toFixed(0).padStart(6)}%  ${((stal.moved / stal.total) * 100).toFixed(0).padStart(10)}%  ${((drif.moved / drif.total) * 100).toFixed(0).padStart(12)}%`,
      );
    }
    dumpLab('sessions.txt', lines.join('\n'));
    expect(lines.length).toBeGreaterThan(3);
  });

  it('catches a useful share of genuinely progressing lifters', () => {
    const { moved, total } = callsAt(Z_CRITICAL, pops.progressing);
    expect(moved / total).toBeGreaterThan(0.3);
  });

  it('rarely calls a genuinely stalled lifter a mover', () => {
    const { moved, total } = callsAt(Z_CRITICAL, pops.stalled);
    expect(moved / total).toBeLessThan(0.15);
  });

  it('is not fooled by rep drift alone', () => {
    // The trap this whole design exists for: strength flat, reps wandering.
    const { moved, total } = callsAt(Z_CRITICAL, pops.drifting);
    expect(moved / total).toBeLessThan(0.2);
  });

  it('says "not enough signal" rather than "flat" when it could not have seen a gain', () => {
    // A noisy lift that failed the trend test must not be reported as a
    // finding — that is the bluff this distinction exists to prevent.
    let bluffs = 0;
    let honest = 0;
    for (const sess of pops.stalled) {
      const t = fitTrend(sessionPoints(sess, 'Lift'));
      if (!t || t.real) continue;
      if (t.underpowered) honest++;
      else bluffs++;
    }
    // Of the stalled lifters correctly not called movers, a meaningful share
    // should be admitted as unreadable rather than asserted as flat.
    expect(honest).toBeGreaterThan(0);
    expect(honest + bluffs).toBeGreaterThan(50);
  });

  it('the drift penalty is doing the work, not the significance test', () => {
    // Remove the drift term and the same population should get fooled more.
    let fooledWithout = 0;
    for (const sess of pops.drifting) {
      const t = fitTrend(sessionPoints(sess, 'Lift'));
      if (!t) continue;
      const naive = (t.tStat ?? 0) >= Z_CRITICAL && Math.abs(t.gain) >= MIN_MEANINGFUL_KG;
      if (naive) fooledWithout++;
    }
    const withDrift = callsAt(Z_CRITICAL, pops.drifting).moved;
    expect(fooledWithout).toBeGreaterThan(withDrift);
  });

  it('uses a drift penalty proportional to how far the reps moved', () => {
    expect(DRIFT_PER_REP).toBeGreaterThan(0);
    const steady = fitTrend(sessionPoints(makeLifter({ r: rng(7), sessions: 6, start: 100, trueGain: 0, noise: 0.05, repDrift: 0, everyDays: 10 }), 'Lift'))!;
    const wobbly = fitTrend(sessionPoints(makeLifter({ r: rng(7), sessions: 6, start: 100, trueGain: 0, noise: 0.05, repDrift: 6, everyDays: 10 }), 'Lift'))!;
    expect(wobbly.repDrift).toBeGreaterThan(steady.repDrift);
    expect(wobbly.threshold).toBeGreaterThan(steady.threshold);
  });
});
