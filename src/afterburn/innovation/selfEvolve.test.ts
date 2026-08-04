// The self-evolving loop, end to end: prescribe → snapshot → lift → grade →
// calibrate → prescribe again.
//
// The tests that matter here are the ones that try to make the engine CHEAT.
// Anything can be made to report an improvement; the question is whether it can
// be made to report one it did not earn. So most of what follows sets a trap and
// asserts the engine walks around it.
import { describe, it, expect } from 'vitest';
import { prescribe, MAX_APPLIED_CORRECTION } from './prescribe';
import { gradeSession, gradeAll, accuracy, trend, accuracyByBasis } from './grade';
import type { GradedSet } from './grade';
import { calibrateLift, calibrateAll, evolutionSummary, rawMiss, missUnder, MAX_CORRECTION, PCT_PER_RPE, MIN_SETS_TO_CALIBRATE } from './calibrate';
import type { LoggedSet, PrescribedSet, WorkoutSession } from '../types';

const DAY = 86_400_000;
const T0 = Date.parse('2026-01-05T09:00:00.000Z');

/** The same median the engine uses, so the "what a naive fit would have said"
 *  comparisons below are apples to apples rather than an index lookup. */
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const set = (id: string, weight: number | '', reps: number | '', rpe: number | ''): LoggedSet => ({
  id,
  weight: String(weight),
  reps: String(reps),
  rpe: String(rpe),
  rating: 0,
  done: true,
});

/** A finished session carrying both a prescription and a result. */
function session(
  dayOffset: number,
  exercise: string,
  rows: { rx: Omit<PrescribedSet, 'exercise' | 'index'>; got: LoggedSet }[],
  extra: Partial<WorkoutSession> = {},
): WorkoutSession {
  const at = new Date(T0 + dayOffset * DAY).toISOString();
  return {
    id: `s${dayOffset}-${exercise}`,
    dayId: 'd1',
    dayName: 'Push',
    date: at,
    completedAt: at,
    entries: [{ exerciseId: 'e1', name: exercise, target: { reps: '8-10', rpe: '8' }, sets: rows.map((r) => r.got), notes: '' }],
    prescribed: rows.map((r, i) => ({ exercise, index: i, ...r.rx })),
    ...extra,
  };
}

/** N sessions of one lift where every set misses by the same amount. */
function biasedHistory(exercise: string, n: number, miss: number, correction = 1, from = 0): WorkoutSession[] {
  const out: WorkoutSession[] = [];
  for (let i = 0; i < n; i++) {
    out.push(
      session(from + i * 3, exercise, [0, 1, 2].map((k) => ({
        rx: { setId: `${exercise}-${i}-${k}`, weight: 100, reps: 8, rpe: 8, basis: 'personal', correction },
        // The miss lands entirely in the RPE channel: reps hit, effort off.
        got: set(`${exercise}-${i}-${k}`, 100, 8, 8 + miss),
      }))),
    );
  }
  return out;
}

