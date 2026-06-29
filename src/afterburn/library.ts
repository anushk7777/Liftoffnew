// The "Your Programs" library shown when entering Afterburn. Templates live in
// code (versioned, diffable) and cost nothing until loaded — picking one
// deep-copies a fresh WorkoutProgram into the store's single active `program`.
// Logged sessions are never touched by loading a template.
import type { WorkoutProgram } from './types';
import { POWERBUILDING_PROGRAM } from './plan';
import { PURE_BODYBUILDING_PROGRAM } from './pureBodybuilding';

export type ProgramTemplateStatus = 'available' | 'coming-soon' | 'custom';

export interface ProgramTemplate {
  id: string;
  title: string;
  subtitle: string;
  status: ProgramTemplateStatus;
  /** Builds a fresh copy of the program. Absent for 'coming-soon' entries. */
  build?: () => WorkoutProgram;
}

const clone = <T>(v: T): T =>
  typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v));

export const PROGRAM_TEMPLATES: ProgramTemplate[] = [
  {
    id: 'powerbuilding',
    title: 'Powerlifting + Arms',
    subtitle: 'Jeff Nippard · 11-week powerbuilding cycle with dedicated arm days',
    status: 'available',
    build: () => clone(POWERBUILDING_PROGRAM),
  },
  {
    id: 'pure-bodybuilding',
    title: 'The Pure Bodybuilding Program',
    subtitle: 'Jeff Nippard · 10-week PPL/Arms — 2 blocks, async 10-day cycle, with substitutions',
    status: 'available',
    build: () => clone(PURE_BODYBUILDING_PROGRAM),
  },
  {
    id: 'custom',
    title: 'Add your own program',
    subtitle: 'Start blank and build it week by week, day by day',
    status: 'custom',
    build: () => ({ name: 'My Program', unit: 'kg', weeks: [], custom: [] }),
  },
];
