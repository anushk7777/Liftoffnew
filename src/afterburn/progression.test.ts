import { describe, it, expect } from 'vitest';
import { setVerdict, ghostLabel, exerciseProgress, loadHint, learnedLoadHint } from './progression';
import type { LoggedSet } from './types';

const set = (weight: string, reps: string, rpe = ''): LoggedSet =>
  ({ id: `${weight}-${reps}`, weight, reps, rpe, rating: 0, done: true });

describe('setVerdict', () => {
  it('calls more weight at equal reps a win', () => {
    expect(setVerdict(set('82.5', '8'), set('80', '8'))).toEqual({ kind: 'up', label: '+2.5 kg' });
  });

  it('calls more reps at the same weight a win', () => {
    expect(setVerdict(set('80', '9'), set('80', '8'))).toEqual({ kind: 'up', label: '+1 rep' });
    expect(setVerdict(set('80', '10'), set('80', '8')).label).toBe('+2 reps');
  });

  it('says matched only when effort is unchanged too', () => {
    expect(setVerdict(set('80', '8', '8'), set('80', '8', '8'))).toEqual({ kind: 'same', label: 'matched' });
    // No RPE on either side — nothing left to distinguish them.
    expect(setVerdict(set('80', '8'), set('80', '8'))).toEqual({ kind: 'same', label: 'matched' });
  });

  it('counts the same weight at a lower RPE as progress', () => {
    // 100kg x 5 felt like RPE 6 last week and RPE 5 today: you got stronger,
    // and this is the moment you are ready to add load.
    const v = setVerdict(set('100', '5', '5'), set('100', '5', '6'));
    expect(v.kind).toBe('up');
    expect(v.label).toContain('RPE');
  });

  it('flags the same weight costing more effort', () => {
    const v = setVerdict(set('100', '5', '8'), set('100', '5', '6'));
    expect(v.kind).toBe('down');
    expect(v.label).toContain('+2 RPE');
  });

  it('handles half-point RPE', () => {
    expect(setVerdict(set('100', '5', '7.5'), set('100', '5', '8')).kind).toBe('up');
  });

  it('does not invent an effort verdict when only one side logged RPE', () => {
    expect(setVerdict(set('80', '8', '7'), set('80', '8'))).toEqual({ kind: 'same', label: 'matched' });
  });

  it('reports a genuine drop', () => {
    expect(setVerdict(set('75', '8'), set('80', '8'))).toEqual({ kind: 'down', label: '-5 kg' });
    expect(setVerdict(set('80', '6'), set('80', '8')).kind).toBe('down');
  });

  it('refuses to award heavier-for-fewer-reps as progress', () => {
    // That trade is the lifter's judgement, not something to green-chip.
    const v = setVerdict(set('85', '5'), set('80', '8'));
    expect(v.kind).toBe('same');
    expect(v.label).toContain('+5 kg');
  });

  it('stays silent until both sides have a weight and reps', () => {
    expect(setVerdict(set('80', ''), set('80', '8')).kind).toBe('none');
    expect(setVerdict(set('80', '8'), undefined).kind).toBe('none');
    expect(setVerdict(undefined, set('80', '8')).kind).toBe('none');
  });

  it('ignores unparseable input rather than guessing', () => {
    expect(setVerdict(set('heavy', '8'), set('80', '8')).kind).toBe('none');
  });

  it('honours the unit label', () => {
    expect(setVerdict(set('180', '8'), set('175', '8'), 'lb').label).toBe('+5 lb');
  });
});

describe('ghostLabel', () => {
  it('formats weight, reps and RPE', () => {
    expect(ghostLabel(set('80', '8', '8'))).toBe('80×8 @8');
  });

  it('omits RPE when absent', () => {
    expect(ghostLabel(set('80', '8'))).toBe('80×8');
  });

  it('is null when the set holds nothing', () => {
    expect(ghostLabel(set('', ''))).toBeNull();
    expect(ghostLabel(undefined)).toBeNull();
  });
});

