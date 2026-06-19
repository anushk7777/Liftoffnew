// Liftoff Afterburn store. Local-first (zustand persist to localStorage) with
// optional cloud sync to a dedicated `workout_data` table in the SAME Supabase
// backend the productivity app uses. A tiny separate store tracks which app
// (Focus/Afterburn) is active so the login profile picker can route.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { DEFAULT_PROGRAM } from './plan';
import type { AppMode, LoggedSet, ProgramDay, ProgramExercise, WorkoutProgram, WorkoutSession } from './types';

const uid = () => Math.random().toString(36).slice(2, 10);
const blankSet = (): LoggedSet => ({ id: uid(), weight: '', reps: '', rpe: '', rating: 0, done: false });

// Recency marker so a freshly-opened device never overwrites newer cloud data.
const SYNCED_AT = 'liftoff_afterburn_synced_at';
const EPOCH = '1970-01-01T00:00:00.000Z';
const getMarker = (): string => {
  try {
    return localStorage.getItem(SYNCED_AT) || EPOCH;
  } catch {
    return EPOCH;
  }
};
const setMarker = (ts: string): void => {
  try {
    localStorage.setItem(SYNCED_AT, ts);
  } catch {
    /* storage unavailable */
  }
};

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
  _cloudLoaded: boolean;
  loadWorkouts: () => Promise<void>;
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
      _cloudLoaded: false,

      // Pull from the cloud (recency-guarded) when entering the workout app.
      loadWorkouts: async () => {
        if (!isSupabaseConfigured) {
          set({ _cloudLoaded: true });
          return;
        }
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (!session) {
            set({ _cloudLoaded: true });
            return;
          }
          const { data, error } = await supabase
            .from('workout_data')
            .select('data, updated_at')
            .eq('id', session.user.id)
            .single();
          if (error && error.code !== 'PGRST116') console.error('Afterburn cloud load failed', error);
          const cloudTs = data?.updated_at ?? '';
          if (data?.data && cloudTs > getMarker()) {
            const d = data.data as { program?: WorkoutProgram; sessions?: WorkoutSession[] };
            set({ program: d.program ?? get().program, sessions: d.sessions ?? get().sessions });
            setMarker(cloudTs || new Date().toISOString());
          }
        } catch (e) {
          console.error('Afterburn cloud load failed', e);
        }
        set({ _cloudLoaded: true });
      },

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
    {
      name: 'liftoff-afterburn',
      partialize: (s) => ({ program: s.program, sessions: s.sessions, draft: s.draft }),
    },
  ),
);

// Push program/session changes to the cloud (debounced). Gated on _cloudLoaded
// so we never overwrite the cloud before the first pull; ignores draft edits.
let lastProgram = useAfterburn.getState().program;
let lastSessions = useAfterburn.getState().sessions;
let syncTimer: ReturnType<typeof setTimeout>;
useAfterburn.subscribe((state) => {
  if (!isSupabaseConfigured || !state._cloudLoaded) return;
  if (state.program === lastProgram && state.sessions === lastSessions) return;
  lastProgram = state.program;
  lastSessions = state.sessions;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const ts = new Date().toISOString();
      const { error } = await supabase.from('workout_data').upsert(
        { id: session.user.id, data: { program: state.program, sessions: state.sessions }, updated_at: ts },
        { onConflict: 'id' },
      );
      if (error) {
        console.error('Afterburn cloud sync failed', error);
        return;
      }
      setMarker(ts);
    } catch (e) {
      console.error('Afterburn cloud sync failed', e);
    }
  }, 1000);
});

interface ModeState {
  mode: AppMode | null;
  setMode: (m: AppMode | null) => void;
}

/** Which app is active. `null` => show the profile picker. */
export const useAppMode = create<ModeState>()(
  persist((set) => ({ mode: null, setMode: (mode) => set({ mode }) }), { name: 'liftoff-app-mode' }),
);
