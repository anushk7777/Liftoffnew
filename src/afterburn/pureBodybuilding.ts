// The Pure Bodybuilding Program — Push / Pull / Legs / Arms (Jeff Nippard).
// 10 weeks across 2 blocks on an asynchronous 10-day cycle: 8 distinct workout
// day-types per week (Pull/Push/Legs/Arms ×2). Weeks 1-4 = Block 1 "Build",
// week 5 = deload; weeks 6-9 = Block 2 "Novelty" (different exercise selection),
// week 10 = deload. Transcribed from the program export with the OCR
// interleaving cleaned (e.g. split substitution cells re-joined). Each exercise
// carries early- vs last-set RPE, last-set intensity technique, and its two
// substitution options. The Weak Point Table lives in the Hypertrophy Handbook;
// the two "Weak Point" slots on Arms days are left as picker slots (weakPointSlot)
// and light up once a weakPoints table is provided.
import type { ExerciseSource, ProgramExercise, WeakPointGroup, WeekPlan, WorkoutProgram } from './types';

type ExT = Omit<ProgramExercise, 'id'>;
interface DayT {
  name: string;
  source: ExerciseSource;
  note?: string;
  exercises: ExT[];
}

// Compact exercise constructor: (name, warmup, workingSets, reps, earlyRPE, lastRPE, rest, subs, extra?)
const E = (
  name: string,
  warmup: string,
  workingSets: number,
  reps: string,
  rpe: string,
  lastSetRpe: string,
  rest: string,
  substitutions: string[],
  extra?: Partial<ExT>,
): ExT => ({ name, warmup, workingSets, reps, rpe, lastSetRpe, rest, substitutions, ...extra });

const PP: ExerciseSource = 'powerbuilding';
const ARM: ExerciseSource = 'arms';

// Weak-point picker slots used on every Arms & Weak Points day.
const WP1: ExT = E('Weak Point Exercise 1', '1-3', 3, '8-12', '~9', '~9-10', '~1-3 min', [], {
  weakPointSlot: 1,
  notes: 'Pick ONE exercise for your chosen weak point (Exercise 1 column of the Weak Point Table).',
});
const WP2: ExT = E('Weak Point Exercise 2 (optional)', '1-3', 2, '8-12', '~9', '~9-10', '~1-3 min', [], {
  weakPointSlot: 2,
  notes: 'Optional — only if your weak point feels recovered (not sore/fatigued). Pick ONE from the Exercise 2 column.',
});

