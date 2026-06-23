// Afterburn AI coach (BYOK Gemini). Grounds the model on the user's REAL logged
// training + bodyweight + computed nutrition targets, plus the evidence-based
// methodology distilled from the user's guides (NOT fine-tuned — context every
// call). Reuses the shared streamGemini helper + the same local Gemini key.
import { streamGemini } from '../lib/aicoach';
import { completionMap, dayCompletionKey, exerciseProgress, loggedExerciseNames } from './store';
import { computeTargets, weightTrendKgPerWeek, GOALS } from './nutrition';
import type { NutritionProfile } from './nutrition';
import type { BodyEntry, WorkoutProgram, WorkoutSession } from './types';

const SYSTEM_PROMPT = `You are the strength & nutrition coach inside "Afterburn". You are given the user's REAL logged training, bodyweight and computed nutrition targets as JSON. Coach with evidence, grounded ONLY in that data + the methodology below.

Methodology (from the user's evidence-based guides — follow it):
- Maintenance calories: BMR (Mifflin–St Jeor, or Katch–McArdle when body-fat% known) × activity (1.2/1.375/1.55/1.725/1.9). ETF quick check = 22 kcal × kg × 1.3–2.2.
- Goal: fat loss = deficit (~10–25% below maintenance); lean gain = small surplus +5–10% (≈200–500 kcal); maintenance = eucaloric.
- Protein 1.6–2.2 g/kg (toward the high end when cutting); fat 20–35% of kcal (≥0.6 g/kg); carbs fill the remainder; fibre ~30 g/day; added sugar <10%.
- A 500 kcal deficit does NOT equal a fixed weight loss — metabolic adaptation means you must recalibrate from the real weekly weight trend, not the formula.
- In a deficit, resistance training + high protein preserve muscle (mTOR/AMPK); keep training volume up while cutting.

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
          projectedWeeklyKg: targets.weeklyDeltaKg,
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