describe('grading a prescription', () => {
  it('scores a set that came in harder than asked as too heavy', () => {
    const s = session(0, 'Bench', [
      { rx: { setId: 'a', weight: 100, reps: 8, rpe: 8, basis: 'personal' }, got: set('a', 100, 8, 9) },
    ]);
    const [g] = gradeSession(s);
    expect(g.miss).toBe(1); // one RPE point heavy
    expect(g.followed).toBe(true);
  });

  it('counts dropped reps and raised effort in the same direction', () => {
    const s = session(0, 'Bench', [
      { rx: { setId: 'a', weight: 100, reps: 10, rpe: 8, basis: 'personal' }, got: set('a', 100, 8, 9) },
    ]);
    // +1 RPE, −2 reps → 3 points too heavy.
    expect(gradeSession(s)[0].miss).toBe(3);
  });

  it('calls more reps at proportionally more effort a wash', () => {
    const s = session(0, 'Bench', [
      { rx: { setId: 'a', weight: 100, reps: 10, rpe: 8, basis: 'personal' }, got: set('a', 100, 12, 9) },
    ]);
    // +1 RPE, +2 reps → −1: fractionally light, not a failure.
    expect(gradeSession(s)[0].miss).toBe(-1);
  });

  it('refuses to grade a set logged without an RPE', () => {
    const s = session(0, 'Bench', [
      { rx: { setId: 'a', weight: 100, reps: 8, rpe: 8, basis: 'personal' }, got: set('a', 100, 8, '') },
    ]);
    // Guessing here would poison the very dataset this exists to build.
    expect(gradeSession(s)).toHaveLength(0);
  });

  it('grades nothing from a day the lifter flagged as rough', () => {
    const s = session(0, 'Bench', [
      { rx: { setId: 'a', weight: 100, reps: 8, rpe: 8, basis: 'personal' }, got: set('a', 100, 8, 10) },
    ], { roughDay: true });
    expect(gradeSession(s)).toHaveLength(0);
  });

  it('marks a set done at a different weight as not followed, but still grades it', () => {
    const s = session(0, 'Bench', [
      { rx: { setId: 'a', weight: 100, reps: 8, rpe: 8, basis: 'personal' }, got: set('a', 90, 8, 8) },
    ]);
    const [g] = gradeSession(s);
    expect(g.followed).toBe(false);
    expect(g.miss).toBe(0); // the question is whether the number was right, not whether it was obeyed
  });

  // THE PRUNING TRAP. Finishing a session drops blank sets and closes the gap,
  // so a positional lookup hands back the wrong set — and the engine gets
  // scored on a prediction it never made.
  it('grades by set id, not by position, after blank sets are pruned', () => {
    const s: WorkoutSession = {
      id: 'x',
      dayId: 'd1',
      dayName: 'Push',
      date: new Date(T0).toISOString(),
      completedAt: new Date(T0).toISOString(),
      // Set 1 was skipped. What survives finishing is [set2, set3] at
      // positions 0 and 1.
      entries: [{ exerciseId: 'e1', name: 'Bench', target: {}, sets: [set('s2', 100, 8, 8), set('s3', 95, 8, 9)], notes: '' }],
      prescribed: [
        { exercise: 'Bench', index: 0, setId: 's1', weight: 110, reps: 8, rpe: 8, basis: 'personal' },
        { exercise: 'Bench', index: 1, setId: 's2', weight: 100, reps: 8, rpe: 8, basis: 'personal' },
        { exercise: 'Bench', index: 2, setId: 's3', weight: 95, reps: 8, rpe: 9, basis: 'personal' },
      ],
    };
    const g = gradeSession(s);
    // s1 was never performed, so it cannot be graded at all.
    expect(g.map((x) => x.setId ?? x.index)).toEqual([1, 2]);
    expect(g.every((x) => x.miss === 0)).toBe(true);

    // The same data graded positionally would have matched s1's 110 kg
    // prescription against s2's 100 kg result and invented a miss.
    const positional: WorkoutSession = { ...s, prescribed: s.prescribed!.map((p) => ({ ...p, setId: undefined })) };
    expect(gradeSession(positional)[0].prescribedWeight).toBe(110);
    expect(gradeSession(positional)[0].actualWeight).toBe(100);
  });

  it('reports accuracy from the median, so one fat-fingered weight cannot rewrite it', () => {
    const graded = gradeAll([
      ...biasedHistory('Row', 4, 0.5),
      // One set typed as RPE 10 against a target of 8 on a 500 kg entry.
      session(99, 'Row', [{ rx: { setId: 'oops', weight: 100, reps: 8, rpe: 8, basis: 'personal' }, got: set('oops', 500, 1, 10) }]),
    ]);
    // 13 sets: twelve at 0.5, one at +9. A mean would read ~1.15.
    expect(accuracy(graded).medianMiss).toBe(0.5);
  });
});

