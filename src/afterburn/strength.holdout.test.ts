import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { fitTrend, sessionPoints, Z_CRITICAL } from './strength';
import type { WorkoutSession } from './types';

// Is Z_CRITICAL overfitted?
//
// It was chosen by sweeping against simulated lifters — and then its
// performance was reported against THOSE SAME lifters. That is the classic
// mistake: tune on the data, score on the data, publish a flattering number.
// Nothing so far proves the threshold generalises rather than having latched
// onto quirks of four random seeds and one noise model.
//
// Three defences, and the threshold has to survive all of them:
//
//   1. HELD-OUT SEEDS — completely different draws to the ones tuned on. If the
//      numbers move much, the choice was fitted to the sample, not the problem.
//   2. REGIME SWEEP — noise, effect size, session count and rep drift varied
//      well outside the band it was tuned in. A threshold that only works at
//      4-8% noise and 4-9 sessions is not a threshold, it is a coincidence.
//   3. ADVERSARIAL NOISE — autocorrelated (a bad WEEK, not a bad day) and
//      skewed (sessions fail worse than they succeed). Both are how real
//      training data misbehaves, and neither was used in tuning. This is the
//      documented known weakness, tested rather than merely admitted.
//
// The bar: on lifters whose strength genuinely never moves, the engine must not
// invent a direction more than ~1 time in 4 in any regime with INDEPENDENT
// noise. Detection is allowed to fall away when the data gets hard — that is
// honest — but false confidence is not allowed to climb.
//
// Correlated and skewed noise are held to a separate, weaker bar, and this is
// deliberate. Testing found the threshold is NOT overfitted to the random seeds
// it was tuned on (held-out draws reproduce it to within 4 points) but IS
// fitted to the assumption that sessions are independent. On AR(1) noise the
// false-alarm rate roughly triples. A variance correction was implemented and
// then removed after it was measured to change nothing — see strength.ts. So
// these two cases assert the failure at its MEASURED size: they exist to catch
// it getting worse, not to pretend it is solved.

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const gauss = (r: () => number) => (r() + r() + r() + r() + r() + r() - 3) / Math.sqrt(0.5);

const DAY = 86_400_000;
const T0 = Date.parse('2026-01-05T10:00:00.000Z');

type NoiseKind = 'gaussian' | 'autocorrelated' | 'skewed';

interface Spec {
  r: () => number;
  sessions: number;
  start: number;
  trueGain: number;
  noise: number;
  repDrift: number;
  everyDays: number;
  noiseKind?: NoiseKind;
}