// ─────────────────────────────── BLOCK 1 (Build) ───────────────────────────────
const BLOCK1: DayT[] = [
  {
    name: 'Pull #1 (Lat Focused)',
    source: PP,
    exercises: [
      E('Cross-Body Lat Pull-Around', '1', 3, '10-12', '~9', '10', '~2-3 min', ['Half-Kneeling 1-Arm Lat Pulldown', 'Neutral-Grip Pullup'], { lastSetTechnique: 'Long-length Partials', notes: 'Keep cable and wrist in a straight line; deep lat stretch at the top; 1s pause at the bottom. RPE is intentionally lower — lots of muscle damage, don\'t go too heavy.' }),
      E('Snatch-Grip RDL', '2-3', 2, '8', '~6', '~6-7', '~3-4 min', ['DB RDL', 'Nordic Ham Curl'], { notes: 'Keep tension on the hamstrings — stop ~75% to lockout (stay in the bottom 3/4 of the ROM).' }),
      E('Chest-Supported Machine Row', '1-2', 3, '8-10', '~9', '10', '~2-3 min', ['Chest-Supported T-Bar Row', 'Helms Row'], { lastSetTechnique: 'Long-length Partials', notes: 'Flare elbows ~45° and squeeze your shoulder blades together hard at the top.' }),
      E('Straight-Bar Lat Prayer', '1', 3, '12-15', '~9-10', '10', '~1-2 min', ['Machine Lat Pullover', 'DB Lat Pullover'], { lastSetTechnique: 'Long-length Partials', notes: 'Lean forward for a big lat stretch at the top, then stand upright squeezing the lats at the bottom.' }),
      E('Hammer Preacher Curl', '1', 3, '10-12', '~9-10', '10', '~1-2 min', ['Fat-Grip Preacher Curl', 'Hammer Curl'], { notes: 'Targets brachialis + forearms. Squeeze the handle hard, curl ~3/4 of the way up.' }),
      E('Lying Paused Rope Face Pull', '1', 3, '10-12', '~9-10', '10', '~1-2 min', ['Bent-Over Rope Face Pull', 'Reverse DB Flye'], { notes: 'Pause 1-2s in the squeeze of each rep. Contract the rear delts hard.' }),
    ],
  },
  {
    name: 'Push #1',
    source: PP,
    exercises: [
      E('Cuffed Behind-The-Back Lateral Raise', '1-2', 3, '10-12', '~9-10', '10', '~1-2 min', ['Cross-Body Cable Y-Raise', 'DB Lateral Raise'], { lastSetTechnique: 'Myo-reps', notes: 'Raise the cables up and out in a "Y"; connect with the middle delt fibres.' }),
      E('Low Incline Smith Machine Press', '2-3', 4, '8-10', '~8-9', '~9-10', '~2-3 min', ['Low Incline Machine Press', 'Low Incline DB Press'], { lastSetTechnique: 'Pec Static Stretch (30 sec hold)', notes: '~15° incline. 1s pause on the chest each rep, keeping tension on the pecs.' }),
      E('Pec Deck (w/ Integrated Partials)', '1', 3, '12-15', '~8-9', '10', '~1-2 min', ['Bent-Over Cable Pec Flye (w/ Integrated Partials)', 'DB Flye (w/ Integrated Partials)'], { lastSetTechnique: 'Integrated Partials (on all sets)', notes: 'Alternate one full-ROM rep then one half-ROM rep (in the stretched half) until target reps + RPE 9-10.' }),
      E('Overhead Cable Triceps Extension (Bar)', '1', 3, '8', '~9-10', '10', '~1-2 min', ['Overhead Cable Triceps Extension (Rope)', 'DB Skull Crusher'], { lastSetTechnique: 'Dropset', notes: 'Deep triceps stretch through the whole negative; 1s pause in the stretch.' }),
      E('Triceps Pressdown (Bar)', '1', 2, '8-10', '~9-10', '10', '~1-2 min', ['Triceps Pressdown (Rope)', 'Close-Grip Assisted Dip'], { lastSetTechnique: 'Dropset', notes: 'Meant to be heavy (bar, not rope). Add weight week to week with tight form.' }),
      E('Cable Crunch', '1', 3, '10-12', '~9-10', '10', '~1-2 min', ['Machine Crunch', 'Plate-Weighted Crunch'], { lastSetTechnique: 'Myo-reps', notes: 'Round your lower back as you crunch; mind-muscle connection with your abs.' }),
    ],
  },
  {
    name: 'Legs #1',
    source: PP,
    exercises: [
      E('Seated Leg Curl', '1-2', 3, '8-10', '~9', '10', '~2-3 min', ['Lying Leg Curl', 'Nordic Ham Curl'], { notes: 'Lean forward over the machine for a maximum hamstring stretch.' }),
      E('Machine Hip Adduction', '1', 3, '10-12', '~9', '10', '~1-2 min', ['Cable Hip Adduction', 'Copenhagen Hip Adduction'], { notes: 'Mind-muscle connection with the inner thighs — great for front-thigh mass.' }),
      E('Hack Squat', '2-4', 3, '4, 6, 8', '~9', '~9', '~3-5 min', ['Machine Squat', 'Front Squat'], { lastSetTechnique: 'Long-length Partials', notes: 'Reverse pyramid: set 1 = 4 reps (heaviest), then drop ~10-15% for 6 reps, then another 10-15% for 8 reps.' }),
      E('Leg Extension', '1-2', 3, '10-12', '~9', '10', '~1-2 min', ['DB Step-Up', 'Reverse Nordic'], { lastSetTechnique: 'Long-length Partials', notes: 'Use a 2-3s negative; feel the quads pull apart on the way down.' }),
      E('Leg Press Calf Press', '1', 3, '12-15', '~9-10', '10', '~1-2 min', ['Donkey Calf Raise', 'Seated Calf Raise'], { lastSetTechnique: 'Calf Static Stretch (30 sec)', notes: '1-2s pause at the bottom; roll the ankle back and forth over the balls of your feet.' }),
    ],
  },
  {
    name: 'Arms & Weak Points #1',
    source: ARM,
    note: 'Choose your weak point from the Weak Point Table, then do 1-2 exercises for it before the arm work.',
    exercises: [
      WP1,
      WP2,
      E('Bayesian Cable Curl', '1', 3, '10-12', '~9-10', '10', '~1-2 min', ['DB Incline Curl', 'DB Scott Curl'], { lastSetTechnique: 'Long-length Partials', notes: 'If you have a size imbalance, start the weaker arm and match reps on the other.' }),
      E('Seated DB French Press', '1', 3, '10', '~9-10', '10', '~1-2 min', ['EZ-Bar Skull Crusher', 'DB Skull Crusher'], { notes: 'Both palms under the DB head; deep triceps stretch at the bottom; no pause at the top.' }),
      E('Bottom-2/3 Constant Tension Preacher Curl', '1', 2, '12-15', '~9-10', '10', '~1-2 min', ['Bottom-2/3 EZ-Bar Curl', 'Spider Curl'], { notes: 'Stay in the bottom 2/3 of the curl — constant tension, no pause top or bottom.' }),
      E('Cable Triceps Kickback', '0', 2, '12-15', '~9-10', '10', '~1-2 min', ['Bench Dip', 'DB Triceps Kickback'], { notes: 'In the full squeeze your shoulder should sit back behind your torso.' }),
      E('Roman Chair Leg Raise', '0', 3, '10-20', '~9-10', '10', '~1-2 min', ['Hanging Leg Raise', 'Reverse Crunch'], { notes: 'Let the lower back round as you curl your legs up; go to RPE 9-10.' }),
    ],
  },
  {
    name: 'Pull #2 (Mid-Back Focused)',
    source: PP,
    exercises: [
      E('Super-ROM Overhand Cable Row', '1-2', 3, '10-12', '~9', '10', '~1-2 min', ['Overhand Machine Row', 'Arm-Out Single-Arm DB Row'], { notes: 'Wide grip; lean forward on the negative and extend the torso upright as you finish the row.' }),
      E('Arms-Extended 45° Hyperextension', '1', 2, '10-20', '~9', '~9-10', '~2-3 min', ['Prisoner 45° Hyperextension', 'Good Morning (Light Weight)'], { notes: 'Keep arms extended out at 45°; big burn in the mid- and lower-back.' }),
      E('Lean-Back Lat Pulldown', '1-2', 3, '10-12', '~9', '10', '~2-3 min', ['Lean-Back Medium-Grip Pulldown', 'Pull Up'], { lastSetTechnique: 'Dropset', notes: 'Lean back 15-30° to involve the mid-back; softly touch the bar to your chest and control the weight.' }),
      E('Inverse DB Zottman Curl', '1', 3, '10-12', '~9-10', '10', '~1-2 min', ['DB Curl', 'Hammer Curl'], { lastSetTechnique: 'Slow Eccentric', notes: 'Hammer-curl up, turn palms up at the top, lower with a palms-up grip.' }),
      E('Cable Reverse Flye (Mechanical Dropset)', '0', 3, '5,4,3+', '~9-10', '10', '~1-2 min', ['Bent-Over Reverse Pec Deck', 'Reverse DB Flye'], { lastSetTechnique: 'Mechanical Dropset (on all sets)', notes: '5 reps, step forward and do 4, step forward again and do 3+ (to RPE 9-10), no rest between.' }),
      E('Cable Paused Shrug-In', '1', 3, '10-12', '~9-10', '10', '~1-2 min', ['Machine Shrug', 'DB Shrug'], { notes: 'Shrug up and in ("up to your ears"); 1-2s pause at the top and again in the stretch.' }),
    ],
  },
  {
    name: 'Push #2',
    source: PP,
    exercises: [
      E('Machine Shoulder Press', '2-3', 3, '10-12', '~9', '10', '~1-2 min', ['Cable Shoulder Press', 'Seated DB Shoulder Press'], { lastSetTechnique: 'Dropset', notes: 'Break at least 90° at the elbow; smooth, controlled reps with a delt connection.' }),
      E('Cross-Body Cable Y-Raise', '1', 3, '10-12', '~9', '10', '~2-3 min', ['Machine Lateral Raise', 'DB Lateral Raise'], { notes: 'Think "draw a sword" — sweep the arm up, out and across the body.' }),
      E('Paused Assisted Dip', '2', 3, '8-10', '~8-9', '10', '~2-3 min', ['Decline Machine Chest Press', 'Decline Barbell Press'], { notes: 'Slow 2-3s negative, 1-2s pause at the bottom, deep pec stretch, explode up with control.' }),
      E('Low-Incline Dumbbell Flye', '1', 2, '15-20', '~9', '10', '~2-3 min', ['Low-To-High Cable Crossover', 'Pec Deck'], { lastSetTechnique: 'Long-length Partials', notes: 'Stay in the bottom ~3/4 of the ROM where the dumbbells load the stretch.' }),
      E('Katana Triceps Extension', '1', 3, '10-12', '~9-10', '10', '~2-3 min', ['Overhead Cable Triceps Extension (Rope)', 'DB French Press'], { notes: 'Flare elbows ~45° and keep them locked in place through the extension.' }),
      E('Ab Wheel Rollout', '0', 3, '10-20', '~9', '~9-10', '~1-2 min', ['Swiss Ball Rollout', 'LLPT Plank'], { notes: 'Control out and pull back up; progressively increase ROM week to week.' }),
    ],
  },
  {
    name: 'Legs #2',
    source: PP,
    exercises: [
      E('Lying Leg Curl', '1-2', 3, '8-10', '~9', '10', '~1-2 min', ['Seated Leg Curl', 'Nordic Ham Curl'], { lastSetTechnique: 'Long-length Partials', notes: 'Set up for the biggest bottom stretch; keep your butt from popping up as you curl.' }),
      E('Leg Press', '2-4', 3, '8', '~8-9', '~8-9', '~1-2 min', ['Belt Squat', 'High-Bar Back Squat'], { notes: 'Control the negative with a slight pause at the bottom; add a little weight weekly.' }),
      E('Smith Machine Lunge', '2-3', 2, '8', '~8-9', '~9-10', '~3-4 min', ['Barbell Lunge', 'DB Step Up'], { notes: '2 sets each leg; minimise the back leg; mind-muscle connection with the glutes.' }),
      E('A1: Machine Hip Adduction', '1', 3, '10-12', '~9-10', '10', '~0.5-1 min', ['Cable Hip Adduction', 'Copenhagen Hip Adduction'], { notes: 'Superset A1 with the sissy squat. MMC with the inner thighs.' }),
      E('A2: Sissy Squat', '1', 3, '10-12', '~7-8', '~7-8', '~0.5-1 min', ['Leg Extension', 'Goblet Squat'], { notes: 'Superset A2. Awkward at first but underrated for the quads — stick with them.' }),
      E('Standing Calf Raise', '1', 3, '10-12', '~9-10', '10', '~1-2 min', ['Leg Press Calf Press', 'Donkey Calf Raise'], { lastSetTechnique: 'Calf Static Stretch (30 sec hold)', notes: '1-2s pause at the bottom; roll through the balls of your feet.' }),
    ],
  },
  {
    name: 'Arms & Weak Points #2',
    source: ARM,
    note: 'Choose your weak point from the Weak Point Table, then do 1-2 exercises for it before the arm work.',
    exercises: [
      WP1,
      WP2,
      E('Cable Skull Crusher', '1', 3, '10-12', '~8-9', '10', '~1-2 min', ['EZ-Bar Skull Crusher', 'DB Skull Crusher'], { notes: 'Let the cable travel back behind your head for max stretch; finish with elbows ~eye level.' }),
      E('Kneeling Overhead Cable Curl', '1', 3, '10-12', '~9-10', '10', '~1-2 min', ['Overhead Cable Curl', 'Spider Curl'], { notes: 'Arm straight out to the side; tight squeeze at the top of each rep.' }),
      E('Triceps Diverging Pressdown (Long Rope or 2 Ropes)', '1', 2, '12-15', '~9-10', '10', '~1-2 min', ['Cable Triceps Kickback', 'DB Triceps Kickback'], { notes: 'Lean slightly forward, flare elbows out, big squeeze at the bottom.' }),
      E('Incline DB Stretch-Curl', '1', 2, '12-15', '~9-10', '10', '~1-2 min', ['DB Incline Curl', 'Bayesian Cable Curl'], { notes: 'Upper back planted; rotate the arms out for a massive biceps stretch — go light and feel it.' }),
      E('Cable Crunch', '1', 3, '10-12', '~9-10', '10', '~1-2 min', ['Machine Crunch', 'Plate-Weighted Crunch'], { notes: 'Round the lower back as you crunch; mind-muscle connection with your abs.' }),
    ],
  },
];