describe('the correction, applied', () => {
  // The prescriber enforces its own ceiling as well as the calibrator. This
  // asserts the two numbers cannot drift apart in a later edit.
  it('caps at the same limit the calibrator uses', () => {
    expect(MAX_APPLIED_CORRECTION).toBe(MAX_CORRECTION);
  });

  const history: WorkoutSession[] = [
    session(0, 'Bench', [{ rx: { setId: 'a', weight: 100, reps: 10, rpe: 8, basis: 'rule' }, got: set('a', 100, 10, 8) }]),
  ];

  it('shades the population rule and says so', () => {
    const plain = prescribe({ exercise: 'Bench', workingSets: 1, reps: '10', rpe: '8', sessions: history, now: new Date(T0 + DAY) });
    const shaded = prescribe({ exercise: 'Bench', workingSets: 1, reps: '10', rpe: '8', sessions: history, now: new Date(T0 + DAY), correction: 0.95 });
    expect(plain.sets[0].weight).toBe(100);
    expect(shaded.sets[0].weight).toBe(95);
    // Stated as the weight it moved from — a percentage can survive a rounding
    // that the number on the card did not.
    expect(shaded.why).toContain('Shaded down from 100kg');
    // And it must not still claim to be repeating last time's weight.
    expect(shaded.why).not.toContain('Repeating it');
  });

  it('leaves a repeat alone — the instruction is the weight', () => {
    // Reps missed last time, so the rung is `repeat`: same weight, clear the
    // reps. Scaling it would contradict the sentence printed beside it.
    const missed: WorkoutSession[] = [
      session(0, 'Bench', [{ rx: { setId: 'a', weight: 100, reps: 10, rpe: 8, basis: 'rule' }, got: set('a', 100, 6, 9) }]),
    ];
    const rx = prescribe({ exercise: 'Bench', workingSets: 1, reps: '10', rpe: '8', sessions: missed, now: new Date(T0 + DAY), correction: 0.9 });
    expect(rx.basis).toBe('repeat');
    expect(rx.sets[0].weight).toBe(100);
  });

  // FOUND ON SCREEN, NOT BY A TEST. A 3% shade on 40 kg is 38.8, which rounds
  // straight back to 40 on a 2.5 kg step — and the card read "Shaded down 3%"
  // above three sets all showing 40 kg. Every claim has to survive the rounding
  // that happens after it.
  it('stays silent about a correction the equipment rounds away', () => {
    const coarse: WorkoutSession[] = [
      session(0, 'Barbell Row', [{ rx: { setId: 'a', weight: 40, reps: 10, rpe: 8, basis: 'rule' }, got: set('a', 40, 10, 8) }]),
    ];
    const rx = prescribe({ exercise: 'Barbell Row', workingSets: 1, reps: '10', rpe: '8', sessions: coarse, now: new Date(T0 + DAY), correction: 0.97 });
    // 40 × 0.97 = 38.8 → back to 40 on the barbell step.
    expect(rx.sets[0].weight).toBe(40);
    expect(rx.why).not.toMatch(/Shaded/);
    // …and it must go back to saying it is repeating last time, because it is.
    expect(rx.why).toContain('Repeating it');
    // The set records that NO correction reached the bar. Recording the 0.97
    // that was asked for would make the calibrator subtract an adjustment that
    // never happened and demand a bigger one next time.
    expect(rx.sets[0].correction).toBe(1);
  });

  it('names the weight it moved to, not a percentage', () => {
    const fine: WorkoutSession[] = [
      session(0, 'Cable Fly', [{ rx: { setId: 'a', weight: 20, reps: 10, rpe: 8, basis: 'rule' }, got: set('a', 20, 10, 8) }]),
    ];
    const rx = prescribe({ exercise: 'Cable Fly', workingSets: 1, reps: '10', rpe: '8', sessions: fine, now: new Date(T0 + DAY), correction: 0.9 });
    expect(rx.sets[0].weight).toBeLessThan(20);
    // The number in the sentence must be one that appears on the card.
    expect(rx.why).toMatch(/Shaded down from 20kg/);
    // Here it did reach the bar, so the set records the realised factor — and
    // it is the ratio the plates made, not the 0.9 that was requested.
    expect(rx.sets[0].correction).toBe(Math.round((rx.sets[0].weight! / 20) * 1000) / 1000);
    expect(rx.sets[0].correction).toBeLessThan(1);
  });

  it('records no correction on a rung the correction does not touch', () => {
    const missed: WorkoutSession[] = [
      session(0, 'Cable Fly', [{ rx: { setId: 'a', weight: 20, reps: 10, rpe: 8, basis: 'rule' }, got: set('a', 20, 6, 9) }]),
    ];
    const rx = prescribe({ exercise: 'Cable Fly', workingSets: 3, reps: '10', rpe: '8', sessions: missed, now: new Date(T0 + DAY), correction: 0.9 });
    expect(rx.basis).toBe('repeat');
    expect(rx.sets.every((s) => s.correction === 1)).toBe(true);
  });

  it('refuses an absurd factor from a buggy caller', () => {
    const wild = prescribe({ exercise: 'Bench', workingSets: 1, reps: '10', rpe: '8', sessions: history, now: new Date(T0 + DAY), correction: 3 });
    expect(wild.sets[0].weight).toBe(110); // +10%, not +200%
    const nan = prescribe({ exercise: 'Bench', workingSets: 1, reps: '10', rpe: '8', sessions: history, now: new Date(T0 + DAY), correction: Number.NaN });
    expect(nan.sets[0].weight).toBe(100);
  });
});

