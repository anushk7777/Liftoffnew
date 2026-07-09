// Mission Control — pure helpers for the reinvented Liftoff home. Everything the
// home needs to answer "am I on trajectory, and what's the one next step?"
import type { Phase, TodoTask } from '../store/data';
import type { Briefing } from './coach';

/** The single next step toward the mission — a roadmap item if the plan has one,
 *  else the top open daily task. Discriminated so the UI knows how to complete it. */
export interface NextStep {
  kind: 'roadmap' | 'task';
  title: string;
  context?: string; // "Phase · Week" for a roadmap step
  roadmap?: { phaseId: string; weekId: string; taskId: string };
  taskId?: string;
}

/** First incomplete roadmap task, in plan order (phase → week → task). */
export function nextRoadmapStep(phases: Phase[]): NextStep | null {
  for (const p of phases)
    for (const w of p.weeks)
      for (const t of w.tasks)
        if (!t.completed)
          return { kind: 'roadmap', title: t.title, context: `${p.title} · ${w.title}`, roadmap: { phaseId: p.id, weekId: w.id, taskId: t.id } };
  return null;
}

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

/** The most pressing open daily task: in-progress first, then priority, then
 *  earliest due date. Used as the "today's mission" fallback when there's no
 *  roadmap step left. */
export function topTask(tasks: TodoTask[]): NextStep | null {
  const open = tasks.filter((t) => t.status !== 'done');
  if (!open.length) return null;
  const sorted = [...open].sort((a, b) => {
    const ad = a.status === 'doing' ? 0 : 1;
    const bd = b.status === 'doing' ? 0 : 1;
    if (ad !== bd) return ad - bd;
    const pr = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
    if (pr) return pr;
    const at = a.dueDate ? Date.parse(a.dueDate) : Infinity;
    const bt = b.dueDate ? Date.parse(b.dueDate) : Infinity;
    return at - bt;
  });
  const t = sorted[0];
  return { kind: 'task', title: t.title, taskId: t.id };
}

/** The one thing to do next: roadmap step, else top task, else nothing. */
export function nextMission(phases: Phase[], tasks: TodoTask[]): NextStep | null {
  return nextRoadmapStep(phases) ?? topTask(tasks);
}

export interface Win {
  id: string;
  title: string;
  at: string; // ISO completedAt
}

/** Recently completed tasks, newest first — the "launch log". Roadmap steps show
 *  here too when completed via their linked daily task (which carries completedAt). */
export function recentWins(tasks: TodoTask[], limit = 6): Win[] {
  return tasks
    .filter((t) => t.status === 'done' && t.completedAt)
    .sort((a, b) => (b.completedAt as string).localeCompare(a.completedAt as string))
    .slice(0, limit)
    .map((t) => ({ id: t.id, title: t.title, at: t.completedAt as string }));
}

export interface TrajectoryTone {
  tone: 'ahead' | 'on-track' | 'behind' | 'idle';
  label: string; // headline verdict
  color: string; // css var expression for the tint
}

/** Map the coach's pace status to Mission-Control language + a tint color. */
export function trajectoryTone(status: Briefing['status']): TrajectoryTone {
  switch (status) {
    case 'ahead':
      return { tone: 'ahead', label: 'Ahead of trajectory', color: 'var(--success)' };
    case 'on-track':
      return { tone: 'on-track', label: 'On course', color: 'var(--mission)' };
    case 'behind':
      return { tone: 'behind', label: 'Drifting — burn to correct', color: 'var(--warning)' };
    default:
      return { tone: 'idle', label: 'Pre-launch', color: 'var(--mission)' };
  }
}
