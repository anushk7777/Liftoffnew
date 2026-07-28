// Liftoff Afterburn store. Local-first (zustand persist to localStorage) with
// optional cloud sync to a dedicated `workout_data` table in the SAME Supabase
// backend the productivity app uses. A tiny separate store tracks which app
// (Focus/Afterburn) is active so the login profile picker can route.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { DEFAULT_PROGRAM } from './plan';
import { withWeakPoints } from './pureBodybuilding';
import { DEFAULT_NUTRITION } from './nutrition';
import { DEFAULT_RECALL_DAYS } from './innovation/recall';
import type { NutritionProfile } from './nutrition';
import type { BodyEntry, LoggedExercise, LoggedSet, ProgramDay, ProgramExercise, RecoveryEntry, WeekPlan, WeightUnit, WorkoutProgram, WorkoutSession } from './types';

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

/** A fresh, unlogged draft entry for one prescribed exercise (blank sets). */
function entryFromExercise(ex: ProgramExercise): LoggedExercise {
  return {
    exerciseId: ex.id,
    name: ex.name,
    target: {
      reps: ex.reps,
      rpe: ex.rpe,
      percent1RM: ex.percent1RM,
      tempo: ex.tempo,
      rest: ex.rest,
      lastSetRpe: ex.lastSetRpe,
      lastSetTechnique: ex.lastSetTechnique,
      substitutions: ex.substitutions,
      weakPointSlot: ex.weakPointSlot,
      baseName: ex.name,
    },
    sets: Array.from({ length: Math.max(1, Number(ex.workingSets) || 1) }, blankSet),
    notes: '',
  };
}

function draftFromDay(day: ProgramDay, week?: WeekPlan): WorkoutSession {
  return {
    id: uid(),
    dayId: day.id,
    dayName: day.name,
    weekId: week?.id,
    weekName: week?.name,
    date: new Date().toISOString(),
    entries: day.exercises.map(entryFromExercise),
  };
}

/** Find a program day by id, wherever it lives (a week or the custom list). */
function findDay(p: WorkoutProgram, dayId: string): ProgramDay | undefined {
  for (const w of p.weeks) {
    const d = w.days.find((x) => x.id === dayId);
    if (d) return d;
  }
  return p.custom.find((x) => x.id === dayId);
}

/** A set was actually performed if it has a weight, reps, or was marked done. */
const wasPerformed = (st: LoggedSet): boolean => !!(st.weight?.trim() || st.reps?.trim() || st.done);

/** Drop unperformed (blank, undone) sets and any exercise left with none — so a
 *  finished session records only what was really done. Critical when a workout
 *  is cut short, and keeps blank sets out of history on every finish. */
export function performedEntries(entries: LoggedExercise[]): LoggedExercise[] {
  return entries
    .map((e) => ({ ...e, sets: e.sets.filter(wasPerformed) }))
    .filter((e) => e.sets.length > 0);
}

/** Apply `fn` to the day with `dayId`, wherever it lives (a week or custom). */
function mapDay(p: WorkoutProgram, dayId: string, fn: (d: ProgramDay) => ProgramDay): WorkoutProgram {
  return {
    ...p,
    weeks: p.weeks.map((w) => ({ ...w, days: w.days.map((d) => (d.id === dayId ? fn(d) : d)) })),
    custom: p.custom.map((d) => (d.id === dayId ? fn(d) : d)),
  };
}

/** Stable key linking a logged session back to a program day (scoped per week). */
export const dayCompletionKey = (weekId: string | undefined, dayId: string): string =>
  weekId ? `${weekId}|${dayId}` : dayId;

/** Derive { dayCompletionKey -> most-recent completedAt ISO } from logged sessions. */
export function completionMap(sessions: WorkoutSession[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of sessions) {
    if (!s.completedAt) continue;
    const key = dayCompletionKey(s.weekId, s.dayId);
    const prev = m.get(key);
    if (!prev || s.completedAt > prev) m.set(key, s.completedAt);
  }
  return m;
}

/** Most recent prior logged performance for an exercise (by name) — the basis
 *  for progressive overload. Skips the in-progress draft (not yet in sessions). */