// ────────────────────────────── BLOCK 2 (Novelty) ──────────────────────────────
const BLOCK2: DayT[] = [
  {
    name: 'Pull #1 (Lat Focused)',
    source: PP,
    exercises: [
      E('Lat-Focused Cable Row', '1', 3, '10-12', '~9', '10', '~2-3 min', ['Half-Kneeling 1-Arm Lat Pulldown', 'Elbows-In 1-Arm DB Row'], { lastSetTechnique: 'Lat Static Stretch (30 sec hold)', notes: 'Lock the torso (no leaning); drive elbows down and back, tucked to your sides.' }),
      E('Paused Barbell RDL', '2-3', 2, '8', '~6-7', '~7-8', '~3-4 min', ['Paused DB RDL', 'Glute-Ham Raise'], { notes: '1s pause at the bottom; stay in the bottom 3/4 of the ROM (~75% to lockout).' }),
      E('Chest-Supported T-Bar Row + Kelso Shrug', '2', 3, '8-10 + 4-6', '~9', '10', '~2-3 min', ['Machine Chest-Supported Row + Kelso Shrug', 'Incline Chest-Supported DB Row + Kelso Shrug'], { lastSetTechnique: 'Long-length Partials', notes: 'Do 8-10 reps as a row, then without resting do 4-6 Kelso shrugs (squeeze blades only).' }),
      E('1-Arm Lat Pull-In', '1', 2, '12-15', '~9-10', '10', '~1-2 min', ['Wide-Grip Lat Pulldown', 'Wide-Grip Band-Assisted Pull-Up'], { lastSetTechnique: 'Long-length Partials', notes: 'Mind-muscle connection with the lats; stop the biceps from taking over.' }),
      E('N1-Style Short-Head Curl', '1', 3, '10-12', '~9-10', '10', '~1-2 min', ['DB Concentration Curl', 'DB Preacher Curl'], { lastSetTechnique: 'Long-length Partials', notes: 'Brace against your knee and curl across your body toward the opposite shoulder.' }),
      E('Reverse Pec Deck (w/ Integrated Partials)', '1', 3, '10-15', '~9-10', '10', '~1-2 min', ['Reverse Cable Flye (w/ Integrated Partials)', 'Bent-Over Reverse DB Flye (w/ Integrated Partials)'], { lastSetTechnique: 'Integrated Partials (on all sets)', notes: 'Alternate full-ROM and half-ROM (stretched-half) reps; mind-muscle connection with the rear delts.' }),
    ],
  },
  {
    name: 'Push #1',
    source: PP,
    exercises: [
      E('Cuffed Behind-The-Back Lateral Raise', '1-2', 3, '10-12', '~9-10', '10', '~1-2 min', ['Cross-Body Cable Y-Raise', 'DB Lateral Raise'], { lastSetTechnique: 'Myo-reps', notes: 'Raise the cables up and out in a "Y"; connect with the middle delts.' }),
      E('Low Incline DB Press', '2-3', 3, '8-10', '~9', '10', '~2-3 min', ['Low Incline Machine Press', 'Low Incline Barbell Press'], { notes: 'Smooth reps, no pausing top or bottom — constant tension on the pecs.' }),
      E('Dual-Cable Triceps Press', '1-2', 3, '10-12', '~8-9', '10', '~2-3 min', ['Overhead Cable Triceps Extension (Bar)', 'DB Skull Crusher'], { notes: 'Cables at ~chin level; press the weight forward (straight out in front), not overhead.' }),
      E('Bent-Over Cable Pec Flye (w/ Integrated Partials)', '1', 3, '12-15', '~8-9', '10', '~1-2 min', ['Pec Deck (w/ Integrated Partials)', 'DB Flye (w/ Integrated Partials)'], { lastSetTechnique: 'Integrated Partials (on all sets)', notes: 'Lean forward until the torso is parallel; flye out and down — stretch and squeeze the pecs.' }),
      E('Deficit Pushup', '1', 1, 'AMRAP', 'N/A', '10', '~1-2 min', ['Close-Grip Push Up', 'Bodyweight Dip'], { notes: 'Slow negative with a deep stretch at the bottom before exploding up.' }),
      E('Cable Crunch', '1', 3, '10-12', '~9-10', '10', '~1-2 min', ['Machine Crunch', 'Plate-Weighted Crunch'], { lastSetTechnique: 'Myo-reps', notes: 'Round the lower back as you crunch; mind-muscle connection with your abs.' }),
    ],
  },
  {
    name: 'Legs #1',
    source: PP,
    exercises: [
      E('Seated Leg Curl', '1-2', 3, '8-10', '~9', '10', '~2-3 min', ['Lying Leg Curl', 'Nordic Ham Curl'], { notes: 'Lean forward for a maximum hamstring stretch.' }),
      E('Machine Hip Adduction', '1', 3, '10-12', '~9', '10', '~1-2 min', ['Cable Hip Adduction', 'Copenhagen Hip Adduction'], { notes: 'Mind-muscle connection with the inner thighs.' }),
      E('Smith Machine Squat', '2-4', 3, '4, 6, 8', '~9', '~9', '~3-5 min', ['Machine Squat', 'Bulgarian Split Squat'], { lastSetTechnique: 'Long-length Partials', notes: 'Reverse pyramid: set 1 = 4 reps (heaviest), drop ~10-15% for 6, then again for 8.' }),
      E('Leg Extension', '1-2', 3, '10-12', '~9', '10', '~1-2 min', ['DB Step-Up', 'Reverse Nordic'], { lastSetTechnique: 'Long-length Partials', notes: 'Use a 2-3s negative; feel the quads pull apart on the way down.' }),
      E('DB Calf Jumps', '1', 3, '12-15', '~9-10', '10', '~1-2 min', ['Leg Press Calf Jumps', 'Standing Calf Raise'], { notes: 'Slight knee bend, but drive the "jump" mostly from the calves/ankles.' }),
    ],
  },
  {
    name: 'Arms & Weak Points #1',
    source: ARM,
    note: 'Choose your weak point from the Weak Point Table, then do 1-2 exercises for it before the arm work.',
    exercises: [
      WP1,
      WP2,
      E('Slow-Eccentric EZ-Bar Skull Crusher', '1', 3, '10-12', '~9-10', '10', '~1-2 min', ['DB Slow-Eccentric Skull Crusher', 'DB French Press'], { lastSetTechnique: 'Slow Eccentric', notes: 'Use a 3-4s negative; arc the bar back behind your head and keep it behind the eye line.' }),
      E('Slow-Eccentric Bayesian Curl', '1', 3, '10-12', '~9-10', '10', '~1-2 min', ['DB Slow-Eccentric Incline Curl', 'DB Scott Curl'], { lastSetTechnique: 'Long-length Partials', notes: '3-4s negative with a slight pause at the bottom to emphasise the stretch.' }),
      E('Triceps Diverging Pressdown (Long Rope or 2 Ropes)', '1', 2, '12-15', '~9-10', '10', '~1-2 min', ['Cable Triceps Kickback', 'DB Triceps Kickback'], { notes: 'Lean slightly forward, flare elbows out, full squeeze at the bottom.' }),
      E('Reverse-Grip Cable Curl', '0', 2, '12-15', '~9-10', '10', '~1-2 min', ['Reverse-Grip EZ-Bar Curl', 'Reverse-Grip DB Curl'], { notes: 'Palms facing down — works the forearm, brachialis and biceps.' }),
      E('Roman Chair Leg Raise', '0', 3, '10-20', '~9-10', '10', '~1-2 min', ['Hanging Leg Raise', 'Reverse Crunch'], { notes: 'Let the lower back round as you curl your legs up; go to RPE 9-10.' }),
    ],
  },
  {
    name: 'Pull #2 (Mid-Back Focused)',
    source: PP,
    exercises: [
      E('Dual-Handle Lat Pulldown (Mid-Back + Lats)', '1-2', 3, '10-12', '~9', '10', '~2-3 min', ['Overhand Lat Pulldown', 'Pull-Up'], { notes: 'Lean back ~15° and drive elbows down while squeezing the shoulder blades — lats + mid-traps.' }),
      E('Arms-Extended 45° Hyperextension', '1', 2, '10-20', '~9', '~9-10', '~2-3 min', ['Prisoner 45° Hyperextension', 'Good Morning (Light Weight)'], { notes: 'Keep arms extended out at 45°; big burn in the mid- and lower-back.' }),
      E('Chest-Supported Machine Row', '1-2', 3, '8-10', '~9', '10', '~2-3 min', ['Chest-Supported T-Bar Row', 'Helms Row'], { lastSetTechnique: 'Long-length Partials', notes: 'Flare elbows ~45° and squeeze the shoulder blades together hard at the top.' }),
      E('Concentration Cable Curl', '1', 3, '10-12', '~9-10', '10', '~1-2 min', ['DB Concentration Curl', 'Preacher Curl'], { notes: 'Working elbow against your knee; strict form.' }),
      E('Rear Delt 45° Cable Flye', '1', 3, '12-15', '~9-10', '10', '~1-2 min', ['DB Rear Delt Bent-Over Swing', 'Reverse DB Flye'], { notes: 'One arm at a time, bracing with the other hand; align arm and cable at the bottom.' }),
    ],
  },
  {
    name: 'Push #2',
    source: PP,
    exercises: [
      E('Seated DB Shoulder Press', '2-3', 3, '10-12', '~9', '10', '~1-2 min', ['Seated Barbell Shoulder Press', 'Standing DB Arnold Press'], { notes: 'Slightly rotate the dumbbells in on the negative and flare the elbows as you push.' }),
      E('Cross-Body Cable Y-Raise', '1', 3, '10-12', '~9', '10', '~2-3 min', ['Machine Lateral Raise', 'DB Lateral Raise'], { lastSetTechnique: 'Myo-reps', notes: 'Think "draw a sword" — sweep up, out and across the body.' }),
      E('Decline Machine Chest Press', '2', 3, '8-10', '~8-9', '10', '~2-3 min', ['Decline Smith Machine Press', 'Decline Barbell Press'], { notes: 'Feel the pecs stretch apart on the negative; mind-muscle connection with the lower pecs.' }),
      E('Overhead Cable Triceps Extension (Bar)', '1', 2, '8-10', '~9-10', '10', '~2-3 min', ['Overhead Cable Triceps Extension (Rope)', 'DB Skull Crusher'], { lastSetTechnique: 'Dropset', notes: 'Deep triceps stretch through the negative; 1s pause in the stretch.' }),
      E('Stomach Vacuums', '0', 2, '10-15 sec hold', '~9', '~9-10', '~1-2 min', ['LLPT Plank', 'Ab Wheel Rollout'], { notes: 'Suck the stomach in and hold 10-15s; repeat 2×.' }),
      E('Super-ROM DB Lateral Raise', '1', 3, '12-15', '~9-10', '10', '~0.5-1 min', ['Upright Row', 'DB Lateral Raise'], { notes: 'Raise past parallel using the upper traps; if shoulders hurt, point thumbs up or stop at parallel.' }),
    ],
  },
  {
    name: 'Legs #2',
    source: PP,
    exercises: [
      E('Lying Leg Curl', '1-2', 3, '8-10', '~9', '10', '~1-2 min', ['Seated Leg Curl', 'Nordic Ham Curl'], { lastSetTechnique: 'Long-length Partials', notes: 'Biggest possible bottom stretch; keep the butt from popping up.' }),
      E('Smith Machine Reverse Lunge', '2-4', 3, '8', '~8-9', '~8-9', '~1-2 min', ['DB Reverse Lunge', 'Walking Lunge'], { notes: 'Step back on the negative, drive up through the front leg, minimise the back leg.' }),
      E('Leg Extension', '1-2', 4, '15-20', '~9', '10', '~3-4 min', ['Reverse Nordic', 'Sissy Squats'], { notes: 'Use a 2-3s negative; feel the quads pull apart on the way down.' }),
      E('A1: Machine Hip Adduction', '1', 3, '10-12', '~9-10', '10', 'N/A', ['Cable Hip Adduction', 'Copenhagen Hip Adduction'], { notes: 'Superset A1 with the abduction. MMC with the inner thighs.' }),
      E('A2: Machine Hip Abduction', '1', 3, '10-12', '~9-10', '10', 'N/A', ['Cable Hip Abduction', 'Band Walk'], { notes: 'Superset A2. Use pads for more ROM; lean forward to stretch the glutes further.' }),
      E('Standing Calf Raise', '1', 3, '10-12', '~9-10', '10', '~1-2 min', ['Seated Calf Raise', 'Leg Press Calf Press'], { lastSetTechnique: 'Calf Static Stretch (30 sec hold)', notes: '1-2s pause at the bottom; roll through the balls of your feet.' }),
    ],
  },
  {
    name: 'Arms & Weak Points #2',
    source: ARM,
    note: 'Choose your weak point from the Weak Point Table, then do 1-2 exercises for it before the arm work.',
    exercises: [
      WP1,
      WP2,
      E('Triceps Pressdown (Bar)', '1', 2, '10-12', '~9-10', '10', '~1-2 min', ['Triceps Pressdown (Rope)', 'Close-Grip Assisted Dip'], { lastSetTechnique: 'Myo-reps', notes: 'Heavy with a bar; add weight week to week with tight form.' }),
      E('Hammer Curl', '1', 2, '12-15', '~9-10', '10', '~1-2 min', ['Inverse DB Zottman Curl', 'Fat-Grip DB Curl'], { notes: 'Keep your hand centred on the handle (not resting on the head); liquid chalk helps grip.' }),
      E('Cable Triceps Kickback', '1', 2, '12-15', '~9-10', '10', '~1-2 min', ['DB Triceps Kickback', 'Triceps Pressdown (Rope)'], { notes: 'In the full squeeze your shoulder should sit back behind your torso.' }),
      E('Medicine Ball Russian Twists', '1', 2, '10-20', '~9-10', '10', '~1-2 min', ['Half-Kneeling Pallof Press', 'Bicycle Crunch'], { notes: 'Hold the ball out from your body; control the reps, don\'t rush.' }),
    ],
  },
];

