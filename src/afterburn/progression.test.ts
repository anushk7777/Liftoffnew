import { describe, it, expect } from 'vitest';
import { setVerdict, ghostLabel, exerciseProgress } from './progression';
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

  it('says matched when nothing moved', () => {
    expect(setVerdict(set('80', '8'), set('80', '8'))).toEqual({ kind: 'same', label: 'matched' });
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
