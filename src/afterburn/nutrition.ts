// Evidence-based calorie + macro engine. Faithful to the user's guides:
//  - BMR: Mifflin–St Jeor (default), Harris–Benedict (revised), Katch–McArdle
//    (LBM-based, auto-preferred when body-fat% is known), and the ETF quick
//    estimate (22 kcal × kg). [DIY Transformation Guide pp.14-15; Basics of
//    Nutrition p.4]
//  - TDEE = BMR × activity multiplier (1.2/1.375/1.55/1.725/1.9). [DIY]
//  - Goal calories via evidence-based % of TDEE; weekly Δ uses ~7700 kcal/kg
//    but is flagged as a START estimate (Lecture 2: 500 kcal ≠ 1 lb due to
//    metabolic adaptation → recalibrate from real weight trend).
//  - Macros: protein g/kg (LBM when bf% known), fat 25% (floor 0.6 g/kg),
//    carbs = remainder, fiber 14 g / 1000 kcal. [Basics p.7; DIY pp.16-17]
import type { BodyEntry } from './types';

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very' | 'extra';
export type BmrMethod = 'mifflin' | 'harris' | 'katch' | 'etf';
export type Goal = 'aggressive_cut' | 'cut' | 'slight_cut' | 'maintain' | 'lean_gain' | 'gain';

export interface NutritionProfile {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  bodyFatPct?: number; // 0–60; enables Katch–McArdle + LBM-based macros
  activity: ActivityLevel;
  goal: Goal;
  method: BmrMethod;
  proteinPerKg?: number; // optional override
  fatPct?: number; // optional override (% of kcal)
}

export const DEFAULT_NUTRITION: NutritionProfile = {
  sex: 'male',
  age: 25,
  heightCm: 175,
  weightKg: 75,
  activity: 'moderate',
  goal: 'maintain',
  method: 'mifflin',
};

export const ACTIVITY: { id: ActivityLevel; label: string; mult: number; etf: number }[] = [
  { id: 'sedentary', label: 'Sedentary (little/no exercise)', mult: 1.2, etf: 1.45 },
  { id: 'light', label: 'Lightly active (1–3 days/wk)', mult: 1.375, etf: 1.65 },
  { id: 'moderate', label: 'Moderately active (3–5 days/wk)', mult: 1.55, etf: 1.85 },
  { id: 'very', label: 'Very active (6–7 days/wk)', mult: 1.725, etf: 2.05 },
  { id: 'extra', label: 'Extra active (hard daily / physical job)', mult: 1.9, etf: 2.15 },
];

export const GOALS: { id: Goal; label: string; pct: number; proteinPerKg: number }[] = [
  { id: 'aggressive_cut', label: 'Aggressive fat loss (−25%)', pct: -0.25, proteinPerKg: 2.2 },
  { id: 'cut', label: 'Fat loss (−15%)', pct: -0.15, proteinPerKg: 2.0 },
  { id: 'slight_cut', label: 'Slight cut (−10%)', pct: -0.1, proteinPerKg: 2.0 },
  { id: 'maintain', label: 'Maintenance', pct: 0, proteinPerKg: 1.8 },
  { id: 'lean_gain', label: 'Lean gain (+10%)', pct: 0.1, proteinPerKg: 1.8 },
  { id: 'gain', label: 'Muscle gain (+17.5%)', pct: 0.175, proteinPerKg: 1.8 },
];

const activityOf = (a: ActivityLevel) => ACTIVITY.find((x) => x.id === a) ?? ACTIVITY[2];
const goalOf = (g: Goal) => GOALS.find((x) => x.id === g) ?? GOALS[3];

export function leanBodyMassKg(p: NutritionProfile): number | null {
  if (p.bodyFatPct == null || p.bodyFatPct <= 0 || p.bodyFatPct >= 60) return null;
  return p.weightKg * (1 - p.bodyFatPct / 100);
}

/** BMR (kcal/day) for a single method. Returns null if inputs are insufficient. */
export function bmrFor(method: BmrMethod, p: NutritionProfile): number | null {
  const { sex, weightKg: kg, heightCm: cm, age } = p;
  if (kg <= 0 || cm <= 0 || age <= 0) return null;
  switch (method) {
    case 'mifflin':
      return 10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161);
    case 'harris':
      return sex === 'male'
        ? 66 + 13.7 * kg + 5 * cm - 6.8 * age
        : 655 + 9.6 * kg + 1.8 * cm - 4.7 * age;
    case 'katch': {
      const lbm = leanBodyMassKg(p);
      return lbm == null ? null : 370 + 21.6 * lbm;
    }
    case 'etf':
      return 22 * kg; // multiplied by the ETF activity factor in tdeeFor
  }
}

