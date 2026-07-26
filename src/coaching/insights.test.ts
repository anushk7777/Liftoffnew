import { describe, it, expect } from 'vitest';
import {
  weightPoints, rollingAverage, weeklyRate, rateVerdict, adherence,
} from './insights';
import type { Metric } from './api';

const m = (taken_on: string, weight_kg: number | null): Metric =>
  ({ id: taken_on, client_id: 'c', taken_on, weight_kg }) as Metric;

/** n consecutive days ending today-ish, losing `perDay` kg each day. */
const ramp = (from: string, days: number, start: number, perDay: number) => {
  const out: Metric[] = [];
  const d0 = new Date(`${from}T12:00:00`);
  for (let i = 0; i < days; i++) {
    const d = new Date(d0.getTime() + i * 86400000);
    out.push(m(d.toISOString().slice(0, 10), Math.round((start + i * perDay) * 100) / 100));
  }
  return out;
};

describe('weightPoints', () => {
  it('drops days without a weight and sorts', () => {
    const p = weightPoints([m('2026-07-10', 70), m('2026-07-01', 72), m('2026-07-05', null)]);
    expect(p.map((x) => x.date)).toEqual(['2026-07-01', '2026-07-10']);
  });
});

describe('rollingAverage', () => {
  it('smooths a single-day spike', () => {
    const pts = weightPoints([
      m('2026-07-01', 70), m('2026-07-02', 70), m('2026-07-03', 74), m('2026-07-04', 70),
    ]);
    const avg = rollingAverage(pts, 7);
    // The spike day averages with its neighbours instead of reading 74.
    expect(avg[2].value).toBeCloseTo(71.33, 1);
    expect(avg[3].value).toBeLessThan(74);
  });

  it('is trailing, so earlier values never change as data arrives', () => {
    const a = rollingAverage(weightPoints([m('2026-07-01', 70), m('2026-07-02', 72)]), 7);
    const b = rollingAverage(
      weightPoints([m('2026-07-01', 70), m('2026-07-02', 72), m('2026-07-03', 80)]),
      7,
    );
    expect(b[0].value).toBe(a[0].value);
    expect(b[1].value).toBe(a[1].value);
  });

  it('starts at the first value', () => {
    expect(rollingAverage(weightPoints([m('2026-07-01', 70)]), 7)[0].value).toBe(70);
  });
});

describe('weeklyRate', () => {
  it('reads a steady loss as kg per week', () => {
    // -0.1 kg/day over 21 days => -0.7 kg/week
    const r = weeklyRate(weightPoints(ramp('2026-07-01', 21, 80, -0.1)), 28);
    expect(r).toBeCloseTo(-0.7, 1);
  });

  it('reads a gain as positive', () => {
    const r = weeklyRate(weightPoints(ramp('2026-07-01', 21, 60, 0.05)), 28);
    expect(r).toBeGreaterThan(0);
  });

  it('is not thrown by one heavy day on the end', () => {
    const clean = ramp('2026-07-01', 21, 80, -0.1);
    const spiked = [...clean.slice(0, -1), m(clean[clean.length - 1].taken_on, 82)];
    const a = weeklyRate(weightPoints(clean), 28)!;
    const b = weeklyRate(weightPoints(spiked), 28)!;

    // What the naive (last − first) / weeks method would have said.
    const pts = weightPoints(spiked);
    const weeks = 20 / 7;
    const endpoint = (pts[pts.length - 1].value - pts[0].value) / weeks;

    // Still reads as a loss, and stays far closer to the truth than endpoints.
    expect(b).toBeLessThan(0);
    expect(Math.abs(b - a)).toBeLessThan(Math.abs(endpoint - a) / 2);
  });

  it('refuses to guess from too little history', () => {
    expect(weeklyRate(weightPoints([m('2026-07-01', 70)]), 28)).toBeNull();
    // Three days is not a weekly rate.
    expect(weeklyRate(weightPoints(ramp('2026-07-01', 3, 70, -0.2)), 28)).toBeNull();
  });

  it('ignores entries older than the window', () => {
    const old = ramp('2026-01-01', 10, 90, -0.5);
    const recent = ramp('2026-07-01', 14, 70, -0.05);
    const r = weeklyRate(weightPoints([...old, ...recent]), 28)!;
    expect(r).toBeCloseTo(-0.35, 1);
  });
});

describe('rateVerdict', () => {
  it('scales with bodyweight rather than using flat kilos', () => {
    // 0.7 kg/wk is ~0.74% at 95 kg (fine) but ~1.27% at 55 kg (too fast).
    expect(rateVerdict(-0.7, 95)).toBe('onTrack');
    expect(rateVerdict(-0.7, 55)).toBe('fast');
  });

  it('names the other states', () => {
    expect(rateVerdict(0.3, 70)).toBe('gaining');
    expect(rateVerdict(-0.05, 70)).toBe('holding');
    expect(rateVerdict(-0.25, 70)).toBe('slow');
  });
});

describe('adherence', () => {
  const today = new Date('2026-07-20T12:00:00');

  it('counts distinct days inside the window', () => {
    const metrics = [m('2026-07-20', 70), m('2026-07-19', 70), m('2026-07-14', 70)];
    expect(adherence(metrics, 14, today)).toEqual({ logged: 3, of: 14 });
  });

  it('excludes anything older than the window', () => {
    expect(adherence([m('2026-06-01', 70)], 14, today)).toEqual({ logged: 0, of: 14 });
  });

  it('does not double-count a day', () => {
    expect(adherence([m('2026-07-20', 70), m('2026-07-20', 71)], 14, today).logged).toBe(1);
  });
});
