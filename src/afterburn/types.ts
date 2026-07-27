// Liftoff Afterburn — workout logger types.
export type ExerciseSource = 'powerbuilding' | 'arms' | 'custom';
export type WeightUnit = 'kg' | 'lb';
export type AppMode = 'focus' | 'afterburn' | 'kairos' | 'templates';

/** A prescribed exercise in the program (the plan, as written). */
export interface ProgramExercise {
  id: string;
  name: string;
  warmupSets?: number;
  warmup?: string; // free-text warm-up count/range, e.g. "1-2" (takes precedence over warmupSets for display)
  workingSets: number;
  reps: string; // "8", "6-8", "10+5+5"
  percent1RM?: string; // "72.5-77.5%"
  rpe?: string; // early-set target RPE, "8.5" | "~9-10"
  lastSetRpe?: string; // last-set target RPE (Pure Bodybuilding splits early vs last set)
  lastSetTechnique?: string; // e.g. "Myo-reps", "Dropset", "Long-length Partials"
  substitutions?: string[]; // alternate exercises the user can swap to
  weakPointSlot?: 1 | 2; // marks a "pick your weak-point exercise" slot on Arms days
  tempo?: string; // "2.1.1.1"
  rest?: string; // "3-4 MIN" | "2.0"
  notes?: string;
}

/** A weak-point muscle group and its exercise options (from the Hypertrophy
 *  Handbook's Weak Point Table). Populates the weak-point picker on Arms days. */
export interface WeakPointGroup {
  muscle: string;
  exercise1: string[];
  exercise2: string[];
  /** Matching volume.ts Muscle id, so the picker can flag lagging groups. */
  volumeKey?: string;
}

export interface ProgramDay {
  id: string;
  name: string;
  source: ExerciseSource;
  note?: string;
  isPrimary?: boolean; // user-pinned "primary" workout
  exercises: ProgramExercise[];
}

export interface WeekPlan {
  id: string;
  name: string;
  days: ProgramDay[];
}

export interface WorkoutProgram {
  name: string;
  unit: WeightUnit;
  weeks: WeekPlan[];
  /** User-added workouts, available regardless of selected week. */
  custom: ProgramDay[];
  /** Weak Point Table (optional) — enables the weak-point picker on Arms days. */
  weakPoints?: WeakPointGroup[];
}

/** One logged set. Inputs kept as strings for friction-free typing. */
export interface LoggedSet {
  id: string;
  weight: string;
  reps: string;
  rpe: string; // RPE achieved
  rating: number; // 1-5 stars, 0 = unrated
  done: boolean;
}

export interface LoggedExercise {
  exerciseId: string;
  name: string;
  target: {
    reps: string;
    rpe?: string;
    percent1RM?: string;
    tempo?: string;
    rest?: string;
    lastSetRpe?: string;
    lastSetTechnique?: string;
    substitutions?: string[];
    weakPointSlot?: 1 | 2;
    baseName?: string; // the prescribed exercise name (so the substitution picker can always offer it)
  };
  sets: LoggedSet[];
  notes: string;
}

export interface WorkoutSession {
  id: string;
  dayId: string;
  dayName: string;
  weekId?: string; // which program week this day belonged to (optional: old sessions/custom days have none)
  weekName?: string; // denormalized label, e.g. "Week 3" — survives a program swap
  date: string; // ISO — when started
  completedAt?: string; // ISO — when finished
  endedEarly?: boolean; // user cut the session short (e.g. didn't feel recovered)
  endNote?: string; // why it was ended early
  /** Lifter marked this an off day. Kept in history, excluded from the load
   *  model — they know before the app can infer it. */
  roughDay?: boolean;
  entries: LoggedExercise[];
}

/** A bodyweight check-in for the Progress tab. */
export interface BodyEntry {
  id: string;
  date: string; // ISO
  weight: number;
  note?: string;
}

/** A daily CO2 tolerance test score (controlled-exhale seconds) — a proxy for
 *  autonomic recovery / readiness, per Andrew Huberman / Brian Mackenzie. */
export interface RecoveryEntry {
  id: string;
  date: string; // ISO
  co2Score: number; // seconds of slow controlled exhale after a full inhale
  note?: string;
}