// Deload transform: one fewer working set, RPE backed off ~1-2 points.
const deload = (e: ExT): ExT => ({ ...e, workingSets: Math.max(1, e.workingSets - 1), rpe: '~7', lastSetRpe: '~8' });

function buildWeek(days: DayT[], n: number, phase: string, isDeload: boolean): WeekPlan {
  return {
    id: `pbw${n}`,
    name: `Week ${n} · ${phase}`,
    days: days.map((d, di) => ({
      id: `pbw${n}d${di + 1}`,
      name: d.name,
      source: d.source,
      note: d.note,
      exercises: d.exercises.map((e, ei) => {
        const base = isDeload && e.weakPointSlot == null ? deload(e) : e;
        return { id: `pbw${n}d${di + 1}e${ei + 1}`, ...base };
      }),
    })),
  };
}

// The Weak Point Table — pick the muscle you want to bring up; the two Arms-day
// weak-point slots offer its Exercise 1 (primary/loaded) and Exercise 2
// (isolation/finisher) options. Transcribed from the program's published table;
// tweak any row freely — this constant is the single source the picker reads.
const WEAK_POINT_TABLE: WeakPointGroup[] = [
  {
    muscle: 'Upper chest',
    volumeKey: 'chest',
    exercise1: ['Low-Incline DB Press', 'Incline Barbell Press', 'Incline Machine Press'],
    exercise2: ['Low-to-High Cable Flye', 'Incline Cable Flye'],
  },
  {
    muscle: 'Chest (overall)',
    volumeKey: 'chest',
    exercise1: ['Machine Chest Press', 'DB Bench Press'],
    exercise2: ['Pec Deck', 'Cable Crossover'],
  },
  {
    muscle: 'Side delts',
    volumeKey: 'shoulders',
    exercise1: ['DB Lateral Raise', 'Cable Lateral Raise'],
    exercise2: ['Machine Lateral Raise', 'Lean-Away Cable Lateral Raise'],
  },
  {
    muscle: 'Rear delts',
    volumeKey: 'shoulders',
    exercise1: ['Reverse Pec Deck', 'Rear Delt Cable Flye'],
    exercise2: ['Face Pull', 'Bent-Over Rear Delt Flye'],
  },
  {
    muscle: 'Lats (width)',
    volumeKey: 'back',
    exercise1: ['Wide-Grip Lat Pulldown', 'Neutral-Grip Pulldown', 'Weighted Pull-Up'],
    exercise2: ['Straight-Arm Cable Pulldown', 'Rope Lat Pullover'],
  },
  {
    muscle: 'Mid-back (thickness)',
    volumeKey: 'back',
    exercise1: ['Chest-Supported Row', 'Seated Cable Row'],
    exercise2: ['Single-Arm DB Row', 'Machine High Row'],
  },
  {
    muscle: 'Traps',
    volumeKey: 'traps',
    exercise1: ['Barbell Shrug', 'DB Shrug'],
    exercise2: ['Cable Shrug', 'Trap Bar Shrug'],
  },
  {
    muscle: 'Biceps',
    volumeKey: 'biceps',
    exercise1: ['EZ-Bar Curl', 'DB Curl'],
    exercise2: ['Preacher Curl', 'Incline DB Curl', 'Hammer Curl'],
  },
  {
    muscle: 'Triceps',
    volumeKey: 'triceps',
    exercise1: ['Skull Crusher', 'Close-Grip Bench Press'],
    exercise2: ['Cable Pressdown', 'Overhead Cable Triceps Extension'],
  },
  {
    muscle: 'Forearms',
    volumeKey: 'forearms',
    exercise1: ['Barbell Wrist Curl', 'DB Wrist Curl'],
    exercise2: ['Reverse Curl', 'Wrist Roller'],
  },
  {
    muscle: 'Quads',
    volumeKey: 'quads',
    exercise1: ['Leg Press', 'Hack Squat'],
    exercise2: ['Leg Extension', 'Sissy Squat'],
  },
  {
    muscle: 'Hamstrings',
    volumeKey: 'hamstrings',
    exercise1: ['Romanian Deadlift', 'Seated Leg Curl'],
    exercise2: ['Lying Leg Curl', 'Nordic Ham Curl'],
  },
  {
    muscle: 'Glutes',
    volumeKey: 'glutes',
    exercise1: ['Barbell Hip Thrust', 'Bulgarian Split Squat'],
    exercise2: ['Cable Glute Kickback', 'Machine Hip Thrust'],
  },
  {
    muscle: 'Calves',
    volumeKey: 'calves',
    exercise1: ['Standing Calf Raise', 'Smith Machine Calf Raise'],
    exercise2: ['Seated Calf Raise', 'Leg Press Calf Raise'],
  },
  {
    muscle: 'Abs',
    volumeKey: 'abs',
    exercise1: ['Cable Crunch', 'Hanging Leg Raise'],
    exercise2: ['Ab Wheel Rollout', 'Weighted Plank'],
  },
];