describe('self-calibration', () => {
  it('adopts a correction for a lift that consistently runs heavy', () => {
    const graded = gradeAll(biasedHistory('Bench', 6, 1)); // 18 sets, all +1 RPE
    const { correction, event } = calibrateLift('Bench', graded);
    expect(event.outcome).toBe('adopted');
    expect(correction?.factor).toBe(0.97); // 1 RPE ≈ 3%
    expect(event.errorAfter).toBeLessThan(event.errorBefore);
    expect(event.note).toContain('heavy');
  });

  it('refuses to change anything on too little data', () => {
    const graded = gradeAll(biasedHistory('Bench', 2, 1)); // 6 sets
    const { correction, event } = calibrateLift('Bench', graded);
    expect(correction).toBeNull();
    expect(event.outcome).toBe('rejected-too-few');
    expect(graded.length).toBeLessThan(MIN_SETS_TO_CALIBRATE);
  });

  // THE CIRCULARITY TRAP. Fitting on everything and reporting the improvement
  // always shows a gain, because a constant offset can always reduce error on
  // the data it was computed from. Walk-forward is the whole defence.
  it('rejects a correction fitted to a bias that then reverses', () => {
    const graded = gradeAll([
      ...biasedHistory('Bench', 5, 1.5, 1, 0), // early: ran heavy
      ...biasedHistory('Bench', 5, -1.5, 1, 30), // later: ran light
    ]);
    const { correction, event } = calibrateLift('Bench', graded);
    expect(correction).toBeNull();
    expect(event.outcome).toBe('rejected-no-gain');
    expect(event.errorAfter).toBeGreaterThan(event.errorBefore);

    // Proof the trap was real. Pooled, the two halves cancel to a bias of zero:
    // a naive fit would report this lift as perfectly calibrated while it is in
    // fact wrong by 1.5 points in both directions.
    expect(median(graded.map((g) => g.miss))).toBe(0);
    expect(median(graded.map((g) => Math.abs(g.miss)))).toBe(1.5);
  });

  it('flags a lift that wants an implausible correction instead of absorbing it', () => {
    const graded = gradeAll(biasedHistory('Bench', 6, 5)); // 5 RPE out = 15%
    const { correction, event } = calibrateLift('Bench', graded);
    expect(correction).toBeNull();
    expect(event.outcome).toBe('rejected-clamped');
    expect(event.note).toMatch(/equipment|injury|exercise/);
  });

  it('keeps a rejection in the log, not just the adoptions', () => {
    const graded = gradeAll([...biasedHistory('Bench', 6, 1), ...biasedHistory('Row', 1, 1, 1, 50)]);
    const { events } = calibrateAll(graded);
    expect(events.map((e) => e.exercise).sort()).toEqual(['Bench', 'Row']);
    expect(events.find((e) => e.exercise === 'Row')!.outcome).toBe('rejected-too-few');
  });

  // THE OSCILLATION TRAP. A correction that works drives later misses to zero.
  // Pooling those with the sets that earned it would report "no bias", retract
  // the correction, and let the bias come straight back — forever.
  it('holds a correction steady once it is working', () => {
    // Six outings that ran 1 RPE heavy with no correction, then six more that
    // landed perfectly WITH the −3% correction in force.
    const graded = gradeAll([
      ...biasedHistory('Bench', 6, 1, 1, 0),
      ...biasedHistory('Bench', 6, 0, 0.97, 30),
    ]);
    // Each corrected set reads as a miss of 0 on the day…
    expect(graded[graded.length - 1].miss).toBe(0);
    // …but as +1 once the correction it was given is undone.
    expect(rawMiss(graded[graded.length - 1])).toBeCloseTo(1, 6);

    const { correction, event } = calibrateLift('Bench', graded);
    expect(event.outcome).toBe('adopted');
    expect(correction?.factor).toBe(0.97); // held, not retracted

    // Without the normalisation, the pooled median is half the real bias and
    // the proposal drifts halfway back towards no correction at all — which is
    // exactly the hunting this guard exists to prevent.
    const pooled = median(graded.map((g) => g.miss));
    expect(pooled).toBe(0.5);
    expect(1 - pooled * PCT_PER_RPE).toBe(0.985); // vs the 0.97 that is actually right
  });

  it('measures a corrected set against the no-correction baseline', () => {
    const g: GradedSet = { ...gradeAll(biasedHistory('Bench', 1, 0, 0.97))[0] };
    expect(missUnder(g, 0.97)).toBeCloseTo(0, 6);
    expect(missUnder(g, 1)).toBeCloseTo(1, 6);
  });
});

