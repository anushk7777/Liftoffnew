import { describe, it, expect } from 'vitest';
import { PURE_BODYBUILDING_PROGRAM } from './pureBodybuilding';
import { classifyExercise, isPlaceholderExercise } from './volume';

/** Every exercise name the loaded program can put in front of the lifter —
 *  main slots and substitution options alike. */
function programExerciseNames(): string[] {
  const names = new Set<string>();
  for (const w of PURE_BODYBUILDING_PROGRAM.weeks)
    for (const d of w.days)
      for (const e of d.exercises) {
        names.add(e.name);
        for (const s of e.substitutions ?? []) names.add(s);
      }
  return [...names].sort();
}

/** The weak-point picker's options — logged under these names once chosen. */
function weakPointNames(): string[] {
  return [...new Set((PURE_BODYBUILDING_PROGRAM.weakPoints ?? []).flatMap((g) => [...g.exercise1, ...g.exercise2]))].sort();
}

const muscles = (name: string) => {
  const c = classifyExercise(name);
  return c ? { p: c.primary.join('+'), s: c.secondary.join('+') } : null;
};

describe('classifyExercise against the real program', () => {
  // The guard that matters most. An unclassified lift is silently worth ZERO
  // sets, so a gap here does not look like a bug — it looks like you under-
  // trained a muscle. This asserts the whole program is covered.
  it('classifies every exercise the program can show, bar the picker slots', () => {
    const unmatched = programExerciseNames().filter(
      (n) => !classifyExercise(n) && !isPlaceholderExercise(n),
    );
    expect(unmatched).toEqual([]);
  });

  it('classifies the weak-point options too, except neck work', () => {
    // Neck has no volume landmark, so it stays deliberately unclassified rather
    // than being credited to some other muscle.
    const names = weakPointNames();
    expect(names.length).toBeGreaterThan(10); // guard against a vacuous pass
    const unmatched = names.filter((n) => !classifyExercise(n));
    expect(unmatched.every((n) => /neck/i.test(n))).toBe(true);
    // The trap this guards: "Neck Curls" contains "curl".
    expect(classifyExercise('Plate-Loaded Neck Curls')).toBeNull();
  });

  it('leaves the weak-point picker slots as placeholders, not unknown lifts', () => {
    expect(isPlaceholderExercise('Weak Point Exercise 1')).toBe(true);
    expect(isPlaceholderExercise('Weak Point Exercise 2 (optional)')).toBe(true);
    expect(isPlaceholderExercise('DB Curl')).toBe(false);
  });
});

describe('names that used to be classified as the wrong muscle', () => {
  it('reads a reverse flye as rear delts, not chest', () => {
    // "reverse fly" never matched as one substring because the equipment sits in
    // the middle of the name — and "Flye" contains "fly", so it fell through to
    // the chest rule and credited pec volume for rear-delt work.
    for (const n of ['Reverse DB Flye', 'Bent-Over Reverse DB Flye (w/ Integrated Partials)', 'Cable Reverse Flye (Mechanical Dropset)']) {
      expect(muscles(n)).toEqual({ p: 'shoulders', s: 'traps' });
    }
    // A genuine chest flye is untouched.
    expect(muscles('DB Flye (w/ Integrated Partials)')?.p).toBe('chest');
  });

  it('reads an incline curl as biceps, not an incline press', () => {
    for (const n of ['DB Incline Curl', 'DB Slow-Eccentric Incline Curl', 'Incline DB Stretch-Curl']) {
      expect(muscles(n)).toEqual({ p: 'biceps', s: 'forearms' });
    }
    expect(muscles('Low Incline Barbell Press')?.p).toBe('chest');
  });

  it('reads an incline dumbbell press as chest, not shoulders', () => {
    // "db press" meant a shoulder press, and claimed the incline bench press too.
    expect(muscles('Low Incline DB Press')?.p).toBe('chest');
    expect(muscles('Seated DB Shoulder Press')?.p).toBe('shoulders');
  });

  it('keeps the back work in a row + Kelso shrug', () => {
    expect(muscles('Chest-Supported T-Bar Row + Kelso Shrug')).toEqual({ p: 'back', s: 'traps+biceps' });
    expect(muscles('DB Shrug')?.p).toBe('traps');
  });

  it('reads a reverse nordic as quads, since the knee extends', () => {
    expect(muscles('Reverse Nordic')?.p).toBe('quads');
    expect(muscles('Nordic Ham Curl')?.p).toBe('hamstrings');
  });

  it('gives a leg curl no glute credit but a glute-ham raise some', () => {
    expect(muscles('Lying Leg Curl')).toEqual({ p: 'hamstrings', s: '' });
    expect(muscles('Glute-Ham Raise')).toEqual({ p: 'hamstrings', s: 'glutes' });
  });

  it('reads a bench dip as triceps and a bodyweight dip as chest', () => {
    expect(muscles('Bench Dip')?.p).toBe('triceps');
    expect(muscles('Bodyweight Dip')?.p).toBe('chest');
  });
});

describe('names that used to count for nothing at all', () => {
  it('counts decline pressing as chest', () => {
    expect(muscles('Decline Barbell Press')?.p).toBe('chest');
    expect(muscles('Decline Smith Machine Press')?.p).toBe('chest');
  });

  it('counts straight-arm lat work as back, without chest credit', () => {
    expect(muscles('Straight-Bar Lat Prayer')).toEqual({ p: 'back', s: '' });
    expect(muscles('Cross-Body Lat Pull-Around')).toEqual({ p: 'back', s: '' });
    // A real pullover does involve the chest.
    expect(muscles('DB Lat Pullover')).toEqual({ p: 'back', s: 'chest' });
  });

  it('separates hip adduction from abduction', () => {
    expect(muscles('Machine Hip Adduction')?.p).toBe('adductors');
    expect(muscles('Copenhagen Hip Adduction')?.p).toBe('adductors');
    expect(muscles('Machine Hip Abduction')?.p).toBe('glutes');
    expect(muscles('Band Walk')?.p).toBe('glutes');
  });

  it('ignores a superset prefix', () => {
    expect(muscles('A1: Machine Hip Adduction')?.p).toBe('adductors');
    expect(muscles('A2: Machine Hip Abduction')?.p).toBe('glutes');
  });

  it('counts the rest of the core work', () => {
    for (const n of ['Swiss Ball Rollout', 'Stomach Vacuums', 'Half-Kneeling Pallof Press']) {
      expect(muscles(n)?.p).toBe('abs');
    }
  });

  it('counts a 45° hyperextension as back-led posterior chain', () => {
    expect(muscles('Arms-Extended 45° Hyperextension')).toEqual({ p: 'back', s: 'glutes+hamstrings' });
  });

  it('counts a Y-raise as shoulders', () => {
    expect(muscles('Cross-Body Cable Y-Raise')).toEqual({ p: 'shoulders', s: 'traps' });
  });
});