export function lastPerformance(
  sessions: WorkoutSession[],
  exerciseName: string,
): { date: string; sets: LoggedSet[] } | null {
  const sorted = [...sessions].sort((a, b) => (b.completedAt ?? b.date).localeCompare(a.completedAt ?? a.date));
  for (const s of sorted) {
    const entry: LoggedExercise | undefined = s.entries.find(
      (e) => e.name === exerciseName && e.sets.some((st) => st.weight || st.reps),
    );
    if (entry) return { date: s.completedAt ?? s.date, sets: entry.sets.filter((st) => st.weight || st.reps) };
  }
  return null;
}

/** Parse a prescribed rest string into seconds. "3-4 MIN"→180, "2.0"→120,
 *  "30SEC"→30, "90"→90 (bare number assumed seconds if <10 → minutes). */
export function restToSeconds(rest?: string): number {
  if (!rest) return 0;
  const s = rest.toUpperCase();
  const num = s.match(/\d+(\.\d+)?/);
  if (!num) return 0;
  const n = parseFloat(num[0]);
  if (s.includes('SEC')) return Math.round(n);
  if (s.includes('MIN')) return Math.round(n * 60);
  // Bare/decimal value: small numbers are minutes (e.g. "2.0"), large are seconds.
  return Math.round(n < 10 ? n * 60 : n);
}

