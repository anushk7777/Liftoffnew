import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type {
  Phase,
  TodoTask,
  Idea,
  Note,
  FocusSession,
  PomodoroSettings,
  Priority,
  Status,
  Habit,
  HabitLog,
} from './data';
import { initialRoadmap, defaultPomodoro } from './data';
import { startOfDay, addMonths, format } from 'date-fns';
import { dayKey, streakFromDays, longestRunFromDays } from '../lib/streak';
import {
  getDeviceId,
  getLocalUpdatedAt,
  setLocalUpdatedAt,
  mergeState,
} from '../lib/sync';

export interface ActivityLog {
  date: string; // ISO start-of-day
  type: 'full' | 'minimum';
}

const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

const nowISO = () => new Date().toISOString();

interface AppState {
  _initialized: boolean;
  deviceId: string;
  setInitialized: (val: boolean) => void;
  loadFromDB: () => Promise<void>;

  // Cross-device sync (keyed by the signed-in account; no passphrase needed)
  syncNow: () => Promise<void>;

  // Settings
  // The mission: a one-line statement of the single goal you're launching toward.
  mission: string;
  setMission: (mission: string) => void;
  targetDate: string;
  // Explicit anchor for the coach's pace math — set once when the roadmap is
  // first set up (or backfilled from the earliest signal for existing users),
  // so "expected %" doesn't read 0 / lurch with the earliest inferred timestamp.
  journeyStart?: string;
  theme: 'light' | 'dark';
  reduceMotion: boolean;
  setTargetDate: (date: string) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  setReduceMotion: (reduce: boolean) => void;

  // Roadmap
  phases: Phase[];
  toggleRoadmapTask: (phaseId: string, weekId: string, taskId: string) => void;
  replaceRoadmap: (phases: Phase[]) => void;
  appendRoadmap: (phases: Phase[]) => void;
  resetRoadmap: () => void;
  loadExampleRoadmap: () => void;

  // Full task manager
  tasks: TodoTask[];
  addTask: (task: Partial<TodoTask> & { title: string }) => void;
  updateTask: (id: string, updates: Partial<TodoTask>) => void;
  deleteTask: (id: string) => void;
  cycleTaskStatus: (id: string) => void;
  setTaskStatus: (id: string, status: Status) => void;
  addTaskFromRoadmap: (phaseId: string, weekId: string, taskId: string, title?: string, type?: string) => void;

  // Brain dump (quick capture)
  ideas: Idea[];
  addIdea: (text: string) => void;
  updateIdea: (id: string, text: string) => void;
  deleteIdea: (id: string) => void;
  archiveIdea: (id: string, archived: boolean) => void;
  convertIdeaToTask: (id: string) => void;

