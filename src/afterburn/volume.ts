// Afterburn "Volume IQ" — a smart, evidence-based training-volume analyzer.
//
// Total tonnage (weight×reps) is a poor lens for "am I training each muscle
// enough?" The unit that actually drives hypertrophy is HARD SETS PER MUSCLE PER
// WEEK, judged against the volume LANDMARKS popularized by Dr. Mike Israetel /
// Renaissance Periodization:
//   MV  — maintenance volume (keep what you have)
//   MEV — minimum effective volume (least that still grows the muscle)
//   MAV — maximum *adaptive* volume (the productive sweet-spot ceiling)
//   MRV — maximum *recoverable* volume (beyond this is junk / overreaching)
//
// Exercises are logged as free-text names with no muscle tag, so we classify
// each lift to the muscle(s) it trains and credit a working set 1.0 to each
// primary muscle and 0.5 to each secondary (the standard fractional-set method).
// Everything here is pure + deterministic so it's unit-testable and runs
// entirely on-device.
import type { WorkoutSession } from './types';

export type Muscle =
  | 'chest'
  | 'back'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'calves'
  | 'abs'
  | 'traps'
  | 'forearms';

export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest',
  back: 'Back',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  calves: 'Calves',
  abs: 'Abs',
  traps: 'Traps',
  forearms: 'Forearms',
};

export interface Landmark {
  mev: number; // minimum effective volume (sets/week)
  mav: number; // top of the productive/adaptive range
  mrv: number; // maximum recoverable volume
}

// Weekly-set landmarks per muscle. Mid-range published values (RP volume
// landmarks); they are population guidelines, not per-person truth, so the UI
// frames them as targets to steer by, not hard rules.
export const LANDMARKS: Record<Muscle, Landmark> = {
  chest: { mev: 10, mav: 18, mrv: 22 },
  back: { mev: 10, mav: 18, mrv: 25 },
  quads: { mev: 8, mav: 16, mrv: 20 },
  hamstrings: { mev: 6, mav: 14, mrv: 20 },
  glutes: { mev: 4, mav: 12, mrv: 16 },
  shoulders: { mev: 8, mav: 18, mrv: 26 },
  biceps: { mev: 8, mav: 16, mrv: 26 },
  triceps: { mev: 6, mav: 14, mrv: 18 },
  calves: { mev: 8, mav: 14, mrv: 20 },
  abs: { mev: 6, mav: 16, mrv: 25 },
  traps: { mev: 4, mav: 14, mrv: 26 },
  forearms: { mev: 6, mav: 12, mrv: 25 },
};

export const ALL_MUSCLES = Object.keys(LANDMARKS) as Muscle[];

interface Rule {
  kw: string[]; // any of these substrings (lowercased) matches
  primary: Muscle[];
  secondary?: Muscle[];
}

