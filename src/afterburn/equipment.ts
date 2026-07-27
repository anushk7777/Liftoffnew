// What you can actually add to the bar.
//
// Load suggestions assumed a 2.5 kg step for everything. Equipment does not
// work that way, and the difference is not small:
//
//   barbell at 100 kg, +2.5 kg  →  2.5%   fine
//   machine at  60 kg, +5   kg  →  8.3%   a big jump
//   dumbbell at 10 kg, +2.5 kg  →  25%    absurd
//
// A dumbbell is logged per hand, so the smallest pair in the rack is a huge
// relative increment on small isolation lifts. Prescribing it is how a lifter
// gets stuck: the jump is unmakeable, so nothing changes for months. The answer
// there is not a heavier weight, it is more reps at the same one — which is
// what double progression has always said, and what the app could not express
// because it only knew how to suggest load.

export type Equipment = 'barbell' | 'smith' | 'dumbbell' | 'machine' | 'cable' | 'unknown';

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: 'barbell',
  smith: 'Smith machine',
  dumbbell: 'dumbbells',
  machine: 'the machine',
  cable: 'the cable stack',
  unknown: 'this lift',
};

interface Rule {
  kw: string[];
  eq: Equipment;
}

// First match wins, so the order is the whole design. Cable sits above barbell
// because "Straight-Bar Lat Prayer" is a cable movement that happens to name a
// bar attachment.
const RULES: Rule[] = [
  { kw: ['smith'], eq: 'smith' },
  {
    kw: ['cable', 'pulldown', 'pull down', 'pull-down', 'pushdown', 'pressdown', 'rope', 'crossover', 'lat prayer', 'pull-around', 'pull around', 'pull-in', 'face pull', 'cuffed', 'bayesian', 'pallof'],
    eq: 'cable',
  },
  {
    kw: ['machine', 'pec deck', 'leg press', 'hack squat', 'pendulum', 'leg extension', 'leg curl', 'hip thrust machine', 'hip adduction', 'hip abduction', 'assisted dip', 'belt squat', 'chest press'],
    eq: 'machine',
  },
  { kw: ['dumbbell', 'db ', ' db', 'goblet', 'kettlebell'], eq: 'dumbbell' },
  { kw: ['barbell', 'bb ', 'ez-bar', 'ez bar', 'straight bar', 'squat', 'deadlift', 'rdl', 'bench press', 'good morning', 'shrug', 'row', 'press'], eq: 'barbell' },
];

/** Guess what a logged exercise is loaded on, from its name. */
export function equipmentOf(name: string): Equipment {
  const n = name.toLowerCase();
  for (const r of RULES) if (r.kw.some((k) => n.includes(k))) return r.eq;
  return 'unknown';
}

/**
 * The smallest load increase this equipment can actually make.
 *
 * Deliberately conservative — where a gym might have either 2.5 kg or 5 kg
 * jumps, the SMALLER is assumed. Guessing small only risks suggesting a weight
 * that turns out to be unmakeable, and the lifter sees that immediately.
 * Guessing large silently converts a genuine load increase into "add reps",
 * which is invisible and would stall progression for real.
 *
 * `unknown` keeps the old flat step, so nothing regresses on a lift whose name
 * gives nothing away.
 */
export function loadStep(eq: Equipment, unit: 'kg' | 'lb' = 'kg'): number {
  if (unit === 'lb') {
    // Imperial racks: 5 lb bar jumps, 5 lb dumbbells, 10 lb machine stacks.
    return eq === 'machine' ? 10 : 5;
  }
  switch (eq) {
    case 'machine':
      return 5; // pin stacks
    case 'dumbbell':
      return 2.5; // per hand, and that is the point
    case 'cable':
      return 2.5;
    case 'barbell':
    case 'smith':
      return 2.5; // a pair of 1.25s
    default:
      return 2.5;
  }
}

/** The step as a share of the current load — how big the smallest jump feels. */
export function stepShare(current: number, step: number): number {
  return current > 0 ? step / current : 0;
}
