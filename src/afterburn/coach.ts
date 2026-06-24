// Afterburn AI coach (BYOK Gemini). Grounds the model on the user's REAL logged
// training + bodyweight + computed nutrition targets, plus the evidence-based
// methodology distilled from the user's guides (NOT fine-tuned — context every
// call). Reuses the shared streamGemini helper + the same local Gemini key.
import { streamGemini } from '../lib/aicoach';
import { completionMap, dayCompletionKey, exerciseProgress, loggedExerciseNames } from './store';
import { computeTargets, computeCycling, weightTrendKgPerWeek, GOALS } from './nutrition';
import type { NutritionProfile } from './nutrition';
import type { BodyEntry, WorkoutProgram, WorkoutSession } from './types';

const SYSTEM_PROMPT = `You are the strength & nutrition coach inside "Afterburn". You are given the user's REAL logged training, bodyweight and computed nutrition targets as JSON. Coach with evidence, grounded ONLY in that data + the methodology below.

Methodology (from the user's evidence-based guides — follow it):
- Maintenance calories: BMR (Mifflin–St Jeor — the validated best predictor; or Katch–McArdle when body-fat% known) × activity (1.2/1.375/1.55/1.725/1.9). Quick check = bodyweight(lbs) × 14–18 (≈16 if unsure), which already includes activity. Prediction equations are only starting estimates (and over-estimate at high body fat); the 7-day weight trend is the source of truth — recalibrate from it. The activity multiplier is the biggest error source, since people overestimate how active they are.
- Goal: fat loss = deficit (~10–25% below maintenance); lean gain = small surplus +5–10% (≈200–500 kcal); maintenance = eucaloric.
- Protein 1.6–2.2 g/kg (toward the high end when cutting); fat 20–35% of kcal (≥0.6 g/kg); carbs fill the remainder; fibre ~30 g/day; added sugar <10%.
- A 500 kcal deficit does NOT equal a fixed weight loss — metabolic adaptation means you must recalibrate from the real weekly weight trend, not the formula. Track a 7-day rolling average; act on the trend, not daily swings (water/sodium).
- In a deficit, resistance training + high protein preserve muscle (mTOR/AMPK); keep training volume up while cutting. Muscle is preserved by adequate protein AND sufficient total calories — avoid overly aggressive deficits.
- Ideal fat-loss pace is 0.5–1.0 lb (≈0.25–1.0% BW) per week; faster (~1.1%/wk) cost athletes ~8% bench strength. For gaining, a modest +200–300 kcal surplus builds more muscle and less fat than a large one.
- Metabolic adaptation is reversible — recover maintenance with a reverse diet (+50–100 kcal/week). Calorie cycling (zig-zag: higher on training days, lower on rest days, same weekly average) is a valid strategy.
- NEAT (non-exercise activity) is a large, modifiable part of expenditure — daily steps matter. Meal timing is secondary to hitting total daily calories and protein.
- Healthy body fat ≈ 15–20% (men) / 20–25% (women); 3–4% is unsustainable. Lean → favour a slight surplus; higher → run a fat-loss phase first.

Macronutrient quality & ratio (Module 2 — use when relevant):
- For hypertrophy the macro priority is carbs → protein → fat: glucose fuels the 20–60 s work sets, so high-volume training NEEDS carbs (2–7 g/kg/day). Keto can lose fat but can't optimally build muscle.
- "High-carb vs high-fat" is individual — performance can vary up to ~4×. Lean / insulin-sensitive lifters and high-volume training do best on higher carbs; the insulin-resistant (or those who simply prefer it) can tolerate a higher-fat split. Carbs and fat trade off; protein stays fixed.
- Fat 0.5–1.5 g/kg and 15–30% of energy; never below ~0.5 g/kg — too little fat impairs testosterone, fat-soluble vitamin (A/D/E/K) absorption and joint comfort (especially in a deficit). Fat quality matters: Omega-3/PUFA improve cell-membrane fluidity and mTOR signalling (leaner gains), saturated fat supports testosterone, MCTs give quick energy.
- Protein: best in 25–40 g doses per meal to stimulate muscle protein synthesis (ceiling ~70 g); the post-workout anabolic window is wide (~24 h), so total daily protein matters more than timing. Protein has the highest thermic effect and is the most satiating macro.
- Very low carb raises cortisol (→ muscle breakdown) and can lower thyroid output and energy; the body makes glucose from protein via gluconeogenesis but that is not a reason to under-eat carbs when training hard.
- Fibre ~14 g/1000 kcal: prefer mixed sources; raw resistant starch (uncooked oats/potato) can bloat, while beta-glucan (oats/barley) helps lower cholesterol.

Style: lead with one sentence on how training + nutrition are trending. Then give 3 prioritized, concrete actions, each tied to a specific number from the data (name the lift, the week, the kcal/macro, the weight trend). Be honest and specific. Plain text only — no markdown headers or asterisks; use "- " for lists. One-shot: don't ask questions or offer more unless the user asked one.`;

