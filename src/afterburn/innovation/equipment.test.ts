import { describe, it, expect } from 'vitest';
import { equipmentOf, loadStep, stepShare } from './equipment';
import { loadHint, learnedLoadHint } from '../progression';

const noModel = { confidence: 'none' as const, predict: () => null, kgPerRpe: null };

describe('equipmentOf', () => {
  it('reads the equipment out of real program names', () => {
    expect(equipmentOf('Low Incline Smith Machine Press')).toBe('smith');
    expect(equipmentOf('DB Curl')).toBe('dumbbell');
    expect(equipmentOf('Machine Lateral Raise')).toBe('machine');
    expect(equipmentOf('Triceps Pressdown (Rope)')).toBe('cable');
    expect(equipmentOf('High-Bar Back Squat')).toBe('barbell');
  });

  it('puts a cable movement that names a bar attachment on the cable', () => {
    // "Straight-Bar Lat Prayer" is a cable lift; matching "straight bar" first
    // would call it a barbell and use the wrong step.
    expect(equipmentOf('Straight-Bar Lat Prayer')).toBe('cable');
    expect(equipmentOf('Cross-Body Lat Pull-Around')).toBe('cable');
  });

  it('prefers smith over the barbell keywords inside the same name', () => {
    expect(equipmentOf('Smith Machine Squat')).toBe('smith');
  });

  it('falls back to unknown rather than guessing', () => {
    expect(equipmentOf('Underwater Basket Weaving')).toBe('unknown');
  });
});

describe('loadStep', () => {
  it('gives a machine a bigger step than a barbell', () => {
    expect(loadStep('machine')).toBeGreaterThan(loadStep('barbell'));
  });

  it('keeps the old flat step for an unrecognised lift, so nothing regresses', () => {
    expect(loadStep('unknown')).toBe(2.5);
  });

  it('switches to imperial jumps in pounds', () => {
    expect(loadStep('barbell', 'lb')).toBe(5);
    expect(loadStep('machine', 'lb')).toBe(10);
  });

  it('shows how large a step feels against the load', () => {
    expect(Math.round(stepShare(10, 2.5) * 100)).toBe(25); // a 10kg dumbbell
    expect(Math.round(stepShare(100, 2.5) * 100)).toBe(3); // a 100kg barbell
  });
});

describe('loadHint when the smallest jump overshoots', () => {
  // 10 kg dumbbell curl, target RPE 9, logged 7 — genuinely light, but the
  // gap is worth 0.6 kg and the smallest pair up is 2.5 kg (25%).
  it('prescribes reps instead of an unmakeable weight', () => {
    const h = loadHint('10', '7', '9', 2.5, '12', '10');
    expect(h).not.toBeNull();
    expect(h!.kind).toBe('more-reps');
    expect(h!.suggested).toBe(10); // stays put
    expect(h!.step).toBe(2.5);
    expect(h!.stepPct).toBe(25);
  });

  it('used to say nothing at all in that case', () => {
    // The regression this guards: silence reads as "all good", so an easy set
    // stayed easy for months because no makeable jump existed.
    const h = loadHint('10', '7', '9', 2.5, '12', '10');
    expect(h).not.toBeNull();
  });

  it('still suggests weight when the jump is worth making', () => {
    // 100 kg barbell, same 2-point gap: 6 kg of headroom, which clears a
    // 2.5 kg step and rounds to 105.
    const h = loadHint('100', '7', '9', 2.5, '8', '8');
    expect(h!.kind).toBe('weight');
    expect(h!.suggested).toBe(105);
  });

  it('still puts a missed rep target ahead of everything', () => {
    // Light AND short of the target — the reps verdict wins, as before.
    const h = loadHint('10', '7', '9', 2.5, '4', '10');
    expect(h!.kind).toBe('reps');
  });

  it('stays silent when the set was not actually easy', () => {
    expect(loadHint('10', '9', '9', 2.5, '10', '10')).toBeNull();
  });
});

describe('learnedLoadHint and the equipment step', () => {
  it('lets a personal curve overturn a more-reps verdict when it clears the step', () => {
    // The flat 3%/point rule cannot clear 2.5 kg on a 10 kg dumbbell, but this
    // lifter's own model puts the target at 14 kg.
    const model = { confidence: 'good' as const, predict: () => 14, kgPerRpe: 2 };
    const h = learnedLoadHint('10', '7', '9', '10', '12', model, 2.5);
    expect(h!.kind).toBe('weight');
    expect(h!.suggested).toBe(15);
    expect(h!.basis).toBe('personal');
  });

  it('keeps more-reps when the personal curve agrees no makeable weight exists', () => {
    const model = { confidence: 'good' as const, predict: () => 10.4, kgPerRpe: 0.2 };
    const h = learnedLoadHint('10', '7', '9', '10', '12', model, 2.5);
    expect(h!.kind).toBe('more-reps');
    expect(h!.basis).toBe('rule');
  });

  it('passes a more-reps verdict through untouched with no model', () => {
    const h = learnedLoadHint('10', '7', '9', '10', '12', noModel, 2.5);
    expect(h!.kind).toBe('more-reps');
    expect(h!.stepPct).toBe(25);
  });
});