function makeLifter(o: Spec): WorkoutSession[] {
  const kind = o.noiseKind ?? 'gaussian';
  const out: WorkoutSession[] = [];
  let carry = 0; // for autocorrelation
  for (let i = 0; i < o.sessions; i++) {
    const frac = o.sessions > 1 ? i / (o.sessions - 1) : 0;
    const trueE1 = o.start + o.trueGain * frac;

    let shock: number;
    if (kind === 'autocorrelated') {
      // A bad patch persists: today is 70% yesterday's mood plus fresh noise.
      carry = 0.7 * carry + 0.3 * gauss(o.r);
      shock = carry / Math.sqrt(1 - 0.7 * 0.7); // rescale to comparable variance
    } else if (kind === 'skewed') {
      // Sessions fail worse than they succeed: occasional deep negatives.
      shock = o.r() < 0.18 ? -Math.abs(gauss(o.r)) * 2.2 : Math.abs(gauss(o.r)) * 0.55;
    } else {
      shock = gauss(o.r);
    }

    const observed = Math.max(1, trueE1 * (1 + shock * o.noise));
    const reps = Math.max(3, Math.round(10 + (o.r() - 0.5) * 2 * o.repDrift));
    const weight = observed / (1 + reps / 30);
    out.push({
      id: `s${i}`,
      date: new Date(T0 + i * o.everyDays * DAY).toISOString(),
      completedAt: new Date(T0 + i * o.everyDays * DAY).toISOString(),
      entries: [
        {
          name: 'L',
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

/** Fraction of lifters the engine claims are moving, at a given threshold. */
function movedRate(lifters: WorkoutSession[][], z = Z_CRITICAL): number {
  let moved = 0;
  for (const sess of lifters) {
    const t = fitTrend(sessionPoints(sess, 'L'));
    if (!t) continue;
    if (t.tStat >= z && Math.abs(t.gain) >= t.threshold) moved++;
  }
  return moved / lifters.length;
}

interface Regime {
  noise: number;
  sessions: number;
  drift: number;
  gainShare: number;
  noiseKind?: NoiseKind;
}

function cohort(kind: 'up' | 'flat', reg: Regime, seed: number, n = 200): WorkoutSession[][] {
  const r = rng(seed);
  const out: WorkoutSession[][] = [];
  for (let i = 0; i < n; i++) {
    const start = 40 + r() * 120;
    out.push(
      makeLifter({
        r,
        sessions: reg.sessions,
        start,
        trueGain: kind === 'up' ? start * reg.gainShare : 0,
        noise: reg.noise,
        repDrift: reg.drift,
        everyDays: 9,
        noiseKind: reg.noiseKind,
      }),
    );
  }
  return out;
}

// Seeds deliberately unrelated to the 11/22/33/44 used for tuning.
const HOLDOUT = [90210, 74747, 31337, 60613, 12480];

describe('is the threshold overfitted?', () => {
  it('holds up on completely unseen draws', () => {
    // Same regime it was tuned in, but five fresh seeds. If the tuned numbers
    // were a fluke of the original draws, these will disagree with them.
    const lines = ['Held-out seeds, tuning regime (noise 6%, 6 sessions, drift 1):', '', ' seed   caught   false alarm'];
    const reg: Regime = { noise: 0.06, sessions: 6, drift: 1, gainShare: 0.11 };
    const caughts: number[] = [];
    const falses: number[] = [];
    for (const seed of HOLDOUT) {
      const c = movedRate(cohort('up', reg, seed));
      const f = movedRate(cohort('flat', reg, seed + 7));
      caughts.push(c);
      falses.push(f);
      lines.push(`${String(seed).padStart(6)}  ${(c * 100).toFixed(0).padStart(6)}%  ${(f * 100).toFixed(0).padStart(11)}%`);
    }
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const spread = Math.max(...falses) - Math.min(...falses);
    lines.push('', `mean caught ${(mean(caughts) * 100).toFixed(0)}%, mean false alarm ${(mean(falses) * 100).toFixed(0)}%, spread across seeds ${(spread * 100).toFixed(0)} points`);
    writeFileSync('/tmp/holdout.txt', lines.join('\n'));

    // The tuning run reported ~11% false alarms. Unseen draws must land in the
    // same neighbourhood, not dramatically better.
    expect(mean(falses)).toBeLessThan(0.25);
    expect(mean(caughts)).toBeGreaterThan(0.25);
    // And it must not swing wildly from seed to seed.
    expect(spread).toBeLessThan(0.2);
  });

  it('does not fall apart outside the regime it was tuned in', () => {
    const regimes: [string, Regime][] = [
      ['tuned regime          ', { noise: 0.06, sessions: 6, drift: 1, gainShare: 0.11 }],
      ['very quiet lifter  2% ', { noise: 0.02, sessions: 6, drift: 1, gainShare: 0.11 }],
      ['very noisy lifter 15% ', { noise: 0.15, sessions: 6, drift: 1, gainShare: 0.11 }],
      ['tiny true gain     3% ', { noise: 0.06, sessions: 6, drift: 1, gainShare: 0.03 }],
      ['huge true gain    30% ', { noise: 0.06, sessions: 6, drift: 1, gainShare: 0.3 }],
      ['few sessions        4 ', { noise: 0.06, sessions: 4, drift: 1, gainShare: 0.11 }],
      ['many sessions      20 ', { noise: 0.06, sessions: 20, drift: 1, gainShare: 0.11 }],
      ['heavy rep drift     8 ', { noise: 0.06, sessions: 6, drift: 8, gainShare: 0.11 }],
      ['AUTOCORRELATED noise  ', { noise: 0.06, sessions: 6, drift: 1, gainShare: 0.11, noiseKind: 'autocorrelated' }],
      ['SKEWED noise          ', { noise: 0.06, sessions: 6, drift: 1, gainShare: 0.11, noiseKind: 'skewed' }],
    ];
    const lines = ['Regime sweep at the SHIPPED threshold, held-out seeds.', '', 'regime                   caught   false alarm'];
    let worstIndependent = 0;
    const correlated: Record<string, number> = {};
    for (const [label, reg] of regimes) {
      const c = movedRate(cohort('up', reg, 555001));
      const f = movedRate(cohort('flat', reg, 555002));
      if (reg.noiseKind) correlated[reg.noiseKind] = f;
      else worstIndependent = Math.max(worstIndependent, f);
      lines.push(`${label}  ${(c * 100).toFixed(0).padStart(6)}%  ${(f * 100).toFixed(0).padStart(11)}%`);
    }
    lines.push('', `worst false alarm, independent noise: ${(worstIndependent * 100).toFixed(0)}%`);
    lines.push(`autocorrelated: ${((correlated.autocorrelated ?? 0) * 100).toFixed(0)}%  ·  skewed: ${((correlated.skewed ?? 0) * 100).toFixed(0)}%  (known limitation)`);
    writeFileSync('/tmp/regimes.txt', lines.join('\n'));

    // Across every regime with INDEPENDENT noise — including ones far outside
    // the band it was tuned in — false confidence stays bounded. That is what
    // rules out overfitting to the tuning regime.
    expect(worstIndependent).toBeLessThan(0.25);

    // The known failure, asserted at its measured size so a regression shows up
    // as a test failure rather than as quietly worse advice.
    expect(correlated.autocorrelated).toBeGreaterThan(0.25); // it really is bad
    expect(correlated.autocorrelated).toBeLessThan(0.45); // …and must not worsen
    expect(correlated.skewed).toBeLessThan(0.3);
  });

  it('sits on a plateau, not a knife edge', () => {
    // A threshold that only works at exactly 1.25 would be fitted to the
    // sample. Neighbouring values should behave similarly.
    const reg: Regime = { noise: 0.06, sessions: 6, drift: 1, gainShare: 0.11 };
    const up = cohort('up', reg, 818181);
    const flat = cohort('flat', reg, 828282);
    const lines = ['Sensitivity of the choice itself (held-out seeds):', '', '    z   caught   false alarm'];
    const at: Record<string, { c: number; f: number }> = {};
    for (const z of [1.0, 1.15, 1.25, 1.35, 1.5]) {
      const c = movedRate(up, z);
      const f = movedRate(flat, z);
      at[String(z)] = { c, f };
      lines.push(`${z.toFixed(2).padStart(5)}  ${(c * 100).toFixed(0).padStart(6)}%  ${(f * 100).toFixed(0).padStart(11)}%`);
    }
    writeFileSync('/tmp/plateau.txt', lines.join('\n'));

    // Moving the threshold a little must move the outcome a little.
    expect(Math.abs(at['1.15'].f - at['1.25'].f)).toBeLessThan(0.15);
    expect(Math.abs(at['1.35'].f - at['1.25'].f)).toBeLessThan(0.15);
  });
});