describe('what it reports about itself', () => {
  it('says nothing about a trend it cannot see', () => {
    expect(trend(gradeAll(biasedHistory('Bench', 2, 1))).direction).toBe('unknown');
  });

  it('calls a shrinking miss improving and a widening one worsening', () => {
    const better = gradeAll([...biasedHistory('Bench', 5, 2, 1, 0), ...biasedHistory('Bench', 5, 0.2, 1, 30)]);
    expect(trend(better).direction).toBe('improving');
    const worse = gradeAll([...biasedHistory('Bench', 5, 0.2, 1, 0), ...biasedHistory('Bench', 5, 2, 1, 30)]);
    expect(trend(worse).direction).toBe('worsening');
  });

  it('will not call noise movement', () => {
    const flat = gradeAll([...biasedHistory('Bench', 5, 1, 1, 0), ...biasedHistory('Bench', 5, 1.1, 1, 30)]);
    expect(trend(flat).direction).toBe('steady');
  });

  it('splits accuracy by which rung produced the number', () => {
    const graded = gradeAll([
      session(0, 'Bench', [{ rx: { setId: 'a', weight: 100, reps: 8, rpe: 8, basis: 'personal' }, got: set('a', 100, 8, 8) }]),
      session(3, 'Bench', [{ rx: { setId: 'b', weight: 100, reps: 8, rpe: 8, basis: 'rule' }, got: set('b', 100, 8, 10) }]),
    ]);
    const by = accuracyByBasis(graded);
    expect(by.personal.medianMiss).toBe(0);
    expect(by.rule.medianMiss).toBe(2);
  });

  it('reports honestly when it has changed nothing', () => {
    const graded = gradeAll(biasedHistory('Bench', 1, 1));
    const { corrections, events } = calibrateAll(graded);
    const evo = evolutionSummary(events, corrections);
    expect(evo.adopted).toBe(0);
    expect(evo.decisions).toBe(1);
    expect(evo.active).toEqual([]);
    // Vacuously true with nothing adopted — the UI only prints this line when
    // there IS something to stand behind.
    expect(evo.everyChangeHelped).toBe(true);
  });

  it('names the lifts currently carrying a correction, and by how much', () => {
    const graded = gradeAll(biasedHistory('Bench', 6, 1));
    const { corrections, events } = calibrateAll(graded);
    const evo = evolutionSummary(events, corrections);
    expect(evo.adopted).toBe(1);
    expect(evo.active).toEqual([{ exercise: 'Bench', pct: -3 }]);
    expect(evo.everyChangeHelped).toBe(true);
  });

  it('stops claiming every change helped the moment one did not', () => {
    const evo = evolutionSummary(
      [
        { at: '', exercise: 'A', outcome: 'adopted', from: 1, to: 0.97, errorBefore: 1, errorAfter: 0.2, samples: 20, holdout: 8, threshold: 0.1, note: '' },
        { at: '', exercise: 'B', outcome: 'adopted', from: 1, to: 1.03, errorBefore: 0.5, errorAfter: 0.9, samples: 20, holdout: 8, threshold: 0.1, note: '' },
      ],
      { A: 0.97, B: 1.03 },
    );
    expect(evo.everyChangeHelped).toBe(false);
  });
});