describe('exerciseProgress', () => {
  it('reads total volume, not a single lucky set', () => {
    // Set 1 up, sets 2-3 down: overall this is not progress.
    const now = [set('85', '8'), set('70', '6'), set('70', '6')];
    const then = [set('80', '8'), set('80', '8'), set('80', '8')];
    expect(exerciseProgress(now, then).kind).toBe('down');
  });

  it('reports a real increase as a percentage', () => {
    const now = [set('80', '10'), set('80', '10')];
    const then = [set('80', '8'), set('80', '8')];
    const r = exerciseProgress(now, then);
    expect(r.kind).toBe('up');
    expect(r.pct).toBeCloseTo(25, 0);
  });

  it('only counts positions logged on both sides', () => {
    const now = [set('80', '8'), set('80', '8')];
    const then = [set('80', '8')]; // no second set last time
    expect(exerciseProgress(now, then)).toEqual({ kind: 'same', pct: 0 });
  });

  it('says nothing with no comparable history', () => {
    expect(exerciseProgress([set('80', '8')], []).kind).toBe('none');
  });
});

describe('loadHint', () => {
  it('turns an RPE gap into a load suggestion', () => {
    // Sheet asked for RPE 8, the set came in at 5: three reps were left over.
    const h = loadHint('100', '5', '8')!;
    expect(h.under).toBe(3);
    expect(h.suggested).toBe(110); // 100 * 1.09, rounded to the nearest 2.5
    expect(h.current).toBe(100);
  });

  it('stays quiet when the gap is within self-rating noise', () => {
    expect(loadHint('100', '7', '8')).toBeNull(); // 1 point
    expect(loadHint('100', '7.5', '8')).toBeNull(); // half a point
  });

  it('says nothing when the set was harder than asked', () => {
    expect(loadHint('100', '9', '8')).toBeNull();
  });

  it('reads a ranged target off the sheet conservatively', () => {
    // "7-8" is treated as 7, so it will not over-prescribe.
    expect(loadHint('100', '5', '7-8')!.under).toBe(2);
  });

  it('needs a target, a weight and an RPE', () => {
    expect(loadHint('100', '5', undefined)).toBeNull();
    expect(loadHint('100', undefined, '8')).toBeNull();
    expect(loadHint(undefined, '5', '8')).toBeNull();
    expect(loadHint('heavy', '5', '8')).toBeNull();
  });

  it('does not suggest a weight you are already using', () => {
    // A light bar with a big gap can still round back to itself.
    expect(loadHint('2.5', '5', '8', 2.5)).toBeNull();
  });

  it('honours a smaller plate step', () => {
    const h = loadHint('100', '5', '8', 1)!;
    expect(h.suggested).toBe(109);
  });
});

describe('learnedLoadHint', () => {
  const noModel = { confidence: 'none' as const, predict: () => null, kgPerRpe: null };
  // A lifter for whom one RPE point is 4kg, not the textbook ~3%.
  const personal = {
    confidence: 'good' as const,
    kgPerRpe: 4,
    predict: (reps: number, rpe: number) => 120 - 4 * (reps + (10 - rpe)),
  };

  it('falls back to the flat rule with no model', () => {
    const h = learnedLoadHint('100', '5', '8', '5', noModel)!;
    expect(h.basis).toBe('rule');
    expect(h.suggested).toBe(110);
  });

  it('uses the lifter\'s own curve when it is trusted', () => {
    const h = learnedLoadHint('80', '5', '8', '5', personal)!;
    expect(h.basis).toBe('personal');
    expect(h.kgPerRpe).toBe(4);
    expect(h.suggested).toBe(92.5); // 120 - 4*7 = 92, to the nearest 2.5
  });

  it('marks a shaky model as tentative rather than hiding it', () => {
    const h = learnedLoadHint('80', '5', '8', '5', { ...personal, confidence: 'low' })!;
    expect(h.basis).toBe('personal');
    expect(h.tentative).toBe(true);
  });

  it('will not suggest a step backwards off the curve', () => {
    // Already lifting more than the model predicts for the target.
    const h = learnedLoadHint('120', '5', '8', '5', personal)!;
    expect(h.basis).toBe('rule');
  });

  it('stays silent whenever the flat rule would have', () => {
    expect(learnedLoadHint('100', '7', '8', '5', personal)).toBeNull(); // gap too small
    expect(learnedLoadHint('100', '9', '8', '5', personal)).toBeNull(); // harder than asked
  });

  it('falls back when the target reps are unreadable', () => {
    expect(learnedLoadHint('80', '5', '8', undefined, personal)!.basis).toBe('rule');
    expect(learnedLoadHint('80', '5', '8', 'AMRAP', personal)!.basis).toBe('rule');
  });
});
