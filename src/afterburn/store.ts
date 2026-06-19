// Liftoff Afterburn store. Persisted to localStorage (separate from the
// productivity store). Holds the editable program, logged sessions, and the
// in-progress draft. A tiny separate store tracks which app (Focus/Afterburn)
// is active so the login profile picker can route.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_PROGRAM } from './plan';
import type { AppMode, LoggedSet, ProgramDay, ProgramExercise, WorkoutProgram, WorkoutSession } from './types';

const uid = () => Math.random().toString(36).slice(2, 10);
const blankSet = (): LoggedSet => ({ weight: '', reps: '', rpe: '', rating: 0, done: false });

function draftFromDay(day: ProgramDay): WorkoutSession {
  return {
    id: uid(),
    dayId: day.id,
    dayName: day.name,
    date: new Date().toISOString(),
    entries: day.exercises.map((ex) => ({
      exerciseId: ex.id,
      name: ex.name,
      target: { reps: ex.reps, rpe: ex.rpe, percent1RM: ex.percent1RM, tempo: ex.tempo },
      sets: Array.from({ length: Math.max(1, ex.workingSets) }, blankSet),
      notes: '',
    })),
  };
}

interface AfterburnState {
  program: WorkoutProgram;
  sessions: WorkoutSession[];
  draft: WorkoutSession | null;
  startDay: (dayId: string) => void;
  cancelDraft: () => void;
  finishDraft: () => void;
  updateSet: (exIdx: number, setIdx: number, patch: Partial<LoggedSet>) => void;
  addSet: (exIdx: number) => void;
  removeSet: (exIdx: number) => void;
  setExerciseNotes: (exIdx: number, notes: string) => void;
  addCustomDay: (name: string) => string;
  addExercise: (dayId: string, ex: Omit<ProgramExercise, 'id'>) => void;
  removeExercise: (dayId: string, exId: string) => void;
  removeDay: (dayId: string) => void;
  deleteSession: (id: string) => void;
  resetProgram: () => void;
}

export const useAfterburn = create<AfterburnState>()(
  persist(
    (set, get) => ({
      program: DEFAULT_PROGRAM,
      sessions: [],
      draft: null,

      startDay: (dayId) => {
        const day = get().program.days.find((d) => d.id === dayId);
        if (day) set({ draft: draftFromDay(day) });
      },
      cancelDraft: () => set({ draft: null }),
      finishDraft: () => {
        const d = get().draft;
        if (!d) return;
        set({ sessions: [{ ...d, completedAt: new Date().toISOString() }, ...get().sessions], draft: null });
      },

      updateSet: (exIdx, setIdx, patch) =>
        set((s) => {
          if (!s.draft) return s;
          const entries = s.draft.entries.map((e, i) =>
            i !== exIdx ? e : { ...e, sets: e.sets.map((st, j) => (j !== setIdx ? st : { ...st, ...patch })) },
          );
          return { draft: { ...s.draft, entries } };
        }),
      addSet: (exIdx) =>
        set((s) => {
          if (!s.draft) return s;
          const entries = s.draft.entries.map((e, i) => (i !== exIdx ? e : { ...e, sets: [...e.sets, blankSet()] }));
          return { draft: { ...s.draft, entries } };
        }),
      removeSet: (exIdx) =>
        set((s) => {
          if (!s.draft) return s;
          const entries = s.draft.entries.map((e, i) =>
            i !== exIdx || e.sets.length <= 1 ? e : { ...e, sets: e.sets.slice(0, -1) },
          );
          return { draft: { ...s.draft, entries } };
        }),
      setExerciseNotes: (exIdx, notes) =>
        set((s) => {
          if (!s.draft) return s;
          const entries = s.draft.entries.map((e, i) => (i !== exIdx ? e : { ...e, notes }));
          return { draft: { ...s.draft, entries } };
        }),

      addCustomDay: (name) => {
        const id = uid();
        set((s) => ({ program: { ...s.program, days: [...s.program.days, { id, name, source: 'custom', exercises: [] }] } }));
        return id;
      },
      addExercise: (dayId, ex) =>
        set((s) => ({
          program: {
            ...s.program,
            days: s.program.days.map((d) => (d.id !== dayId ? d : { ...d, exercises: [...d.exercises, { ...ex, id: uid() }] })),
          },
        })),
      removeExercise: (dayId, exId) =>
        set((s) => ({
          program: {
            ...s.program,
            days: s.program.days.map((d) => (d.id !== dayId ? d : { ...d, exercises: d.exercises.filter((e) => e.id !== exId) })),
          },
        })),
      removeDay: (dayId) => set((s) => ({ program: { ...s.program, days: s.program.days.filter((d) => d.id !== dayId) } })),
      deleteSession: (id) => set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) })),
      resetProgram: () => set({ program: DEFAULT_PROGRAM }),
    }),
    { name: 'liftoff-afterburn' },
  ),
);

interface ModeState {
  mode: AppMode | null;
  setMode: (m: AppMode | null) => void;
}

/** Which app is active. `null` => show the profile picker. */
export const useAppMode = create<ModeState>()(
  persist((set) => ({ mode: null, setMode: (mode) => set({ mode }) }), { name: 'liftoff-app-mode' }),
);