/** Distinct exercise names that appear in logged sessions (for the lift picker). */
export function loggedExerciseNames(sessions: WorkoutSession[]): string[] {
  const set = new Set<string>();
  for (const s of sessions) for (const e of s.entries) if (e.sets.some((st) => st.weight)) set.add(e.name);
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Per-session top-set weight + estimated 1RM (Epley) for one lift, oldest→newest. */
export function exerciseProgress(
  sessions: WorkoutSession[],
  name: string,
): { date: string; weight: number; est1RM: number }[] {
  const out: { date: string; weight: number; est1RM: number }[] = [];
  for (const s of sessions) {
    const e = s.entries.find((x) => x.name === name);
    if (!e) continue;
    // Top weight and best estimated 1RM are tracked separately, because they
    // are not always the same set: 60×15 estimates higher than 80×3. Reading
    // e1RM off the heaviest set alone under-reported exactly the back-off work
    // that shows strength going up. detectPRs already scores them apart.
    let topWeight = 0;
    let best1RM = 0;
    for (const st of e.sets) {
      const w = parseFloat(st.weight);
      const r = parseInt(st.reps, 10) || 0;
      if (!Number.isFinite(w) || w <= 0) continue;
      if (w > topWeight) topWeight = w;
      const est = w * (1 + r / 30);
      if (est > best1RM) best1RM = est;
    }
    if (topWeight > 0) out.push({ date: s.completedAt ?? s.date, weight: topWeight, est1RM: Math.round(best1RM) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Total training load (Σ weight×reps across every logged set) per calendar
 *  week (Mon-start), oldest→newest. A unit-agnostic load number that's robust
 *  to which exercises were trained — the right progress lens when per-exercise
 *  volume gets reshuffled week to week. */
export function weeklyVolume(sessions: WorkoutSession[]): { weekStart: string; volume: number; sets: number }[] {
  const mondayStartISO = (iso: string): string | null => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back up to Monday
    return d.toISOString();
  };
  const byWeek = new Map<string, { volume: number; sets: number }>();
  for (const s of sessions) {
    const key = mondayStartISO(s.completedAt ?? s.date);
    if (!key) continue;
    let agg = byWeek.get(key);
    if (!agg) {
      agg = { volume: 0, sets: 0 };
      byWeek.set(key, agg);
    }
    for (const e of s.entries) {
      for (const st of e.sets) {
        const w = parseFloat(st.weight);
        const r = parseInt(st.reps, 10);
        if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(r) || r <= 0) continue;
        agg.volume += w * r;
        agg.sets += 1;
      }
    }
  }
  return [...byWeek.entries()]
    .map(([weekStart, v]) => ({ weekStart, volume: Math.round(v.volume), sets: v.sets }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

export interface ProgramWeekVolume {
  key: string;
  label: string; // "Week 2 · Build" for tagged sessions, "" for calendar fallback
  start: string; // ISO of the bucket's first session (chart x-axis)
  volume: number;
  sets: number;
  weekId?: string;
}

/** Total training load per PROGRAM week (microcycle). A program "week" like the
 *  Pure Bodybuilding cycle spans ~9-10 calendar days, so calendar buckets would
 *  smear one microcycle's volume into the next — here a week's volume concludes
 *  when its sessions do. Sessions without a weekId fall back to calendar
 *  (Monday-start) buckets. Oldest→newest. */
export function volumeByProgramWeek(sessions: WorkoutSession[]): ProgramWeekVolume[] {
  const groups = new Map<string, { label: string; weekId?: string; startMs: number; volume: number; sets: number }>();
  for (const s of sessions) {
    const t = Date.parse(s.completedAt ?? s.date);
    if (Number.isNaN(t)) continue;
    let key: string;
    let label = '';
    let weekId: string | undefined;
    if (s.weekId) {
      key = `w:${s.weekId}`;
      label = s.weekName ?? 'Program week';
      weekId = s.weekId;
    } else {
      const d = new Date(t);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      key = `c:${d.toISOString()}`;
    }
    let g = groups.get(key);
    if (!g) {
      g = { label, weekId, startMs: t, volume: 0, sets: 0 };
      groups.set(key, g);
    }
    g.startMs = Math.min(g.startMs, t);
    for (const e of s.entries)
      for (const st of e.sets) {
        const w = parseFloat(st.weight);
        const r = parseInt(st.reps, 10);
        if (Number.isFinite(w) && w > 0 && Number.isFinite(r) && r > 0) {
          g.volume += w * r;
          g.sets += 1;
        }
      }
  }
  return [...groups.entries()]
    .map(([key, g]) => ({ key, label: g.label, weekId: g.weekId, start: new Date(g.startMs).toISOString(), volume: Math.round(g.volume), sets: g.sets }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

// ───────────────────────── Progress signals (derived) ─────────────────────────
const epley = (w: number, r: number) => (w > 0 && r > 0 ? w * (1 + r / 30) : 0);

export interface PRHit {
  lift: string;
  kind: 'weight' | 'e1rm';
  value: number;
  prev: number;
}

/** PRs a finished `session` set versus ALL earlier sessions — a new best top-set
 *  weight, or (failing that) a new best estimated 1RM, per lift. Only counts when
 *  there was a prior best to beat (so a lift's first-ever log isn't a "PR"). */
export function detectPRs(history: WorkoutSession[], session: WorkoutSession): PRHit[] {
  const when = session.completedAt ?? session.date;
  const prior = history.filter((s) => s.id !== session.id && (s.completedAt ?? s.date) < when);
  const bestOf = (list: WorkoutSession[], lift: string) => {
    let w = 0;
    let e = 0;
    for (const s of list)
      for (const en of s.entries)
        if (en.name === lift)
          for (const st of en.sets) {
            const wt = parseFloat(st.weight);
            const rp = parseInt(st.reps, 10);
            if (!Number.isFinite(wt) || wt <= 0) continue;
            if (wt > w) w = wt;
            const ee = epley(wt, Number.isFinite(rp) ? rp : 0);
            if (ee > e) e = ee;
          }
    return { w, e };
  };
  const lifts = new Set<string>();
  for (const en of session.entries) if (en.sets.some((st) => parseFloat(st.weight) > 0)) lifts.add(en.name);
  const hits: PRHit[] = [];
  for (const lift of lifts) {
    const cur = bestOf([session], lift);
    const prev = bestOf(prior, lift);
    if (prev.w > 0 && cur.w > prev.w) hits.push({ lift, kind: 'weight', value: Math.round(cur.w * 10) / 10, prev: Math.round(prev.w * 10) / 10 });
    else if (prev.e > 0 && Math.round(cur.e) > Math.round(prev.e)) hits.push({ lift, kind: 'e1rm', value: Math.round(cur.e), prev: Math.round(prev.e) });
  }
  return hits;
}

/** Format a training-volume load (Σ weight×reps, in the program's unit) for
 *  display. Big loads overflow the screen, so ≥10,000 collapses to tonnes. */
export function formatVolume(kgReps: number, unit: WeightUnit = 'kg'): string {
  if (kgReps >= 10000) return `${(kgReps / 1000).toFixed(1)} t`;
  return `${Math.round(kgReps).toLocaleString()} ${unit}·reps`;
}

export interface VolumeTrend {
  thisWeek: number;
  lastWeek: number;
  deltaPct: number | null;
  dir: 'up' | 'down' | 'flat' | 'na';
}

/** Training volume in the trailing 7 days vs the 7 days before that, anchored
 *  to the most recent session. (Calendar-week buckets would compare a partial
 *  current week against a full prior one and read as a false drop.) */
export function volumeTrend(sessions: WorkoutSession[]): VolumeTrend {
  const DAY = 86_400_000;
  const times = sessions.map((s) => Date.parse(s.completedAt ?? s.date)).filter((t) => !Number.isNaN(t));
  if (times.length === 0) return { thisWeek: 0, lastWeek: 0, deltaPct: null, dir: 'na' };
  const anchor = times.reduce((a, b) => Math.max(a, b), -Infinity);
  const volIn = (startMs: number, endMs: number): number => {
    let sum = 0;
    for (const s of sessions) {
      const t = Date.parse(s.completedAt ?? s.date);
      if (Number.isNaN(t) || t <= startMs || t > endMs) continue;
      for (const e of s.entries)
        for (const st of e.sets) {
          const w = parseFloat(st.weight);
          const r = parseInt(st.reps, 10);
          if (Number.isFinite(w) && w > 0 && Number.isFinite(r) && r > 0) sum += w * r;
        }
    }
    return Math.round(sum);
  };
  const thisWeek = volIn(anchor - 7 * DAY, anchor);
  const lastWeek = volIn(anchor - 14 * DAY, anchor - 7 * DAY);
  if (lastWeek === 0) return { thisWeek, lastWeek, deltaPct: null, dir: 'na' };
  const deltaPct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
  return { thisWeek, lastWeek, deltaPct, dir: deltaPct > 2 ? 'up' : deltaPct < -2 ? 'down' : 'flat' };
}

export interface Adherence {
  done: number;
  total: number;
  pct: number;
}

/** How many of the selected week's prescribed days have been logged.
 *
 *  Every level is guarded. The program is persisted to localStorage and
 *  restored verbatim, so a partial write, an older schema or a bad sync can
 *  hand back an object whose `weeks` or `days` is missing — and this is called
 *  from the Progress screen on every render, so a throw here blanks the page
 *  rather than degrading one number. Found by fuzzing. */
export function weekAdherence(program: WorkoutProgram, sessions: WorkoutSession[], weekId: string): Adherence {
  const week = program?.weeks?.find?.((w) => w?.id === weekId);
  const days = week?.days;
  if (!week || !Array.isArray(days) || days.length === 0) return { done: 0, total: 0, pct: 0 };
  const map = completionMap(sessions);
  const done = days.filter((d) => map.has(dayCompletionKey(week.id, d?.id))).length;
  return { done, total: days.length, pct: Math.round((done / days.length) * 100) };
}

/** Greedy plates-per-side for a target total weight. */
export function platesPerSide(target: number, bar: number, plates: number[]): { remaining: number; counts: { plate: number; n: number }[] } {
  let perSide = (target - bar) / 2;
  if (!Number.isFinite(perSide) || perSide <= 0) return { remaining: 0, counts: [] };
  const counts: { plate: number; n: number }[] = [];
  for (const p of [...plates].sort((a, b) => b - a)) {
    const n = Math.floor(perSide / p + 1e-9);
    if (n > 0) {
      counts.push({ plate: p, n });
      perSide -= n * p;
    }
  }
  return { remaining: Math.round(perSide * 100) / 100, counts };
}

interface AfterburnState {
  program: WorkoutProgram;
  sessions: WorkoutSession[];
  draft: WorkoutSession | null;
  currentWeekId: string;
  setCurrentWeek: (id: string) => void;
  _cloudLoaded: boolean;
  /** Which account this device's training log belongs to. See loadWorkouts. */
  ownerId: string | null;
  /** Wipe this device's training log — used when the signed-in account changes. */
  resetTraining: () => void;
  loadWorkouts: () => Promise<void>;
  loadProgram: (program: WorkoutProgram) => void;
  startDay: (dayId: string) => void;
  cancelDraft: () => void;
  finishDraft: (opts?: { endedEarly?: boolean; note?: string; roughDay?: boolean }) => void;
  reopenSession: (id: string) => void;
  updateSet: (exIdx: number, setIdx: number, patch: Partial<LoggedSet>) => void;
  addSet: (exIdx: number) => void;
  removeSet: (exIdx: number) => void;
  setExerciseNotes: (exIdx: number, notes: string) => void;
  swapDraftExercise: (exIdx: number, name: string) => void;
  setPrimaryDay: (dayId: string) => void;
  addCustomDay: (name: string) => string;
  addExercise: (dayId: string, ex: Omit<ProgramExercise, 'id'>) => void;
  removeExercise: (dayId: string, exId: string) => void;
  removeDay: (dayId: string) => void;
  deleteSession: (id: string) => void;
  setSessionWeek: (sessionId: string, weekId: string) => void;
  resetProgram: () => void;
  bodyweight: BodyEntry[];
  addBodyweight: (weight: number, note?: string) => void;
  deleteBodyweight: (id: string) => void;
  recovery: RecoveryEntry[];
  addRecovery: (co2Score: number, note?: string) => void;
  deleteRecovery: (id: string) => void;
  nutrition: NutritionProfile;
  setNutrition: (patch: Partial<NutritionProfile>) => void;
  /** How many days an exercise note keeps resurfacing. 0 turns recall off,
   *  Infinity keeps every note. Defaults to one week — about one microcycle, so
   *  you meet the lift again while the note still applies. */
  noteRecallDays: number;
  setNoteRecallDays: (days: number) => void;
}

export const useAfterburn = create<AfterburnState>()(
  persist(
    (set, get) => ({
      program: DEFAULT_PROGRAM,
      sessions: [],
      bodyweight: [],
      recovery: [],
      nutrition: DEFAULT_NUTRITION,
      noteRecallDays: DEFAULT_RECALL_DAYS,
      setNoteRecallDays: (days) => set({ noteRecallDays: Number.isFinite(days) && days >= 0 ? days : DEFAULT_RECALL_DAYS }),
      draft: null,
      currentWeekId: '',
      setCurrentWeek: (id) => set({ currentWeekId: id }),
      _cloudLoaded: false,
      ownerId: null,

      resetTraining: () => {
        const fresh = useAfterburn.getInitialState();
        setMarker('1970-01-01T00:00:00.000Z');
        set({
          program: fresh.program,
          currentWeekId: fresh.currentWeekId,
          sessions: fresh.sessions,
          bodyweight: fresh.bodyweight,
          recovery: fresh.recovery,
          nutrition: fresh.nutrition,
          ownerId: null,
        });
      },

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
          // A different account on this browser: the local training log belongs
          // to the previous one. Without this, an older/absent cloud row leaves
          // their program and logged sessions in place for the new account —
          // and the next save uploads it into that account's row.
          const id = session.user.id;
          const prevOwner = get().ownerId;
          if (prevOwner && prevOwner !== id) get().resetTraining();
          set({ ownerId: id });

          const { data, error } = await supabase
            .from('workout_data')
            .select('data, updated_at')
            .eq('id', id)
            .single();
          if (error && error.code !== 'PGRST116') console.error('Afterburn cloud load failed', error);
          const cloudTs = data?.updated_at ?? '';
          if (data?.data && cloudTs > getMarker()) {
            const d = data.data as {
              program?: WorkoutProgram;
              sessions?: WorkoutSession[];
              bodyweight?: BodyEntry[];
              recovery?: RecoveryEntry[];
              nutrition?: NutritionProfile;
            };
            // Ignore an old-shape cloud program (pre-weeks) so it can't break the UI.
            const validProgram = d.program && Array.isArray(d.program.weeks) ? d.program : undefined;
            set({
              program: withWeakPoints(validProgram ?? get().program),
              sessions: d.sessions ?? get().sessions,
              bodyweight: Array.isArray(d.bodyweight) ? d.bodyweight : get().bodyweight,
              recovery: Array.isArray(d.recovery) ? d.recovery : get().recovery,
              nutrition: d.nutrition ? { ...get().nutrition, ...d.nutrition } : get().nutrition,
            });
            setMarker(cloudTs || new Date().toISOString());
          }
        } catch (e) {
          console.error('Afterburn cloud load failed', e);
        }
        set({ _cloudLoaded: true });
      },

      // Load a whole program (from the library or a fresh custom one). Replaces
      // only the prescribed plan + jumps to its first week — NEVER touches the
      // logged `sessions`, so history is always preserved.
      loadProgram: (program) => set({ program, currentWeekId: program.weeks[0]?.id ?? '' }),

      startDay: (dayId) => {
        const p = get().program;
        let week: WeekPlan | undefined;
        let day: ProgramDay | undefined;
        for (const w of p.weeks) {
          const d = w.days.find((x) => x.id === dayId);
          if (d) {
            week = w;
            day = d;
            break;
          }
        }
        if (!day) day = p.custom.find((x) => x.id === dayId); // custom day → no week
        if (day) set({ draft: draftFromDay(day, week) });
      },
      cancelDraft: () => set({ draft: null }),
      finishDraft: (opts) => {
        const d = get().draft;
        if (!d) return;
        const session: WorkoutSession = {
          ...d,
          completedAt: new Date().toISOString(),
          entries: performedEntries(d.entries),
          endedEarly: opts?.endedEarly || undefined,
          endNote: opts?.endedEarly ? opts?.note?.trim() || undefined : undefined,
          // Kept in history and on the charts, but excluded from the load model:
          // an off day is honest data about the day, not about strength.
          roughDay: opts?.roughDay || undefined,
        };
        set({ sessions: [session, ...get().sessions], draft: null });
      },
      // Pull a finished session back into an editable draft (e.g. an accidental
      // finish, or to fix a logged set). Keeps the original id/date so
      // re-finishing updates the same entry instead of duplicating it. Rebuilds
      // the FULL prescribed exercise list from the program day so exercises you
      // skipped (pruned away on finish) reappear as blank rows to fill in;
      // whatever you logged is overlaid, matched by exerciseId.
      reopenSession: (id) =>
        set((s) => {
          const session = s.sessions.find((x) => x.id === id);
          if (!session) return s;
          const day = findDay(s.program, session.dayId);
          let entries = session.entries;
          if (day) {
            const logged = new Map(session.entries.map((e) => [e.exerciseId, e]));
            const dayIds = new Set(day.exercises.map((e) => e.id));
            const fromDay = day.exercises.map((ex) => logged.get(ex.id) ?? entryFromExercise(ex));
            const extras = session.entries.filter((e) => !dayIds.has(e.exerciseId)); // ad-hoc / custom additions
            entries = [...fromDay, ...extras];
          }
          return { draft: { ...session, completedAt: undefined, entries }, sessions: s.sessions.filter((x) => x.id !== id) };
        }),

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
      // Swap the logged exercise's name (substitution picker / weak-point pick).
      // The session records what was actually performed.
      swapDraftExercise: (exIdx, name) =>
        set((s) => {
          if (!s.draft) return s;
          const entries = s.draft.entries.map((e, i) => (i !== exIdx ? e : { ...e, name }));
          return { draft: { ...s.draft, entries } };
        }),
      // Pin a single day as "primary" (clears the flag on every other day).
      setPrimaryDay: (dayId) =>
        set((s) => {
          const flag = (d: ProgramDay): ProgramDay => ({ ...d, isPrimary: d.id === dayId ? !d.isPrimary : false });
          return {
            program: {
              ...s.program,
              weeks: s.program.weeks.map((w) => ({ ...w, days: w.days.map(flag) })),
              custom: s.program.custom.map(flag),
            },
          };
        }),

      addCustomDay: (name) => {
        const id = uid();
        set((s) => ({ program: { ...s.program, custom: [...s.program.custom, { id, name, source: 'custom', exercises: [] }] } }));
        return id;
      },
      addExercise: (dayId, ex) =>
        set((s) => ({ program: mapDay(s.program, dayId, (d) => ({ ...d, exercises: [...d.exercises, { ...ex, id: uid() }] })) })),
      removeExercise: (dayId, exId) =>
        set((s) => ({ program: mapDay(s.program, dayId, (d) => ({ ...d, exercises: d.exercises.filter((e) => e.id !== exId) })) })),
      removeDay: (dayId) => set((s) => ({ program: { ...s.program, custom: s.program.custom.filter((d) => d.id !== dayId) } })),
      deleteSession: (id) => set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) })),
      // Attribute a logged session to a program week (e.g. older logs that
      // predate week tracking). Re-points dayId to that week's matching day (by
      // name) so the Workout tab marks the right week's day as Done.
      setSessionWeek: (sessionId, weekId) =>
        set((s) => {
          const week = s.program.weeks.find((w) => w.id === weekId);
          return {
            sessions: s.sessions.map((ses) => {
              if (ses.id !== sessionId) return ses;
              if (!week) return { ...ses, weekId: undefined, weekName: undefined };
              const match = week.days.find((d) => d.name === ses.dayName);
              return { ...ses, weekId: week.id, weekName: week.name, dayId: match?.id ?? ses.dayId };
            }),
          };
        }),
      resetProgram: () => set({ program: DEFAULT_PROGRAM }),

      addBodyweight: (weight, note) =>
        set((s) => ({
          bodyweight: [{ id: uid(), date: new Date().toISOString(), weight, note: note?.trim() || undefined }, ...s.bodyweight],
        })),
      deleteBodyweight: (id) => set((s) => ({ bodyweight: s.bodyweight.filter((b) => b.id !== id) })),

      addRecovery: (co2Score, note) =>
        set((s) => ({
          recovery: [{ id: uid(), date: new Date().toISOString(), co2Score, note: note?.trim() || undefined }, ...s.recovery],
        })),
      deleteRecovery: (id) => set((s) => ({ recovery: s.recovery.filter((r) => r.id !== id) })),
      setNutrition: (patch) => set((s) => ({ nutrition: { ...s.nutrition, ...patch } })),
    }),
    {
      name: 'liftoff-afterburn',
      version: 4,
      // v1 stored a single-week `program.days`. Reset the program to the new
      // multi-week default if the persisted shape predates `weeks` (keep sessions).
      // v3 added the `recovery` collection — backfill it so old persists load.
      // v4 backfills the Weak Point Table onto persisted Pure Bodybuilding copies.
      migrate: (persisted: unknown) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        if (!Array.isArray(p.recovery)) p.recovery = [];
        const prog = p.program as WorkoutProgram | undefined;
        if (!prog || !Array.isArray(prog.weeks)) {
          return { ...p, program: DEFAULT_PROGRAM, currentWeekId: '' };
        }
        p.program = withWeakPoints(prog);
        return p;
      },
      partialize: (s) => ({ program: s.program, sessions: s.sessions, bodyweight: s.bodyweight, recovery: s.recovery, nutrition: s.nutrition, draft: s.draft, currentWeekId: s.currentWeekId, noteRecallDays: s.noteRecallDays }),
    },
  ),
);

// Push program/session changes to the cloud (debounced). Gated on _cloudLoaded
// so we never overwrite the cloud before the first pull; ignores draft edits.
let lastProgram = useAfterburn.getState().program;
let lastSessions = useAfterburn.getState().sessions;
let lastBodyweight = useAfterburn.getState().bodyweight;
let lastRecovery = useAfterburn.getState().recovery;
let lastNutrition = useAfterburn.getState().nutrition;
let syncTimer: ReturnType<typeof setTimeout>;
useAfterburn.subscribe((state) => {
  if (!isSupabaseConfigured || !state._cloudLoaded) return;
  if (
    state.program === lastProgram &&
    state.sessions === lastSessions &&
    state.bodyweight === lastBodyweight &&
    state.recovery === lastRecovery &&
    state.nutrition === lastNutrition
  )
    return;
  lastProgram = state.program;
  lastSessions = state.sessions;
  lastBodyweight = state.bodyweight;
  lastRecovery = state.recovery;
  lastNutrition = state.nutrition;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const ts = new Date().toISOString();
      const { error } = await supabase.from('workout_data').upsert(
        { id: session.user.id, data: { program: state.program, sessions: state.sessions, bodyweight: state.bodyweight, recovery: state.recovery, nutrition: state.nutrition }, updated_at: ts },
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

// `useAppMode` lives in ./mode so the eager app shell can import it without
// pulling this heavy store (and plan.ts) into the initial bundle.
export { useAppMode } from './mode';
