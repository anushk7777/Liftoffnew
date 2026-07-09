import { describe, it, expect } from 'vitest';
import { nextRoadmapStep, topTask, nextMission, recentWins, trajectoryTone } from './mission';
import type { Phase, TodoTask } from '../store/data';

const phase = (id: string, title: string, tasks: [string, string, boolean][]): Phase => ({
  id,
  title,
  duration: '',
  weeks: [{ id: `${id}-w1`, title: 'Week 1', tasks: tasks.map(([tid, t, done]) => ({ id: tid, title: t, type: 'milestone', completed: done })) }],
});

const task = (id: string, title: string, over: Partial<TodoTask> = {}): TodoTask => ({
  id,
  title,
  priority: 'medium',
  status: 'todo',
  createdAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('nextRoadmapStep', () => {
  it('returns the first incomplete task in plan order, with context', () => {
    const phases = [phase('p1', 'Phase 1', [['a', 'Learn arrays', true], ['b', 'Learn trees', false]]), phase('p2', 'Phase 2', [['c', 'Build app', false]])];
    const step = nextRoadmapStep(phases)!;
    expect(step.title).toBe('Learn trees');
    expect(step.context).toBe('Phase 1 · Week 1');
    expect(step.roadmap).toEqual({ phaseId: 'p1', weekId: 'p1-w1', taskId: 'b' });
  });
  it('returns null when everything is done', () => {
    expect(nextRoadmapStep([phase('p1', 'P', [['a', 'x', true]])])).toBeNull();
  });
});

describe('topTask', () => {
  it('prefers in-progress, then priority, then earliest due', () => {
    const tasks = [
      task('low', 'low pri', { priority: 'low' }),
      task('doing', 'in progress', { status: 'doing', priority: 'low' }),
      task('high', 'high pri', { priority: 'high' }),
    ];
    expect(topTask(tasks)!.taskId).toBe('doing');
    expect(topTask(tasks.filter((t) => t.id !== 'doing'))!.taskId).toBe('high');
  });
  it('ignores done tasks and returns null when none open', () => {
    expect(topTask([task('d', 'done', { status: 'done' })])).toBeNull();
  });
});

describe('nextMission', () => {
  it('uses the roadmap step first, falling back to the top task', () => {
    const phases = [phase('p1', 'P', [['a', 'road step', false]])];
    expect(nextMission(phases, [task('t', 'a task')])!.kind).toBe('roadmap');
    expect(nextMission([], [task('t', 'a task')])!.kind).toBe('task');
    expect(nextMission([], [])).toBeNull();
  });
});

describe('recentWins', () => {
  it('lists completed tasks newest-first, capped', () => {
    const tasks = [
      task('a', 'first', { status: 'done', completedAt: '2026-07-01T10:00:00Z' }),
      task('b', 'second', { status: 'done', completedAt: '2026-07-03T10:00:00Z' }),
      task('c', 'open', {}),
    ];
    const wins = recentWins(tasks, 5);
    expect(wins.map((w) => w.id)).toEqual(['b', 'a']);
  });
});

describe('trajectoryTone', () => {
  it('maps pace status to mission language', () => {
    expect(trajectoryTone('ahead').tone).toBe('ahead');
    expect(trajectoryTone('behind').label).toMatch(/drift/i);
    expect(trajectoryTone('idle').tone).toBe('idle');
  });
});