  // Notes
  notes: Note[];
  addNote: () => string;
  updateNote: (id: string, updates: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  togglePinNote: (id: string) => void;

  // Habits
  habits: Habit[];
  habitLog: HabitLog[];
  addHabit: (habit: Partial<Habit> & { name: string }) => void;
  updateHabit: (id: string, updates: Partial<Habit>) => void;
  deleteHabit: (id: string) => void;
  toggleHabitToday: (id: string) => void;

  // Focus / Pomodoro
  pomodoro: PomodoroSettings;
  setPomodoro: (updates: Partial<PomodoroSettings>) => void;
  focusSessions: FocusSession[];
  logFocusSession: (durationMins: number, kind: 'focus' | 'break', taskTitle?: string, taskId?: string) => void;

  // Task pushed into Focus (runtime-only, not persisted/synced)
  focusTaskId: string | null;
  setFocusTaskId: (id: string | null) => void;

  // Gamification & Stats
  streak: number;
  longestStreak: number;
  freezeAvailable: boolean;
  activityHistory: ActivityLog[];
  problemsSolved: number;
  sectionsCompleted: number;
  incrementProblems: (delta?: number) => void;
  incrementSections: (delta?: number) => void;

  toggleLogDay: (type: 'full' | 'minimum') => void;
  recalculateStreak: () => void;

  // Soft-delete tombstones (`"collection:id" -> deletedAt ISO`) so a deletion
  // survives the cross-device merge instead of being resurrected by a stale add.
  tombstones: Record<string, string>;

  // Backup
  exportData: () => string;
  importData: (jsonStr: string) => void;
}

const NON_PERSISTED = new Set(['_initialized', 'deviceId', 'focusTaskId']);

// The persisted/synced slice of state: everything except functions and the
// runtime-only / device-local fields above.
function extractData(state: AppState): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(state)) {
    if (typeof v === 'function' || NON_PERSISTED.has(k)) continue;
    out[k] = v;
  }
  return out;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      _initialized: false,
      deviceId: getDeviceId(),
      setInitialized: (val) => set({ _initialized: val }),

      // ---- Cross-device sync ----
      // Data syncs automatically per signed-in account (keyed by user.id); no
      // passphrase. Pull-to-refresh / tab-focus call syncNow to merge.
      syncNow: async () => {
        await get().loadFromDB();
      },

      loadFromDB: async () => {
        // Local persistence is the source of truth. Only pull from the cloud
        // when Supabase is configured. We MERGE (recency-guarded) rather than
        // blindly overwrite, so a freshly opened device never wipes the cloud
        // and logged history from any device is preserved.
        if (!isSupabaseConfigured) {
          set({ _initialized: true });
          get().recalculateStreak();
          return;
        }
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            set({ _initialized: true });
            get().recalculateStreak();
            return;
          }
          const id = session.user.id;
          
          const { data, error } = await supabase
            .from('user_data')
            .select('data, updated_at')
            .eq('id', id)
            .single();

          // PGRST116 = "no rows" — expected for a brand-new user, not an error.
          if (error && error.code !== 'PGRST116') {
            console.error('Failed to load from Supabase:', error);
          }

          if (data && data.data) {
            const cloud = migrate(data.data);
            const localSnap = extractData(get());
            const merged = mergeState(
              localSnap,
              cloud,
              getLocalUpdatedAt(),
              data.updated_at || '1970-01-01T00:00:00.000Z',
            );
            set({ ...(merged as Partial<AppState>), _initialized: true });
          } else {
            set({ _initialized: true });
          }
        } catch (err) {
          console.error('Failed to load from Supabase:', err);
          set({ _initialized: true });
        }
        get().recalculateStreak();
      },

  // ---- Settings ----
  // Default ~6 months out from first run (never a shared/stale hardcoded date).
  // Existing users keep their persisted targetDate.
  mission: '',
  setMission: (mission) => set({ mission }),
  targetDate: format(addMonths(new Date(), 6), 'yyyy-MM-dd'),
  journeyStart: undefined,
  theme: 'dark',
  reduceMotion: false,
  setTargetDate: (date) => set({ targetDate: date }),
  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
  setReduceMotion: (reduceMotion) => set({ reduceMotion }),

  // ---- Roadmap ----
  // Fresh installs start with NO roadmap so each user sets up their own (the
  // coach shows a "Set up your roadmap" empty state). `initialRoadmap` is kept
  // as an opt-in example via loadExampleRoadmap(). Existing users keep their
  // persisted phases.
  phases: [],
  toggleRoadmapTask: (phaseId, weekId, taskId) =>
    set((state) => {
      const newPhases = JSON.parse(JSON.stringify(state.phases)) as Phase[];
      let nowCompleted = false;
      for (const p of newPhases) {
        if (p.id !== phaseId) continue;
        for (const w of p.weeks) {
          if (w.id !== weekId) continue;
          for (const t of w.tasks) {
            if (t.id !== taskId) continue;
            t.completed = !t.completed;
            nowCompleted = t.completed;
          }
        }
      }
      // Keep any linked daily task in sync with the roadmap.
      const tasks = state.tasks.map((t) =>
        t.sourceRoadmap &&
        t.sourceRoadmap.phaseId === phaseId &&
        t.sourceRoadmap.weekId === weekId &&
        t.sourceRoadmap.taskId === taskId
          ? {
              ...t,
              status: (nowCompleted ? 'done' : 'todo') as Status,
              completedAt: nowCompleted ? nowISO() : undefined,
            }
          : t,
      );
      return { phases: newPhases, tasks };
    }),
  // Setting up a roadmap anchors the journey start (once) so the coach pace is
  // measured from when the plan was created, not the earliest inferred signal.
  replaceRoadmap: (phases) =>
    set((s) => ({ phases, journeyStart: s.journeyStart ?? (phases.length ? nowISO() : undefined) })),
  appendRoadmap: (phases) =>
    set((s) => ({ phases: [...s.phases, ...phases], journeyStart: s.journeyStart ?? nowISO() })),
  resetRoadmap: () => set({ phases: [] }),
  loadExampleRoadmap: () => set((s) => ({ phases: initialRoadmap, journeyStart: s.journeyStart ?? nowISO() })),

  // ---- Tasks ----
  tasks: [],
  addTask: (task) =>
    set((state) => ({
      tasks: [
        {
          id: uid(),
          title: task.title,
          notes: task.notes,
          priority: (task.priority as Priority) || 'medium',
          status: (task.status as Status) || 'todo',
          category: task.category,
          estimate: task.estimate,
          dueDate: task.dueDate,
          scheduledAt: task.scheduledAt,
          createdAt: nowISO(),
          completedAt: task.status === 'done' ? nowISO() : undefined,
          sourceRoadmap: task.sourceRoadmap,
        },
        ...state.tasks,
      ],
    })),
  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  deleteTask: (id) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
      tombstones: { ...state.tombstones, [`tasks:${id}`]: nowISO() },
    })),
  setTaskStatus: (id, status) =>
    set((state) => {
      const task = state.tasks.find((t) => t.id === id);
      const tasks = state.tasks.map((t) =>
        t.id === id
          ? { ...t, status, completedAt: status === 'done' ? nowISO() : undefined }
          : t,
      );
      // Daily work flows into the roadmap: completing a linked task advances it.
      let phases = state.phases;
      if (task?.sourceRoadmap) {
        phases = syncRoadmapCompletion(state.phases, task.sourceRoadmap, status === 'done');
      }
      return { tasks, phases };
    }),
  cycleTaskStatus: (id) => {
    const order: Status[] = ['todo', 'doing', 'done'];
    const t = get().tasks.find((x) => x.id === id);
    if (!t) return;
    const next = order[(order.indexOf(t.status) + 1) % order.length];
    get().setTaskStatus(id, next);
  },
  addTaskFromRoadmap: (phaseId, weekId, taskId, title, type) => {
    const state = get();
    // Avoid duplicates: if a task already links to this roadmap item, do nothing.
    const exists = state.tasks.some(
      (t) =>
        t.sourceRoadmap &&
        t.sourceRoadmap.phaseId === phaseId &&
        t.sourceRoadmap.weekId === weekId &&
        t.sourceRoadmap.taskId === taskId,
    );
    if (exists) return;
    let found: { title: string; type: string } | null = title && type ? { title, type } : null;
    if (!found) {
      for (const p of state.phases) {
        if (p.id !== phaseId) continue;
        for (const w of p.weeks) {
          if (w.id !== weekId) continue;
          const rt = w.tasks.find((t) => t.id === taskId);
          if (rt) found = { title: rt.title, type: rt.type };
        }
      }
    }
    if (!found) return;
    get().addTask({
      title: found.title,
      category: found.type.toUpperCase(),
      priority: found.type === 'milestone' ? 'high' : 'medium',
      status: 'todo',
      dueDate: startOfDay(new Date()).toISOString(),
      sourceRoadmap: { phaseId, weekId, taskId },
    });
  },

  // ---- Brain dump ----
  ideas: [],
  addIdea: (text) =>
    set((state) => ({
      ideas: [{ id: uid(), text, createdAt: nowISO(), archived: false }, ...state.ideas],
    })),
  updateIdea: (id, text) =>
    set((state) => ({
      ideas: state.ideas.map((i) => (i.id === id ? { ...i, text } : i)),
    })),
  deleteIdea: (id) =>
    set((state) => ({
      ideas: state.ideas.filter((i) => i.id !== id),
      tombstones: { ...state.tombstones, [`ideas:${id}`]: nowISO() },
    })),
  archiveIdea: (id, archived) =>
    set((state) => ({
      ideas: state.ideas.map((i) => (i.id === id ? { ...i, archived } : i)),
    })),
  convertIdeaToTask: (id) => {
    const idea = get().ideas.find((i) => i.id === id);
    if (!idea) return;
    get().addTask({ title: idea.text, priority: 'medium', status: 'todo' });
    get().archiveIdea(id, true);
  },

  // ---- Notes ----
  notes: [],
  addNote: () => {
    const id = uid();
    set((state) => ({
      notes: [
        { id, title: '', content: '', createdAt: nowISO(), updatedAt: nowISO(), pinned: false },
        ...state.notes,
      ],
    }));
    return id;
  },
  updateNote: (id, updates) =>
    set((state) => ({
      notes: state.notes.map((n) =>
        n.id === id ? { ...n, ...updates, updatedAt: nowISO() } : n,
      ),
    })),
  deleteNote: (id) =>
    set((state) => ({
      notes: state.notes.filter((n) => n.id !== id),
      tombstones: { ...state.tombstones, [`notes:${id}`]: nowISO() },
    })),
  togglePinNote: (id) =>
    set((state) => ({
      notes: state.notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)),
    })),

  // ---- Habits ----
  habits: [],
  habitLog: [],
  addHabit: (habit) =>
    set((state) => ({
      habits: [
        {
          id: uid(),
          name: habit.name,
          emoji: habit.emoji,
          cadence: habit.cadence || 'daily',
          daysOfWeek: habit.daysOfWeek,
          scheduledTime: habit.scheduledTime,
          createdAt: nowISO(),
          archived: false,
        },
        ...state.habits,
      ],
    })),
  updateHabit: (id, updates) =>
    set((state) => ({
      habits: state.habits.map((h) => (h.id === id ? { ...h, ...updates } : h)),
    })),
  deleteHabit: (id) =>
    set((state) => ({
      habits: state.habits.filter((h) => h.id !== id),
      habitLog: state.habitLog.filter((l) => l.habitId !== id),
      tombstones: { ...state.tombstones, [`habits:${id}`]: nowISO() },
    })),
  toggleHabitToday: (id) =>
    set((state) => {
      const today = dayKey(new Date());
      const done = state.habitLog.some((l) => l.habitId === id && l.date === today);
      return {
        habitLog: done
          ? state.habitLog.filter((l) => !(l.habitId === id && l.date === today))
          : [...state.habitLog, { habitId: id, date: today }],
      };
    }),

  // ---- Focus / Pomodoro ----
  pomodoro: defaultPomodoro,
  setPomodoro: (updates) => set((s) => ({ pomodoro: { ...s.pomodoro, ...updates } })),
  focusSessions: [],
  logFocusSession: (durationMins, kind, taskTitle, taskId) =>
    set((state) => ({
      focusSessions: [
        { id: uid(), date: nowISO(), durationMins, kind, taskTitle, taskId },
        ...state.focusSessions,
      ].slice(0, 1000),
    })),

  focusTaskId: null,
  setFocusTaskId: (id) => set({ focusTaskId: id }),

  // ---- Gamification ----
  streak: 0,
  longestStreak: 0,
  freezeAvailable: true,
  activityHistory: [],
  problemsSolved: 0,
  sectionsCompleted: 0,
  incrementProblems: (delta = 1) =>
    set((s) => ({ problemsSolved: Math.max(0, s.problemsSolved + delta) })),
  incrementSections: (delta = 1) =>
    set((s) => ({ sectionsCompleted: Math.max(0, s.sectionsCompleted + delta) })),

  toggleLogDay: (type) => {
    const state = get();
    const today = startOfDay(new Date()).toISOString();
    const idx = state.activityHistory.findIndex((l) => l.date === today);
    const newHistory = [...state.activityHistory];
    if (idx >= 0) {
      if (newHistory[idx].type === type) newHistory.splice(idx, 1);
      else newHistory[idx].type = type;
    } else {
      newHistory.push({ date: today, type });
    }
    set({ activityHistory: newHistory });
    get().recalculateStreak();
  },

  recalculateStreak: () => {
    const { activityHistory, longestStreak } = get();
    const days = new Set(activityHistory.map((l) => dayKey(l.date)));
    const { streak, freezeAvailable } = streakFromDays(days);
    // Longest = best of the stored value, the full-history best run, and the
    // (grace-aware) current streak — so imports/merges can't under-report it.
    set({ streak, longestStreak: Math.max(longestStreak, longestRunFromDays(days), streak), freezeAvailable });
  },

  tombstones: {},

  exportData: () => JSON.stringify(extractData(get()), null, 2),

  importData: (jsonStr) => {
    try {
      const parsed = migrate(JSON.parse(jsonStr));
      set(parsed);
      get().recalculateStreak();
    } catch (e) {
      console.error('Failed to parse import string', e);
    }
  },
    }),
    {
      name: 'liftoff',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Persist everything except runtime-only fields and functions.
      partialize: (s) =>
        Object.fromEntries(
          Object.entries(s).filter(([k, v]) => typeof v !== 'function' && !NON_PERSISTED.has(k)),
        ) as unknown as AppState,
      migrate: (persisted) => migrate(persisted as Record<string, unknown>) as unknown as AppState,
      // Note: we intentionally do NOT flip _initialized here. loadFromDB() does
      // that only after the first cloud merge, so a configured device can't push
      // local defaults to the shared workspace before pulling (startup race).
      onRehydrateStorage: () => (state) => {
        if (state) state.recalculateStreak();
      },
    },
  ),
);