/** All four BMR estimates side-by-side (null when not computable). */
export function allBmr(p: NutritionProfile): Record<BmrMethod, number | null> {
  return { mifflin: bmrFor('mifflin', p), harris: bmrFor('harris', p), katch: bmrFor('katch', p), etf: bmrFor('etf', p) };
}

export function tdeeFor(method: BmrMethod, p: NutritionProfile): number | null {
  const bmr = bmrFor(method, p);
  if (bmr == null) return null;
  const a = activityOf(p.activity);
  return method === 'etf' ? bmr * a.etf : bmr * a.mult;
}

export interface NutritionTargets {
  method: BmrMethod;
  bmr: number;
  tdee: number;
  goalCalories: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  fiberG: number;
  proteinPerMeal: number; // across 4 meals
  weeklyDeltaKg: number; // projected, START estimate only
  proteinPerKgUsed: number;
  basis: 'bodyweight' | 'lean mass';
}

const round = (n: number) => Math.round(n);

/** Full target set for the chosen method + goal. Returns null if BMR unknown. */
export function computeTargets(p: NutritionProfile): NutritionTargets | null {
  const method: BmrMethod = p.method === 'katch' && leanBodyMassKg(p) == null ? 'mifflin' : p.method;
  const bmr = bmrFor(method, p);
  const tdee = tdeeFor(method, p);
  if (bmr == null || tdee == null) return null;

  const g = goalOf(p.goal);
  // Never prescribe below BMR or a 1200 kcal floor.
  const goalCalories = Math.max(round(tdee * (1 + g.pct)), round(bmr), 1200);

  const lbm = leanBodyMassKg(p);
  const proteinPerKg = p.proteinPerKg ?? g.proteinPerKg;
  const basis: 'bodyweight' | 'lean mass' = lbm != null ? 'lean mass' : 'bodyweight';
  const proteinG = round(proteinPerKg * (lbm ?? p.weightKg));

  const fatPct = p.fatPct ?? 25;
  let fatG = round((goalCalories * (fatPct / 100)) / 9);
  const fatFloor = round(0.6 * p.weightKg); // hormonal floor
  if (fatG < fatFloor) fatG = fatFloor;

  const carbG = Math.max(0, round((goalCalories - proteinG * 4 - fatG * 9) / 4));
  const fiberG = round((goalCalories / 1000) * 14);
  const weeklyDeltaKg = Math.round((((goalCalories - tdee) * 7) / 7700) * 100) / 100;

  return {
    method,
    bmr: round(bmr),
    tdee: round(tdee),
    goalCalories,
    proteinG,
    fatG,
    carbG,
    fiberG,
    proteinPerMeal: round(proteinG / 4),
    weeklyDeltaKg,
    proteinPerKgUsed: proteinPerKg,
    basis,
  };
}

/** Least-squares slope of weight (kg) over time, in kg/week, from recent entries. */
export function weightTrendKgPerWeek(entries: BodyEntry[], days = 21): number | null {
  if (entries.length < 2) return null;
  const cutoff = Date.now() - days * 86_400_000;
  const pts = entries
    .map((e) => ({ t: new Date(e.date).getTime(), w: e.weight }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.w) && p.t >= cutoff)
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2) return null;
  const spanDays = (pts[pts.length - 1].t - pts[0].t) / 86_400_000;
  if (spanDays < 4) return null; // need a few days for signal
  const n = pts.length;
  const xs = pts.map((p) => p.t / 86_400_000); // days
  const ys = pts.map((p) => p.w);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  return (num / den) * 7; // kg/day → kg/week
}

/** Suggest a calorie adjustment by comparing the real weight trend to the goal
 *  target (assumes the user is eating at goalCalories). Returns null if not enough
 *  data. Positive = eat more, negative = eat less. */
export function recalibration(
  entries: BodyEntry[],
  targetWeeklyDeltaKg: number,
): { observedWeeklyKg: number; suggestedKcalChange: number } | null {
  const observed = weightTrendKgPerWeek(entries);
  if (observed == null) return null;
  const suggestedKcalChange = Math.round(((targetWeeklyDeltaKg - observed) * 7700) / 7 / 25) * 25; // round to 25
  return { observedWeeklyKg: Math.round(observed * 100) / 100, suggestedKcalChange };
}
