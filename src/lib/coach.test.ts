import { describe, it, expect } from 'vitest';
import { getBriefing, parseEstimateMins, type CoachState } from './coach';
import type { Phase } from '../store/data';

const twoTaskRoadmap = (completed = false): Phase[] => [
  {
    id: 'p',
    title: 'P',
    duration: '',
    weeks: [
      {
        id: 'w',
        title: 'W',
        tasks: [
          { id: 't1', title: 'a', type: 'dsa', completed },
          { id: 't2', title: 'b', type: 'dsa', completed },
        ],
      },
    ],
  },
];

const mkState = (over: Partial<CoachState> = {}): CoachState => ({
  phases: twoTaskRoadmap(false),
  tasks: [],
  focusSessions: [],
  ideas: [],
  activityHistory: [],
  streak: 0,
  pomodoro: { focusMins: 25 },
  habits: [],
  habitLog: [],
  targetDate: '2026-07-21',
  ...over,
});

describe('getBriefing', () => {
  it('anchors pace to an explicit journeyStart', () => {
    // start 50d before "now", target 50d after -> ~50% expected, 0% done -> behind
    const now = new Date('2026-06-01T00:00:00.000Z');
    const b = getBriefing(mkState({ journeyStart: '2026-04-12T00:00:00.000Z' }), now);
    expect(b.actualPct).toBe(0);
    expect(b.expectedPct).toBeGreaterThan(45);
    expect(b.expectedPct).toBeLessThan(55);
    expect(b.status).toBe('behind');
  });

  it('falls back to inference (no lurch) when no signal and no journeyStart', () => {
    // nothing logged and no anchor -> start defaults to now -> 0% expected, on-track
    const now = new Date('2026-06-01T00:00:00.000Z');
    const b = getBriefing(mkState(), now);
    expect(b.expectedPct).toBe(0);
    expect(b.status).toBe('on-track');
  });

  it('shows the idle state with no roadmap', () => {
    const b = getBriefing(mkState({ phases: [] }));
    expect(b.status).toBe('idle');
  });
});

describe('parseEstimateMins', () => {
  it('parses hours, minutes and combined', () => {
    expect(parseEstimateMins('2h')).toBe(120);
    expect(parseEstimateMins('30m')).toBe(30);
    expect(parseEstimateMins('1.5h')).toBe(90);
    expect(parseEstimateMins('1h 15m')).toBe(75);
  });

  it('treats a bare number as minutes and empty as 0', () => {
    expect(parseEstimateMins('45')).toBe(45);
    expect(parseEstimateMins(undefined)).toBe(0);
  });
});