// Set a specific roadmap task's completed flag (used when a linked daily task
// is completed). Returns a new phases array; does nothing if not found.
function syncRoadmapCompletion(
  phases: Phase[],
  ref: { phaseId: string; weekId: string; taskId: string },
  completed: boolean,
): Phase[] {
  let changed = false;
  const next = phases.map((p) => {
    if (p.id !== ref.phaseId) return p;
    return {
      ...p,
      weeks: p.weeks.map((w) => {
        if (w.id !== ref.weekId) return w;
        return {
          ...w,
          tasks: w.tasks.map((t) => {
            if (t.id !== ref.taskId || t.completed === completed) return t;
            changed = true;
            return { ...t, completed };
          }),
        };
      }),
    };
  });
  return changed ? next : phases;
}

interface LegacyDailyTask {
  id?: string;
  title?: string;
  completed?: boolean;
  category?: string;
  duration?: string;
  date?: string;
  createdAt?: string;
}

// Migrate older saved shapes (e.g. dailyTasks) into the new model.
function migrate(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };

  // dailyTasks -> tasks
  if (Array.isArray(out.dailyTasks) && !Array.isArray(out.tasks)) {
    out.tasks = (out.dailyTasks as LegacyDailyTask[]).map((d) => ({
      id: d.id || uid(),
      title: d.title || 'Untitled',
      priority: 'medium' as Priority,
      status: (d.completed ? 'done' : 'todo') as Status,
      category: d.category,
      estimate: d.duration,
      dueDate: d.date,
      createdAt: d.createdAt || nowISO(),
      completedAt: d.completed ? d.createdAt || nowISO() : undefined,
    }));
  }
  delete out.dailyTasks;

  // Ensure new collections exist
  if (!Array.isArray(out.tasks)) out.tasks = [];
  if (!Array.isArray(out.ideas)) out.ideas = [];
  if (!Array.isArray(out.notes)) out.notes = [];
  if (!Array.isArray(out.focusSessions)) out.focusSessions = [];
  if (!Array.isArray(out.habits)) out.habits = [];
  if (!Array.isArray(out.habitLog)) out.habitLog = [];
  if (!out.pomodoro) out.pomodoro = defaultPomodoro;
  if (!out.tombstones || typeof out.tombstones !== 'object') out.tombstones = {};

  // Backfill the journey-start anchor for existing users from the earliest
  // signal we have, so their pace verdict stays stable (computed once, frozen).
  if (!out.journeyStart) {
    let start = Infinity;
    const scan = (arr: unknown, field: string) => {
      if (!Array.isArray(arr)) return;
      for (const x of arr) {
        const v = (x as Record<string, unknown>)?.[field];
        if (typeof v === 'string') {
          const t = Date.parse(v);
          if (isFinite(t)) start = Math.min(start, t);
        }
      }
    };
    scan(out.tasks, 'createdAt');
    scan(out.activityHistory, 'date');
    scan(out.focusSessions, 'date');
    if (isFinite(start)) out.journeyStart = new Date(start).toISOString();
  }

  return out;
}

// Debounced cloud sync — only when Supabase is configured and the first cloud
// merge has completed (_initialized). Local persistence (zustand persist)
// handles offline-first saving on its own.
let syncTimeout: ReturnType<typeof setTimeout>;
useStore.subscribe((state) => {
  if (!isSupabaseConfigured || !state._initialized) return;
  clearTimeout(syncTimeout);
  syncTimeout = setTimeout(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const ts = nowISO();
      const { error } = await supabase.from('user_data').upsert(
        { id: session.user.id, data: extractData(state), updated_at: ts },
        { onConflict: 'id' },
      );
      // Supabase resolves with { error } instead of throwing; if the write
      // failed, don't advance the local marker so the next load still treats
      // local as fresh and retries.
      if (error) {
        console.error('Background sync failed', error);
        return;
      }
      setLocalUpdatedAt(ts); // mirror for the recency-guarded merge on next load
    } catch (e) {
      console.error('Background sync failed', e);
    }
  }, 1000);
});

// Pull (merge) the shared workspace when returning to the tab, so switching
// between devices stays fresh without a realtime websocket.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const s = useStore.getState();
    if (isSupabaseConfigured && s._initialized) {
      void s.syncNow();
    }
  });
}
