import { describe, it, expect } from 'vitest';
import { parseRoadmap, countRoadmap } from './roadmap';

const SAMPLE = `Phase A | Weeks 1-4
Week 1
- [course] Learn HTML | https://example.com
- [dsa] Arrays
Milestone: deploy a page`;

describe('parseRoadmap', () => {
  it('buckets phases, weeks and typed tasks', () => {
    const phases = parseRoadmap(SAMPLE);
    expect(phases).toHaveLength(1);
    expect(phases[0].title).toBe('Phase A');

    const tasks = phases[0].weeks.flatMap((w) => w.tasks);
    expect(tasks).toHaveLength(3);

    const html = tasks.find((t) => t.title === 'Learn HTML');
    expect(html?.type).toBe('course');
    expect(html?.link).toBe('https://example.com');

    expect(tasks.some((t) => t.type === 'milestone')).toBe(true);
  });

  it('drops empty input', () => {
    expect(parseRoadmap('')).toEqual([]);
  });
});

describe('countRoadmap', () => {
  it('counts totals and percent done', () => {
    const phases = parseRoadmap(SAMPLE);
    expect(countRoadmap(phases)).toEqual({ total: 3, done: 0, percent: 0 });
  });

  it('reports 0% for an empty roadmap', () => {
    expect(countRoadmap([])).toEqual({ total: 0, done: 0, percent: 0 });
  });
});
