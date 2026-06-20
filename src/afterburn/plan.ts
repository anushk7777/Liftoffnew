// Default Afterburn program for a BRAND-NEW install: intentionally empty so each
// user builds (or imports) their own plan rather than inheriting someone else's.
// NOTE: this only seeds fresh state. An existing user's program + logged sessions
// live in their persisted `liftoff-afterburn` localStorage AND their own
// `workout_data` cloud row, and are never overwritten by this default.
import type { WorkoutProgram } from './types';

export const DEFAULT_PROGRAM: WorkoutProgram = {
  name: 'My Program',
  unit: 'kg',
  weeks: [],
  custom: [],
};
