// Liftoff Afterburn — workout logger types.
export type ExerciseSource = 'powerbuilding' | 'arms' | 'custom';
export type WeightUnit = 'kg' | 'lb';
export type AppMode = 'focus' | 'afterburn';

/** A prescribed exercise in the program (the plan, as written). */
export interface ProgramExercise {
  id: string;
  name: string;
  warmupSets?: number;
  workingSets: number;
  reps: string; // "8", "6-8", "10+5+5"
  percent1RM?: string; // "72.5-77.5%"
  rpe?: string; // target RPE, "8.5" | "9"
  tempo?: string; // "2.1.1.1"
  rest?: string; // "3-4 MIN" | "2.0"
  notes?: string;
}

export interface ProgramDay {
  id: string;
  name: string;
  source: ExerciseSource;
  note?: string;
  exercises: ProgramExercise[];
}

export interface WorkoutProgram {
  name: string;
  unit: WeightUnit;
  days: ProgramDay[];
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
  target: { reps: string; rpe?: string; percent1RM?: string; tempo?: string };
  sets: LoggedSet[];
  notes: string;
}

export interface WorkoutSession {
  id: string;
  dayId: string;
  dayName: string;
  date: string; // ISO — when started
  completedAt?: string; // ISO — when finished
  entries: LoggedExercise[];
}
