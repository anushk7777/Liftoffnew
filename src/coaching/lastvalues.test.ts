// Placeholders show the last number you gave for that measurement. Resolved
// per field, not per entry: a weight-only day must not blank the tape figures.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: {
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
    storage: { from: () => ({}) },
  },
}));

const { lastKnownValues } = await import('./api');
import type { Metric } from './api';

const m = (taken_on: string, v: Partial<Metric>): Metric =>
  ({ id: taken_on, client_id: 'c', taken_on, ...v }) as Metric;

const history = [
  m('2026-07-01', { weight_kg: 65, chest_cm: 88, waist_cm: 76, thigh_cm: 54 }),
  m('2026-07-14', { weight_kg: 64.2, waist_cm: 75 }),
  m('2026-07-20', { weight_kg: 63.4 }), // weight-only day
];

describe('lastKnownValues', () => {
  it('takes the most recent value for each field independently', () => {
    const p = lastKnownValues(history);
    expect(p.weight_kg).toBe(63.4); // newest weight
    expect(p.waist_cm).toBe(75); // newest waist, from an older entry
    expect(p.chest_cm).toBe(88); // older still — a weight-only day must not blank it
    expect(p.thigh_cm).toBe(54);
  });

  it('omits a field that was never recorded', () => {
    expect(lastKnownValues(history).hips_cm).toBeUndefined();
  });

  it('ignores the day being edited and anything after it', () => {
    // Correcting 2026-07-14 should offer what preceded it, not the later weight.
    const p = lastKnownValues(history, '2026-07-14');
    expect(p.weight_kg).toBe(65);
    expect(p.waist_cm).toBe(76);
  });

  it('is empty before the first ever check-in', () => {
    expect(lastKnownValues([])).toEqual({});
    expect(lastKnownValues(history, '2026-01-01')).toEqual({});
  });

  it('does not depend on the input being sorted', () => {
    const shuffled = [history[2], history[0], history[1]];
    expect(lastKnownValues(shuffled)).toEqual(lastKnownValues(history));
  });
});