export interface CoachData {
  program: WorkoutProgram;
  sessions: WorkoutSession[];
  currentWeekId: string;
  bodyweight: BodyEntry[];
  nutrition: NutritionProfile;
}

function num(s: string): number | null {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function buildContext(d: CoachData): string {
  const { program, sessions, currentWeekId, bodyweight, nutrition } = d;

  // Recent sessions (most recent 6) condensed to top set per exercise.
  const recent = sessions.slice(0, 6).map((s) => ({
    week: s.weekName ?? null,
    day: s.dayName,
    date: (s.completedAt ?? s.date).slice(0, 10),
    lifts: s.entries
      .map((e) => {
        let topW = -1;
        let rep = 0;
        for (const st of e.sets) {
          const w = num(st.weight);
          if (w != null && w > topW) {
            topW = w;
            rep = num(st.reps) ?? 0;
          }
        }
        return topW >= 0 ? `${e.name}: ${topW}${program.unit}×${rep}` : null;
      })
      .filter(Boolean),
  }));

  // Per-lift est-1RM trend (first vs latest) for the lifts they actually train.
  const trends = loggedExerciseNames(sessions)
    .slice(0, 8)
    .map((name) => {
      const series = exerciseProgress(sessions, name);
      if (series.length < 2) return null;
      const first = series[0];
      const last = series[series.length - 1];
      return `${name}: est1RM ${first.est1RM}→${last.est1RM}${program.unit} over ${series.length} sessions`;
    })
    .filter(Boolean);

  // Current-week adherence.
  const week = program.weeks.find((w) => w.id === currentWeekId) ?? program.weeks[0];
  const done = completionMap(sessions);
  const adherence = week
    ? { week: week.name, daysDone: week.days.filter((dd) => done.has(dayCompletionKey(week.id, dd.id))).length, daysTotal: week.days.length }
    : null;

  const targets = computeTargets(nutrition);
  const trend = weightTrendKgPerWeek(bodyweight);
  const goalLabel = GOALS.find((g) => g.id === nutrition.goal)?.label ?? nutrition.goal;

  const ctx = {
    program: program.name,
    adherence,
    recentSessions: recent,
    strengthTrend: trends,
    bodyweight: {
      latestKg: bodyweight[0]?.weight ?? null,
      weeklyTrendKg: trend != null ? Math.round(trend * 100) / 100 : null,
      entries: bodyweight.length,
    },
    nutrition: targets
      ? {
          goal: goalLabel,
          method: targets.method,
          maintenanceKcal: targets.tdee,
          targetKcal: targets.goalCalories,
          protein_g: targets.proteinG,
          fat_g: targets.fatG,
          carb_g: targets.carbG,
          fiber_g: targets.fiberG,
          dietStyle: targets.dietStyle,
          fat_g_per_kg: targets.fatPerKg,
          carb_g_per_kg: targets.carbPerKg,
          protein_per_meal_g: targets.proteinPerMealG,
          recommendedMeals: targets.recommendedMeals,
          macroWarnings: targets.warnings,
          projectedWeeklyKg: targets.weeklyDeltaKg,
          projectedPace: `${targets.weeklyDeltaPctBW}%BW/wk (${targets.rateFlag})`,
          bodyFatPct: nutrition.bodyFatPct ?? null,
          cycling: nutrition.cycling ? computeCycling(targets, nutrition.trainingDays ?? 4) : null,
        }
      : null,
  };
  return JSON.stringify(ctx, null, 2);
}

/** Stream evidence-based coaching for Afterburn (BYOK Gemini). */
export async function generateWorkoutCoaching(opts: {
  data: CoachData;
  question?: string;
  onText: (chunk: string) => void;
}): Promise<void> {
  const ctx = buildContext(opts.data);
  const q = opts.question?.trim();
  const user = q
    ? `My logged data:\n\n${ctx}\n\nMy question: ${q}`
    : `My logged data:\n\n${ctx}\n\nGive me a short briefing: how my training and nutrition are trending, then my top 3 improvements right now — each tied to a specific number above.`;
  await streamGemini({ system: SYSTEM_PROMPT, user, onText: opts.onText });
}