describe('the whole loop', () => {
  it('runs a heavy lift back onto target and then leaves it there', () => {
    // Six outings where the app's number came in 1 RPE heavy every time.
    let history = biasedHistory('Bench', 6, 1);
    let corrections = calibrateAll(gradeAll(history)).corrections;
    expect(corrections.Bench).toBe(0.97);

    // Which is what the next prescription now uses.
    const rx = prescribe({
      exercise: 'Bench',
      workingSets: 3,
      reps: '8',
      rpe: '8',
      sessions: history,
      now: new Date(T0 + 40 * DAY),
      correction: corrections.Bench,
    });
    expect(rx.sets[0].weight!).toBeLessThan(100);

    // Six more outings at the corrected weight, now landing on target.
    history = [...history, ...biasedHistory('Bench', 6, 0, 0.97, 30)];
    corrections = calibrateAll(gradeAll(history)).corrections;
    expect(corrections.Bench).toBe(0.97); // stable, not unwound

    // And the engine's own scorecard shows the improvement it actually made.
    const t = trend(gradeAll(history));
    expect(t.direction).toBe('improving');
    expect(t.recent).toBeLessThan(t.previous);
  });

  it('leaves a lift that was already accurate completely alone', () => {
    const history = biasedHistory('Bench', 8, 0);
    const { corrections, events } = calibrateAll(gradeAll(history));
    expect(corrections.Bench).toBe(1);
    expect(events[0].outcome).toBe('rejected-no-gain');
    // Nothing to fix, so nothing was fixed — and the prescription is untouched.
    const a = prescribe({ exercise: 'Bench', workingSets: 1, reps: '8', rpe: '8', sessions: history, now: new Date(T0 + 40 * DAY) });
    const b = prescribe({ exercise: 'Bench', workingSets: 1, reps: '8', rpe: '8', sessions: history, now: new Date(T0 + 40 * DAY), correction: corrections.Bench });
    expect(b.sets[0].weight).toBe(a.sets[0].weight);
    expect(b.why).toBe(a.why);
  });
});
