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
export type DietStyle = 'balanced' | 'higher_carb' | 'higher_fat';

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
  cycling?: boolean; // calorie cycling (zig-zag) on training vs rest days
  trainingDays?: number; // 1–6 training days/week for cycling
  dietStyle?: DietStyle; // carb:fat ratio preference (Module 2, Lecture 11)
}

export const DEFAULT_NUTRITION: NutritionProfile = {
  sex: 'male',
  age: 25,
  heightCm: 175,
  weightKg: 75,
  activity: 'moderate',
  goal: 'maintain',
  method: 'mifflin',
  cycling: false,
  trainingDays: 4,
  dietStyle: 'balanced',
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

// Diet style sets the fat share of calories; carbs take the remainder, so a
// lower-fat style means more carbs (and vice-versa). Protein & total kcal are
// unchanged. Fat 15–30% of energy is the evidence-based band. [Lecture 11]
export const DIET_STYLES: { id: DietStyle; label: string; fatPct: number; hint: string }[] = [
  { id: 'higher_carb', label: 'Higher-carb', fatPct: 20, hint: 'Best when lean & insulin-sensitive or training high volume — carbs fuel performance.' },
  { id: 'balanced', label: 'Balanced', fatPct: 25, hint: 'A sensible default split of carbs and fat.' },
  { id: 'higher_fat', label: 'Higher-fat', fatPct: 35, hint: 'Can suit insulin resistance or a preference for fattier foods — still keeps protein fixed.' },
];

const activityOf = (a: ActivityLevel) => ACTIVITY.find((x) => x.id === a) ?? ACTIVITY[2];
const goalOf = (g: Goal) => GOALS.find((x) => x.id === g) ?? GOALS[3];
const dietStyleOf = (d: DietStyle | undefined) => DIET_STYLES.find((x) => x.id === d) ?? DIET_STYLES[1];

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

export type RateFlag = 'ideal' | 'aggressive' | 'slow' | 'none';

export interface NutritionTargets {
  method: BmrMethod;
  bmr: number;
  tdee: number;
  goalCalories: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  fiberG: number;
  recommendedMeals: number; // meals that keep each protein dose in the 25–40 g MPS band
  proteinPerMealG: number; // protein per recommended meal
  fatPerKg: number; // fat grams ÷ bodyweight
  carbPerKg: number; // carb grams ÷ bodyweight
  dietStyle: DietStyle;
  warnings: string[]; // macro-quality flags (Module 2)
  weeklyDeltaKg: number; // projected, START estimate only
  weeklyDeltaPctBW: number; // projected weekly change as % of bodyweight
  rateFlag: RateFlag; // pace guardrail (per Lecture 7)
  proteinPerKgUsed: number;
  basis: 'bodyweight' | 'lean mass';
}

/** Classify the projected weekly pace. Cuts: ideal 0.5–1.0% BW/wk, aggressive
 *  above 1.0% (muscle/strength risk), slow below 0.25%. Gains: ideal 0.25–0.5%,
 *  aggressive above 0.5% (more fat than muscle). [Lecture 7] */
export function rateFlagFor(pctBWPerWeek: number, goal: Goal): RateFlag {
  const g = goalOf(goal);
  if (g.pct < 0) {
    const loss = -pctBWPerWeek; // positive = losing
    if (loss <= 0) return 'slow';
    if (loss > 1.0) return 'aggressive';
    if (loss < 0.25) return 'slow';
    return 'ideal';
  }
  if (g.pct > 0) {
    if (pctBWPerWeek > 0.5) return 'aggressive';
    if (pctBWPerWeek < 0.1) return 'slow';
    return 'ideal';
  }
  return 'none';
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

  const style = dietStyleOf(p.dietStyle);
  const fatPct = p.fatPct ?? style.fatPct;
  const fatFloor = round(0.6 * p.weightKg); // hormonal floor
  const rawFatG = round((goalCalories * (fatPct / 100)) / 9);
  const fatFloored = rawFatG < fatFloor;
  const fatG = fatFloored ? fatFloor : rawFatG;

  const carbG = Math.max(0, round((goalCalories - proteinG * 4 - fatG * 9) / 4));
  const fiberG = round((goalCalories / 1000) * 14);
  const weeklyDeltaKg = Math.round((((goalCalories - tdee) * 7) / 7700) * 100) / 100;
  const weeklyDeltaPctBW = p.weightKg > 0 ? Math.round((weeklyDeltaKg / p.weightKg) * 1000) / 10 : 0;

  // Per-meal protein optimizer: target the 25–40 g/meal MPS window. [Lecture 8]
  const recommendedMeals = Math.min(6, Math.max(3, round(proteinG / 33)));
  const proteinPerMealG = round(proteinG / recommendedMeals);

  const per1 = (n: number) => Math.round((n / p.weightKg) * 10) / 10;
  const fatPerKg = p.weightKg > 0 ? per1(fatG) : 0;
  const carbPerKg = p.weightKg > 0 ? per1(carbG) : 0;

  // Macro-quality warnings (Module 2). Carbs expected to be low when cutting,
  // so only flag low carbs outside a deliberate deficit.
  const warnings: string[] = [];
  if (fatFloored) warnings.push('Fat held at its 0.6 g/kg floor — at this calorie level a higher-carb split would push fat too low for healthy testosterone, fat-soluble vitamin (A/D/E/K) absorption and joints.');
  if (carbPerKg < 2 && g.pct >= 0) warnings.push('Carbs are low (<2 g/kg) — can blunt thyroid output, energy and high-volume training.');
  if (proteinPerMealG > 40) warnings.push('Per-meal protein is high (>40 g) — spreading it across more meals better stimulates muscle protein synthesis.');

  return {
    method,
    bmr: round(bmr),
    tdee: round(tdee),
    goalCalories,
    proteinG,
    fatG,
    carbG,
    fiberG,
    recommendedMeals,
    proteinPerMealG,
    fatPerKg,
    carbPerKg,
    dietStyle: style.id,
    warnings,
    weeklyDeltaKg,
    weeklyDeltaPctBW,
    rateFlag: rateFlagFor(weeklyDeltaPctBW, p.goal),
    proteinPerKgUsed: proteinPerKg,
    basis,
  };
}

export interface CyclingPlan {
  trainingDays: number;
  restDays: number;
  training: { kcal: number; proteinG: number; carbG: number; fatG: number };
  rest: { kcal: number; proteinG: number; carbG: number; fatG: number };
}

/** Zig-zag the goal calories across training vs rest days while keeping the
 *  weekly average fixed. Protein + fat are held constant daily (evidence-based);
 *  carbs absorb the difference — more on training days. [Lecture 7] */
export function computeCycling(t: NutritionTargets, trainingDaysInput: number): CyclingPlan {
  const trainingDays = Math.min(6, Math.max(1, Math.round(trainingDaysInput)));
  const restDays = 7 - trainingDays;
  const weekly = t.goalCalories * 7;
  // Training days get +15%; rest days take the remainder to hold the weekly avg.
  const trainKcal = round(t.goalCalories * 1.15);
  const restKcal = restDays > 0 ? round((weekly - trainKcal * trainingDays) / restDays) : trainKcal;
  const macros = (kcal: number) => {
    const carb = Math.max(0, round((kcal - t.proteinG * 4 - t.fatG * 9) / 4));
    return { kcal, proteinG: t.proteinG, fatG: t.fatG, carbG: carb };
  };
  return { trainingDays, restDays, training: macros(trainKcal), rest: macros(restKcal) };
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

/** Average weight over the window ending `endDaysAgo` days back. Null if empty. */
export function rollingAverageKg(entries: BodyEntry[], windowDays: number, endDaysAgo = 0): number | null {
  const end = Date.now() - endDaysAgo * 86_400_000;
  const start = end - windowDays * 86_400_000;
  const ws = entries
    .map((e) => ({ t: new Date(e.date).getTime(), w: e.weight }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.w) && p.t > start && p.t <= end)
    .map((p) => p.w);
  if (ws.length === 0) return null;
  return ws.reduce((a, b) => a + b, 0) / ws.length;
}

export interface Recalibration {
  observedWeeklyKg: number;
  estMaintenanceKcal: number; // back-calculated from the trend (assumes intake ≈ target)
  suggestedKcalChange: number; // 0 when on track
  onTrack: boolean;
}

/** Compare the real weight trend to the goal target and suggest a calorie change.
 *  Uses the Lecture 4/5 protocol — current 7-day average vs the 7-day average a
 *  week earlier (falls back to the least-squares slope) — back-calculates true
 *  maintenance, and only suggests a change when the gap exceeds ~0.3% BW/wk.
 *  Assumes the user has been eating near `goalCalories`. */
export function recalibration(
  entries: BodyEntry[],
  targetWeeklyDeltaKg: number,
  goalCalories: number,
  weightKg: number,
): Recalibration | null {
  const recent = rollingAverageKg(entries, 7, 0);
  const prior = rollingAverageKg(entries, 7, 7);
  let observed: number | null;
  if (recent != null && prior != null) {
    observed = recent - prior; // kg/week
  } else {
    observed = weightTrendKgPerWeek(entries); // fallback to regression
  }
  if (observed == null) return null;

  const dailyImbalance = (observed * 7700) / 7; // kcal/day implied by the trend
  const estMaintenanceKcal = Math.round((goalCalories - dailyImbalance) / 5) * 5;
  const gapPctBW = weightKg > 0 ? (Math.abs(observed - targetWeeklyDeltaKg) / weightKg) * 100 : 0;
  const onTrack = gapPctBW <= 0.3; // Lecture 5 threshold
  const suggestedKcalChange = onTrack ? 0 : Math.round(((targetWeeklyDeltaKg - observed) * 7700) / 7 / 25) * 25;
  return { observedWeeklyKg: Math.round(observed * 100) / 100, estMaintenanceKcal, suggestedKcalChange, onTrack };
}

/** Healthy body-fat context per Lecture 3. */
export function bodyFatContext(bf: number, sex: Sex): { status: 'low' | 'healthy' | 'high'; note: string } {
  const [lo, hi] = sex === 'male' ? [15, 20] : [20, 25];
  if (bf < (sex === 'male' ? 6 : 14)) return { status: 'low', note: 'Very lean — sustainable only short-term.' };
  if (bf < lo) return { status: 'low', note: `Lean (healthy ${lo}–${hi}%) — good time to build in a slight surplus.` };
  if (bf <= hi) return { status: 'healthy', note: `Healthy range (${lo}–${hi}%).` };
  return { status: 'high', note: `Above the ${lo}–${hi}% healthy range — a fat-loss phase fits well first.` };
}
