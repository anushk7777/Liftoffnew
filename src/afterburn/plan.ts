// Default seeded program: Jeff Nippard Powerbuilding (Week 3, full-body) on the
// strength days, with the Arm Hypertrophy Program (Block 2 / Week 5, page 12)
// on the two arm days. 6-day cycle, kg. Mapped 1:1 from the source PDFs.
// Editable + extendable in-app; resetProgram() restores this.
import type { WorkoutProgram } from './types';

export const DEFAULT_PROGRAM: WorkoutProgram = {
  name: 'Powerbuilding W3 + Arms (6-day)',
  unit: 'kg',
  days: [
    {
      id: 'd1',
      name: 'Day 1 — Full Body 1: Squat, OHP',
      source: 'powerbuilding',
      exercises: [
        { id: 'd1e1', name: 'Back Squat (Top Set)', warmupSets: 4, workingSets: 1, reps: '8', percent1RM: '72.5-77.5%', rpe: '8.5', rest: '3-4 min', notes: 'Top set. Leave 1 (maybe 2) reps in the tank. Push it!' },
        { id: 'd1e2', name: 'Back Squat (Back-off)', warmupSets: 0, workingSets: 2, reps: '6', percent1RM: '75%', rest: '3-4 min', notes: 'Keep back angle and form consistent across all reps.' },
        { id: 'd1e3', name: 'Overhead Press', warmupSets: 2, workingSets: 3, reps: '8', percent1RM: '72.5%', rest: '2-3 min', notes: "Reset each rep (don't touch-and-press)." },
        { id: 'd1e4', name: 'Glute Ham Raise', warmupSets: 1, workingSets: 2, reps: '8-10', rpe: '7', rest: '1-2 min', notes: 'Keep your hips straight. Do Nordic ham curls if no GHR machine.' },
        { id: 'd1e5', name: 'Helms Row', warmupSets: 1, workingSets: 3, reps: '12-15', rpe: '9', rest: '1-2 min', notes: 'Strict form. Drive elbows out and back at a 45° angle.' },
        { id: 'd1e6', name: 'Hammer Curl', warmupSets: 0, workingSets: 2, reps: '20-25', rpe: '10', rest: '1-2 min', notes: 'Keep elbows locked in place, squeeze the dumbbell handle hard!' },
      ],
    },
    {
      id: 'd2',
      name: 'Day 2 — Full Body 2: Deadlift, Bench',
      source: 'powerbuilding',
      exercises: [
        { id: 'd2e1', name: 'Deadlift', warmupSets: 4, workingSets: 4, reps: '2', percent1RM: '85%', rest: '3-5 min', notes: 'Conventional or sumo: use whatever stance you are stronger with.' },
        { id: 'd2e2', name: 'Barbell Bench Press (Top Set)', warmupSets: 3, workingSets: 1, reps: '6', percent1RM: '75-80%', rpe: '8.5', rest: '4-5 min', notes: 'Top set. Leave 1 (maybe 2) reps in the tank. Push it!' },
        { id: 'd2e3', name: 'Barbell Bench Press (Back-off)', warmupSets: 0, workingSets: 2, reps: '8', percent1RM: '72.5%', rest: '2-3 min', notes: 'Quick 1 second pause on the chest on each rep.' },
        { id: 'd2e4', name: 'Hip Abduction', warmupSets: 0, workingSets: 2, reps: '15-20', rpe: '9', rest: '1-2 min', notes: 'Machine, band or weighted. 1 second isometric hold at the top of each rep.' },
        { id: 'd2e5', name: 'Weighted Pull-up', warmupSets: 1, workingSets: 3, reps: '5-8', rpe: '8', rest: '3-4 min', notes: '1.5x shoulder width grip, pull your chest to the bar.' },
        { id: 'd2e6', name: 'Floor Skull Crusher', warmupSets: 1, workingSets: 3, reps: '10-12', rpe: '8', rest: '1-2 min', notes: 'Arc the bar back behind your head, soft touch on the floor behind you.' },
        { id: 'd2e7', name: 'Standing Calf Raise', warmupSets: 1, workingSets: 3, reps: '8', rpe: '9', rest: '1-2 min', notes: '1-2 second pause at the bottom of each rep, full ROM.' },
      ],
    },
    {
      id: 'd3',
      name: 'Day 3 — Arm Day',
      source: 'arms',
      note: 'Take the last set of each exercise EXCEPT close grip bench press to failure.',
      exercises: [
        { id: 'd3e1', name: 'Close Grip Bench Press', workingSets: 4, reps: '6-8', tempo: '2.1.1.1', rpe: '8', rest: '2.0', notes: 'Shoulder width grip. Touch bar to chest with a silent pause.' },
        { id: 'd3e2', name: 'Bayesian Cable Curl', workingSets: 3, reps: '12-15', tempo: '2.0.0.0', rpe: '7', rest: '1.0', notes: 'Pre-activation. Smooth, controlled reps — get a slight pump with light weight.' },
        { id: 'd3e3', name: 'Standing EZ Bar Curl', workingSets: 4, reps: '4-6', tempo: '2.0.1.0', rpe: '9', rest: '3.0', notes: '2 sets wider grip, 2 sets closer grip. Last set to failure, 1-2 effective cheat reps at end.' },
        { id: 'd3e4', name: 'Dumbbell Preacher Hammer Curl', workingSets: 3, reps: '12-15', tempo: '2.0.0.0', rpe: '8', rest: '1.0', notes: 'Perform both arms at once, hammer grip in the middle of the dumbbell.' },
        { id: 'd3e5', name: 'Tricep Pressdown', workingSets: 4, reps: '10-12', tempo: '2.0.0.0', rpe: '9', rest: '1.0', notes: 'Bar attachment. 2 sets wide, 2 sets narrow. Keep elbows locked, minimize swinging.' },
        { id: 'd3e6', name: 'Overhead Rope Extension', workingSets: 3, reps: '12-15', tempo: '2.0.0.0', rpe: '9', rest: '1.0', notes: 'Perform both arms at once, press the rope apart at the top end ROM.' },
        { id: 'd3e7', name: 'Forearm Wrist Curl (optional)', workingSets: 3, reps: '15-20', tempo: '2.0.1.0', rpe: '9', rest: '1.0', notes: 'Optional. Perform with forearm braced on a horizontal bench.' },
      ],
    },
    {
      id: 'd4',
      name: 'Day 4 — Full Body 3: Squat, Dip',
      source: 'powerbuilding',
      exercises: [
        { id: 'd4e1', name: 'Back Squat', warmupSets: 4, workingSets: 4, reps: '4', percent1RM: '80%', rest: '3-4 min', notes: 'Maintain tight pressure in your upper back against the bar.' },
        { id: 'd4e2', name: 'Weighted Dip', warmupSets: 2, workingSets: 3, reps: '8', rpe: '8', rest: '2-3 min', notes: 'Do dumbbell floor press if no access to dip handles.' },
        { id: 'd4e3', name: 'Hanging Leg Raise', warmupSets: 0, workingSets: 3, reps: '10-12', rpe: '9', rest: '1-2 min', notes: 'Knees to chest, controlled reps. Straighten legs more to increase difficulty.' },
        { id: 'd4e4', name: 'Lat Pull-over', warmupSets: 1, workingSets: 3, reps: '12-15', rpe: '8', rest: '1-2 min', notes: 'Can use a DB, cable/rope or band. Stretch and squeeze the lats!' },
        { id: 'd4e5', name: 'Incline Dumbbell Curl', warmupSets: 1, workingSets: 2, reps: '12-15', rpe: '9', rest: '1-2 min', notes: 'One arm at a time rather than alternating. Start with your weak arm.' },
        { id: 'd4e6', name: 'Face Pull', warmupSets: 0, workingSets: 4, reps: '15-20', rpe: '9', rest: '1-2 min', notes: 'Cable/rope or band. Retract your shoulder blades as you pull.' },
      ],
    },
    {
      id: 'd5',
      name: 'Day 5 — Full Body 4: Deadlift, Bench',
      source: 'powerbuilding',
      exercises: [
        { id: 'd5e1', name: 'Pause Deadlift', warmupSets: 4, workingSets: 4, reps: '2', percent1RM: '77.5%', rest: '3-4 min', notes: '3 second pause right after the plates come off the ground.' },
        { id: 'd5e2', name: 'Pause Barbell Bench Press', warmupSets: 3, workingSets: 4, reps: '5', percent1RM: '75%', rest: '2-3 min', notes: '2-3 second pause on the chest.' },
        { id: 'd5e3', name: 'Chest-Supported T-Bar Row or Pendlay Row', warmupSets: 1, workingSets: 3, reps: '10', rpe: '7', rest: '1-2 min', notes: 'Be mindful of lower back fatigue. Stay light, minimize cheating.' },
        { id: 'd5e4', name: 'Nordic Ham Curl', warmupSets: 0, workingSets: 3, reps: '6-8', rpe: '8', rest: '1-2 min', notes: 'Bend forward at the hips during the concentric and minimize contribution from your hands.' },
        { id: 'd5e5', name: 'Dumbbell Shrug', warmupSets: 0, workingSets: 3, reps: '20-25', rpe: '9', rest: '1-2 min', notes: 'Feel a stretch on the traps at the bottom, squeeze hard at the top.' },
      ],
    },
    {
      id: 'd6',
      name: 'Day 6 — Supplemental A (Arms)',
      source: 'arms',
      note: 'Take the last set of each exercise to failure.',
      exercises: [
        { id: 'd6e1', name: 'Dumbbell Concentration Curl', workingSets: 4, reps: '8-12', tempo: '3.0.1.0', rpe: '8', rest: '2.0', notes: 'Elbow pinned against thigh, rotating grip (supinate throughout the concentric).' },
        { id: 'd6e2', name: 'Standing EZ Bar Curl', workingSets: 2, reps: '10+5+5', rpe: '9', notes: '10 reps full ROM, 5 reps top end ROM, 5 reps bottom end ROM.' },
        { id: 'd6e3', name: 'Weighted Dip', workingSets: 3, reps: '12-15', tempo: '2.0.1.0', rpe: '8', rest: '2.0', notes: 'Maintain a more upright posture and mind-muscle connection with the triceps.' },
        { id: 'd6e4', name: '1-Arm Overhead Cable Extension', workingSets: 2, reps: '15-20', tempo: '2.0.1.0', rpe: '9', rest: '1.0', notes: 'Keep your elbow locked into place and tucked in.' },
        { id: 'd6e5', name: 'Reverse Grip Forearm Wrist Curl (optional)', workingSets: 2, reps: '15-20', tempo: '2.0.1.0', rpe: '9', rest: '1.0', notes: 'Optional. Perform with forearm braced on a horizontal bench.' },
      ],
    },
  ],
};