// Ordered most-specific → most-general; the FIRST matching rule wins, so e.g.
// "leg curl" is caught as hamstrings before the generic "curl" → biceps rule,
// and "upright row" / "overhead press" are caught before plain "row" / a bench.
const RULES: Rule[] = [
  // Forearms first (so "reverse curl" / "wrist curl" don't fall to biceps).
  { kw: ['wrist curl', 'reverse curl', 'forearm', 'wrist roller'], primary: ['forearms'] },
  // Hamstring isolation before the generic "curl" and the squat group.
  { kw: ['leg curl', 'lying curl', 'seated leg curl', 'hamstring curl', 'nordic'], primary: ['hamstrings'] },
  { kw: ['romanian', 'rdl', 'stiff leg', 'stiff-leg', 'stiff legged', 'good morning'], primary: ['hamstrings'], secondary: ['glutes', 'back'] },
  { kw: ['hip thrust', 'glute bridge', 'glute', 'hip-thrust'], primary: ['glutes'], secondary: ['hamstrings'] },
  { kw: ['calf', 'calve', 'soleus'], primary: ['calves'] },
  { kw: ['leg extension', 'quad extension', 'knee extension', 'sissy'], primary: ['quads'] },
  { kw: ['squat', 'leg press', 'hack', 'lunge', 'split squat', 'bulgarian', 'step up', 'step-up', 'pendulum'], primary: ['quads'], secondary: ['glutes'] },
  { kw: ['deadlift', 'dead lift'], primary: ['back'], secondary: ['hamstrings', 'glutes'] },
  { kw: ['shrug'], primary: ['traps'] },
  { kw: ['upright row'], primary: ['shoulders'], secondary: ['traps'] },
  { kw: ['face pull', 'rear delt', 'reverse fly', 'rear fly', 'reverse pec', 'rear-delt'], primary: ['shoulders'], secondary: ['traps'] },
  { kw: ['pullover'], primary: ['back'], secondary: ['chest'] },
  { kw: ['pulldown', 'pull down', 'pull-down', 'pull up', 'pull-up', 'pullup', 'chin up', 'chin-up', 'chinup', 'lat pull'], primary: ['back'], secondary: ['biceps'] },
  { kw: ['row'], primary: ['back'], secondary: ['biceps'] },
  { kw: ['lateral raise', 'lat raise', 'side raise', 'side lateral', 'lateral'], primary: ['shoulders'] },
  { kw: ['overhead press', 'shoulder press', 'military', 'arnold', 'push press', 'ohp', 'db press', 'z press'], primary: ['shoulders'], secondary: ['triceps'] },
  // Triceps before chest so "close grip bench" / pressdowns aren't read as chest.
  { kw: ['tricep', 'pushdown', 'pressdown', 'skull', 'kickback', 'jm press', 'close grip', 'close-grip', 'overhead extension', 'french press', 'dip machine'], primary: ['triceps'] },
  { kw: ['fly', 'pec deck', 'pec fly', 'cable crossover', 'chest fly'], primary: ['chest'] },
  { kw: ['incline'], primary: ['chest'], secondary: ['shoulders', 'triceps'] },
  { kw: ['bench', 'chest press', 'chest', 'pec', 'dip', 'push up', 'push-up', 'pushup'], primary: ['chest'], secondary: ['triceps', 'shoulders'] },
  // Biceps last among the arm rules (generic "curl" only reaches here once leg/
  // wrist/reverse curls are excluded above).
  { kw: ['bicep', 'preacher', 'hammer', 'concentration', 'curl'], primary: ['biceps'], secondary: ['forearms'] },
  { kw: ['crunch', 'sit up', 'sit-up', 'situp', 'plank', 'leg raise', 'hanging', 'ab wheel', 'ab-wheel', 'woodchop', 'russian twist', 'oblique', 'toes to bar', 'knee raise', 'cable crunch'], primary: ['abs'] },
];

/** Classify a logged exercise name to the muscle(s) it trains, or null if we
 *  can't recognize it (surfaced so the user knows what isn't being counted). */
export function classifyExercise(name: string): { primary: Muscle[]; secondary: Muscle[] } | null {
  const n = name.toLowerCase();
  for (const r of RULES) {
    if (r.kw.some((k) => n.includes(k))) return { primary: r.primary, secondary: r.secondary ?? [] };
  }
  return null;
}

/** A logged set counts as a "hard set" if it was actually performed — it has a
 *  rep count, or was explicitly marked done (covers bodyweight work with no
 *  weight, e.g. pull-ups / planks). */
function isHardSet(reps: string, done: boolean): boolean {
  const r = parseInt(reps, 10);
  return (Number.isFinite(r) && r > 0) || done;
}

const mondayStartISO = (iso: string): string | null => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back up to Monday
  return d.toISOString();
};

const emptySets = (): Record<Muscle, number> =>
  ALL_MUSCLES.reduce((acc, m) => ((acc[m] = 0), acc), {} as Record<Muscle, number>);

export interface MuscleWeek {
  weekStart: string;
  sets: Record<Muscle, number>;
}

/** Hard sets per muscle per calendar week (Monday-start), oldest→newest. Each
 *  working set credits 1.0 to every primary muscle and 0.5 to every secondary. */