export const PURE_BODYBUILDING_PROGRAM: WorkoutProgram = {
  name: 'The Pure Bodybuilding Program',
  unit: 'kg',
  weeks: [
    buildWeek(BLOCK1, 1, 'Build', false),
    buildWeek(BLOCK1, 2, 'Build', false),
    buildWeek(BLOCK1, 3, 'Build', false),
    buildWeek(BLOCK1, 4, 'Build', false),
    buildWeek(BLOCK1, 5, 'Deload', true),
    buildWeek(BLOCK2, 6, 'Novelty', false),
    buildWeek(BLOCK2, 7, 'Novelty', false),
    buildWeek(BLOCK2, 8, 'Novelty', false),
    buildWeek(BLOCK2, 9, 'Novelty', false),
    buildWeek(BLOCK2, 10, 'Deload', true),
  ],
  custom: [],
  weakPoints: WEAK_POINT_TABLE,
};

/** Backfill the Weak Point Table onto an already-persisted/synced copy of this
 *  program (older loads stored `weakPoints: []`, and the store persists the
 *  whole program object — so new plan data never reaches existing users
 *  without this). */
export function withWeakPoints(program: WorkoutProgram): WorkoutProgram {
  if (program.name === PURE_BODYBUILDING_PROGRAM.name && !(program.weakPoints && program.weakPoints.length)) {
    return { ...program, weakPoints: WEAK_POINT_TABLE };
  }
  return program;
}
