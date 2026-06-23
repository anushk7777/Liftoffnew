// =========================================================================
// LIFTOFF — Data types & seed content
// =========================================================================

export type TaskType = 'dsa' | 'course' | 'milestone' | 'project' | 'apply';

// ---- Roadmap (long-horizon plan) ----------------------------------------
export interface Task {
  id: string;
  title: string;
  type: TaskType;
  completed: boolean;
  link?: string;
}

export interface Week {
  id: string;
  title: string;
  tasks: Task[];
}

export interface Phase {
  id: string;
  title: string;
  duration: string;
  weeks: Week[];
}

// ---- Full task manager --------------------------------------------------
export type Priority = 'low' | 'medium' | 'high';
export type Status = 'todo' | 'doing' | 'done';

export interface TodoTask {
  id: string;
  title: string;
  notes?: string;
  priority: Priority;
  status: Status;
  category?: string;
  estimate?: string; // e.g. "30m", "2h"
  dueDate?: string; // ISO start-of-day, optional (day-level)
  scheduledAt?: string; // ISO datetime, optional (time-specific schedule / reminder)
  createdAt: string;
  completedAt?: string;
  // Link back to a roadmap item, so completing the task advances the roadmap.
  sourceRoadmap?: { phaseId: string; weekId: string; taskId: string };
}

// ---- Brain dump (quick capture) -----------------------------------------
export interface Idea {
  id: string;
  text: string;
  createdAt: string;
  archived: boolean;
}

// ---- Notes (longer documents) -------------------------------------------
export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
}

// ---- Habits (recurring) -------------------------------------------------
export interface Habit {
  id: string;
  name: string;
  emoji?: string;
  cadence: 'daily' | 'weekly';
  daysOfWeek?: number[]; // for weekly cadence: 0=Sun … 6=Sat
  scheduledTime?: string; // optional "HH:mm" implementation-intention cue
  createdAt: string;
  archived: boolean;
}

export interface HabitLog {
  habitId: string;
  date: string; // local yyyy-MM-dd
}

// ---- Focus / Pomodoro ---------------------------------------------------
export interface FocusSession {
  id: string;
  date: string; // ISO datetime
  durationMins: number;
  kind: 'focus' | 'break';
  taskTitle?: string;
  taskId?: string; // links the session to a TodoTask when focused on one
}

export interface PomodoroSettings {
  focusMins: number;
  shortBreakMins: number;
  longBreakMins: number;
  roundsBeforeLong: number;
}

export const defaultPomodoro: PomodoroSettings = {
  focusMins: 25,
  shortBreakMins: 5,
  longBreakMins: 15,
  roundsBeforeLong: 4,
};

import { initialNodes } from '../lib/roadmap-graph';

const phaseDefinitions = [
  { id: 'phase-1', title: 'Phase 1 - 2024', duration: '' },
  { id: 'phase-2', title: 'Phase 2 - 2025', duration: '' },
  { id: 'phase-3', title: 'Phase 3 - 2025 end', duration: '' },
];

export const initialRoadmap: Phase[] = phaseDefinitions.map((p) => {
  const nodesForPhase = initialNodes.filter((n) => n.data.phaseId === p.id);
  const weekMap = new Map<string, Task[]>();
  
  nodesForPhase.forEach((n) => {
    if (!weekMap.has(n.data.weekId)) weekMap.set(n.data.weekId, []);
    weekMap.get(n.data.weekId)!.push({
      id: n.data.taskId,
      title: n.data.label,
      type: n.data.type,
      completed: false,
      link: n.data.link,
    });
  });

  const weeks: Week[] = Array.from(weekMap.entries()).map(([wId, tasks]) => ({
    id: wId,
    title:
      wId === 'core' ? 'Basics' :
      wId === 'js-core' ? 'JS foundation' :
      wId === 'frontend' ? 'Front end Development' :
      wId === 'backend' ? 'Backend Development' :
      wId === 'phase-2' ? 'Phase 2' :
      wId === 'phase-3' ? 'Phase 3' :
      'Topics',
    tasks,
  }));

  return {
    id: p.id,
    title: p.title,
    duration: p.duration,
    weeks,
  };
});