export function muscleSetsByWeek(sessions: WorkoutSession[]): MuscleWeek[] {
  const byWeek = new Map<string, Record<Muscle, number>>();
  for (const s of sessions) {
    const key = mondayStartISO(s.completedAt ?? s.date);
    if (!key) continue;
    let acc = byWeek.get(key);
    if (!acc) {
      acc = emptySets();
      byWeek.set(key, acc);
    }
    for (const e of s.entries) {
      const cls = classifyExercise(e.name);
      if (!cls) continue;
      const hard = e.sets.reduce((n, st) => n + (isHardSet(st.reps, st.done) ? 1 : 0), 0);
      if (hard === 0) continue;
      for (const m of cls.primary) acc[m] += hard;
      for (const m of cls.secondary) acc[m] += hard * 0.5;
    }
  }
  return [...byWeek.entries()]
    .map(([weekStart, sets]) => ({ weekStart, sets }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

export type VolumeStatus = 'untrained' | 'below' | 'optimal' | 'high' | 'excessive';

export interface MuscleAnalysis {
  muscle: Muscle;
  label: string;
  /** Hard sets normalised to a 7-day rate — the basis the landmarks use. */
  sets: number;
  /** What was actually logged in the window, before normalising. */
  rawSets: number;
  prevSets: number; // the prior window, on the same 7-day basis
  dir: 'up' | 'down' | 'flat';
  landmark: Landmark;
  status: VolumeStatus;
  suggestedSets: number; // a smart target for next week
  recommendation: string; // plain-language coaching
}

export interface VolumeReport {
  hasData: boolean;
  weekStart: string | null;
  weeksLogged: number;
  /** Length of the window the sets were counted over, in days. */
  windowDays: number;
  muscles: MuscleAnalysis[]; // sorted most-actionable first
  trained: MuscleAnalysis[]; // muscles with sets > 0 in the last 7 days (the bars to show)
  neglected: Muscle[]; // landmark muscles with 0 sets in the last 7 days
  headline: string;
  unclassified: string[]; // distinct logged names we couldn't map to a muscle
  windowLabel: string; // "Week 2 · Build" (program week) or "last 7 days"
}

const round5 = (n: number) => Math.round(n * 2) / 2;

// Ranking so the most useful advice floats to the top of the list/UI.
const SEVERITY: Record<VolumeStatus, number> = { excessive: 0, below: 1, untrained: 2, high: 3, optimal: 4 };

function judge(sets: number, lm: Landmark): { status: VolumeStatus; suggestedSets: number; recommendation: string } {
  if (sets <= 0)
    return {
      status: 'untrained',
      suggestedSets: lm.mev,
      recommendation: `Not trained this week. If it's a target, start around ${lm.mev} sets/wk (its minimum effective volume).`,
    };
  if (sets < lm.mev) {
    const add = Math.max(1, Math.round(lm.mev - sets));
    return {
      status: 'below',
      suggestedSets: lm.mev,
      recommendation: `Below MEV (${lm.mev}). Add ~${add} set${add > 1 ? 's' : ''}/wk to actually drive growth.`,
    };
  }
  if (sets <= lm.mav) {
    const target = Math.min(lm.mav, round5(sets + 2));
    return {
      status: 'optimal',
      suggestedSets: target,
      recommendation: `In the productive zone (${lm.mev}–${lm.mav}). If recovery's good, push toward ${target} sets next week.`,
    };
  }
  if (sets <= lm.mrv)
    return {
      status: 'high',
      suggestedSets: round5(sets),
      recommendation: `Near your max recoverable (${lm.mrv}). Hold here, watch recovery, and plan a deload soon.`,
    };
  return {
    status: 'excessive',
    suggestedSets: lm.mav,
    recommendation: `Over MRV (${lm.mrv}) — likely junk volume / overreaching. Cut back to ~${lm.mav} sets.`,
  };
}

const DAY_MS = 86_400_000;

/**
 * How long one of this lifter's microcycles actually takes, in calendar days.
 *
 * The volume landmarks are published as sets per SEVEN days, but a program
 * "week" is not a calendar week: Pure Bodybuilding runs eight training days,
 * which with rest days lands around ten or eleven. Counting a whole microcycle
 * and holding it against a 7-day ceiling overstates volume by roughly half —
 * enough to report "over MRV" and advise cutting sets while the true rate sits
 * mid-range. So the window is measured from the lifter's own completed cycles.
 *
 * Median rather than mean, so one cycle interrupted by illness or travel does
 * not stretch the estimate. Clamped to a sane band, and falls back to 7 when
 * there is no tagged history to learn from.
 */
export function microcycleDays(sessions: WorkoutSession[]): number {
  const byWeek = new Map<string, number[]>();
  for (const s of sessions) {
    if (!s.weekId) continue;
    const t = Date.parse(s.completedAt ?? s.date);
    if (Number.isNaN(t)) continue;
    byWeek.set(s.weekId, [...(byWeek.get(s.weekId) ?? []), t]);
  }
  // A cycle's span is first session to last, plus the day the last one sits on.
  const spans = [...byWeek.values()]
    .filter((ts) => ts.length > 1)
    .map((ts) => Math.round((Math.max(...ts) - Math.min(...ts)) / DAY_MS) + 1)
    .sort((a, b) => a - b);
  if (!spans.length) return 7;
  const mid = spans[Math.floor(spans.length / 2)];
  return Math.min(21, Math.max(5, mid));
}

/** Hard sets per muscle for sessions in the (startMs, endMs] window. */
function setsInRange(sessions: WorkoutSession[], startMs: number, endMs: number): Record<Muscle, number> {
  const acc = emptySets();
  for (const s of sessions) {
    const t = Date.parse(s.completedAt ?? s.date);
    if (Number.isNaN(t) || t <= startMs || t > endMs) continue;
    for (const e of s.entries) {
      const cls = classifyExercise(e.name);
      if (!cls) continue;
      const hard = e.sets.reduce((n, st) => n + (isHardSet(st.reps, st.done) ? 1 : 0), 0);
      if (hard === 0) continue;
      for (const m of cls.primary) acc[m] += hard;
      for (const m of cls.secondary) acc[m] += hard * 0.5;
    }
  }
  return acc;
}

/** Analyze recent training against the volume landmarks and produce per-muscle
 *  status + concrete recommendations.
 *
 *  Window choice matters: programs like the Pure Bodybuilding PPL run one
 *  "program week" (microcycle) across ~9-10 calendar days, so calendar or
 *  trailing-7-day windows would smear one microcycle's sets into the next.
 *  When the latest session is tagged with a program week (`weekId`), the
 *  current window is THAT microcycle (from its first session onward) and the
 *  comparison window is the previous microcycle — volume concludes when the
 *  program week ends and starts anew with the next. Untagged training falls
 *  back to a trailing 7-day window anchored to the latest session. */
export function analyzeVolume(sessions: WorkoutSession[]): VolumeReport {
  const stamped = sessions
    .map((s) => ({ s, t: Date.parse(s.completedAt ?? s.date) }))
    .filter((x) => !Number.isNaN(x.t))
    .sort((a, b) => b.t - a.t); // newest first
  if (stamped.length === 0) {
    return { hasData: false, weekStart: null, weeksLogged: 0, windowDays: 7, muscles: [], trained: [], neglected: [], headline: 'Log a workout to see your per-muscle volume.', unclassified: [], windowLabel: 'last 7 days' };
  }
  const anchor = stamped[0].t;
  const latestWeekId = stamped[0].s.weekId;

  let curr: Record<Muscle, number>;
  let prevW: Record<Muscle, number>;
  let prevHasData: boolean;
  let windowLabel: string;
  let windowStartMs: number;

  if (latestWeekId) {
    // Microcycle mode — current program week vs the previous one. The tally
    // still starts fresh when a new program week begins.
    const curStart = Math.min(...stamped.filter((x) => x.s.weekId === latestWeekId).map((x) => x.t));
    const prevTagged = stamped.find((x) => x.t < curStart && x.s.weekId && x.s.weekId !== latestWeekId);
    const prevStart = prevTagged
      ? Math.min(...stamped.filter((x) => x.s.weekId === prevTagged.s.weekId).map((x) => x.t))
      : null;
    curr = setsInRange(sessions, curStart - 1, anchor); // custom days logged mid-cycle count too
    prevW = prevStart != null ? setsInRange(sessions, prevStart - 1, curStart - 1) : emptySets();
    prevHasData = prevStart != null;
    windowLabel = stamped[0].s.weekName ?? 'this program week';
    windowStartMs = curStart;
  } else {
    // No program-week tagging: trailing 7 days anchored to the latest session.
    curr = setsInRange(sessions, anchor - 7 * DAY_MS, anchor);
    prevW = setsInRange(sessions, anchor - 14 * DAY_MS, anchor - 7 * DAY_MS);
    prevHasData = stamped.some((x) => x.t > anchor - 14 * DAY_MS && x.t <= anchor - 7 * DAY_MS);
    windowLabel = 'last 7 days';
    windowStartMs = anchor - 7 * DAY_MS;
  }

  // Landmarks are published as sets per SEVEN days, but a program week is not a
  // calendar week — Pure Bodybuilding runs eight training days, which with rest
  // lands nearer eleven. Holding a whole microcycle's sets against a 7-day
  // ceiling overstated volume by roughly half, enough to report "over MRV" and
  // advise cutting sets while the true rate sat mid-range.
  //
  // Divided by the cycle's own length rather than by days elapsed: a week two
  // days in has genuinely done two days of work, and dividing by two would
  // report a wild rate off a single session.
  const windowDays = latestWeekId ? microcycleDays(sessions) : 7;
  const toWeekly = (n: number) => (n * 7) / windowDays;

  const muscles: MuscleAnalysis[] = ALL_MUSCLES.map((m) => {
    const rawSets = round5(curr[m] ?? 0);
    const sets = round5(toWeekly(curr[m] ?? 0));
    const prevSets = round5(toWeekly(prevW[m] ?? 0));
    const lm = LANDMARKS[m];
    const { status, suggestedSets, recommendation } = judge(sets, lm);
    const dir: MuscleAnalysis['dir'] = !prevHasData ? 'flat' : sets > prevSets + 0.5 ? 'up' : sets < prevSets - 0.5 ? 'down' : 'flat';
    return { muscle: m, label: MUSCLE_LABEL[m], sets, rawSets, prevSets, dir, landmark: lm, status, suggestedSets, recommendation };
  });

  const sorted = [...muscles].sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status] || b.sets - a.sets || a.label.localeCompare(b.label));
  const trained = sorted.filter((m) => m.sets > 0);
  const neglected = muscles.filter((m) => m.sets === 0).map((m) => m.muscle);

  // Distinct unrecognized exercise names (so under-counting is transparent).
  const unclassified = [...new Set(sessions.flatMap((s) => s.entries.filter((e) => !classifyExercise(e.name) && e.sets.some((st) => isHardSet(st.reps, st.done))).map((e) => e.name)))].sort();

  const under = muscles.filter((m) => m.status === 'below' || m.status === 'untrained').length;
  const over = muscles.filter((m) => m.status === 'excessive').length;
  const dialed = muscles.filter((m) => m.status === 'optimal' || m.status === 'high').length;
  const parts: string[] = [];
  if (over) parts.push(`${over} over your recoverable limit`);
  if (under) parts.push(`${under} under-trained`);
  if (dialed) parts.push(`${dialed} dialed in`);
  const label = windowLabel.charAt(0).toUpperCase() + windowLabel.slice(1);
  const headline = parts.length ? `${label}: ${parts.join(', ')}.` : 'Log a full training week to read your volume.';

  return { hasData: true, weekStart: new Date(windowStartMs).toISOString(), weeksLogged: muscleSetsByWeek(sessions).length, windowDays, muscles: sorted, trained, neglected, headline, unclassified, windowLabel };
}
