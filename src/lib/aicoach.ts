// Optional LLM-powered coach using Google Gemini's FREE tier. Brings the user's
// OWN Gemini API key (free from Google AI Studio — no payment), stored only in
// this browser and never synced. It reuses the on-device heuristic coach to
// build a grounded context, then streams a personalized briefing from Gemini.
import { safeSetItem } from './utils';
import { buildProfile, getSuggestions, getBriefing, buildDailyPlan, formatHour } from './coach';
import type { CoachState } from './coach';

const KEY_STORAGE = 'liftoff_gemini_key';
const MODEL_STORAGE = 'liftoff_ai_model';

export const AI_MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash — capable & free', short: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite — fastest & free', short: 'Gemini 2.5 Flash-Lite' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash — free', short: 'Gemini 2.0 Flash' },
] as const;

export type AiModelId = (typeof AI_MODELS)[number]['id'];
const DEFAULT_MODEL: AiModelId = 'gemini-2.5-flash';

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

export const getApiKey = (): string => read(KEY_STORAGE);
export const hasApiKey = (): boolean => Boolean(getApiKey());
export const setApiKey = (key: string): void => {
  safeSetItem(KEY_STORAGE, key.trim());
};

export const getModel = (): AiModelId => {
  const m = read(MODEL_STORAGE);
  return AI_MODELS.some((x) => x.id === m) ? (m as AiModelId) : DEFAULT_MODEL;
};
export const setModel = (id: AiModelId): void => {
  safeSetItem(MODEL_STORAGE, id);
};

/** Short, human label for the active model (e.g. "Gemini 2.5 Flash"). */
export const modelShortLabel = (): string =>
  AI_MODELS.find((m) => m.id === getModel())?.short ?? 'Gemini';

const SYSTEM_PROMPT = `You are the coach inside "Liftoff", an app that helps the user reach a career goal by a target date. You are given the user's real data as JSON.

Be a sharp, honest, encouraging coach:
- Lead with the outcome: one sentence on where they stand versus their goal.
- Then give 3 prioritized, concrete next moves. Tie EACH one to a specific task, habit, or number from the data — name it. No generic advice.
- Ground every claim in the data provided. Never invent tasks, numbers, or facts.
- Be concise and warm. Use plain text only: no markdown symbols (#, *, backticks), no tables. For the list of moves use simple "- " dashes.
- This is a one-shot briefing: do not ask the user questions or offer to do more. Respond with only the briefing — no preamble and no commentary about your process.`;

/** Compact JSON summary of the user's state, reusing the on-device coach. */
function buildContext(state: CoachState): string {
  const profile = buildProfile(state);
  const briefing = getBriefing(state);
  const plan = buildDailyPlan(state, profile);
  const today = new Date().toISOString().slice(0, 10);
  const open = state.tasks.filter((t) => t.status !== 'done');
  const overdueCount = open.filter((t) => t.dueDate && t.dueDate.slice(0, 10) < today).length;

  const ctx = {
    goal: {
      targetDate: state.targetDate.slice(0, 10),
      daysLeft: briefing.daysLeft,
      status: briefing.status,
      roadmapPercent: briefing.actualPct,
      expectedPercent: Math.round(briefing.expectedPct),
    },
    momentum: {
      streakDays: state.streak,
      tasksPerDay: Number(profile.tasksPerDay.toFixed(1)),
      peakHours: profile.peakHours.map(formatHour),
      avgFocusMin: profile.avgSessionMins,
      tasksThisWeek: profile.trend.tasksThisWeek,
      tasksLastWeek: profile.trend.tasksLastWeek,
    },
    strengths: profile.topCategories.map((c) => c.name),
    today: {
      plannedTaskCount: plan.blocks.length,
      overloaded: plan.overloaded,
      capacityMins: plan.capacityMins,
      demandMins: plan.demandMins,
    },
    overdueCount,
    openTasks: open.slice(0, 20).map((t) => ({
      title: t.title,
      status: t.status,
      priority: t.priority,
      due: t.dueDate ? t.dueDate.slice(0, 10) : null,
    })),
    activeHabits: state.habits.filter((h) => !h.archived).map((h) => h.name),
    heuristicSuggestions: getSuggestions(state, profile).map((s) => s.title),
  };
  return JSON.stringify(ctx, null, 2);
}

interface GeminiChunk {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

/**
 * Stream a coaching response from Google Gemini. Calls `onText` with each chunk.
 * Throws on missing key or API error (caller surfaces the message).
 */
export async function generateCoaching(opts: {
  state: CoachState;
  question?: string;
  onText: (chunk: string) => void;
}): Promise<void> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Add your free Google Gemini API key in Settings → AI Coach first.');

  const context = buildContext(opts.state);
  const q = opts.question?.trim();
  const userText = q
    ? `My current data:\n\n${context}\n\nMy question: ${q}`
    : `My current data:\n\n${context}\n\nGive me a short, personalized briefing: where I stand against my goal, then my top 3 priorities right now — each tied to a specific task or habit above.`;

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${getModel()}` +
    `:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
    }),
  });

  if (!res.ok || !res.body) {
    let msg = `Request failed (${res.status}).`;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      if (j.error?.message) msg = j.error.message;
    } catch {
      /* non-JSON error body */
    }
    if (res.status === 400 || res.status === 403) msg = `${msg} — check your Gemini API key.`;
    throw new Error(msg);
  }

  // Gemini streams Server-Sent Events: one `data: {json}` line per chunk.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? ''; // keep the trailing partial line
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const json = JSON.parse(data) as GeminiChunk;
        const parts = json.candidates?.[0]?.content?.parts;
        const text = Array.isArray(parts) ? parts.map((p) => p.text ?? '').join('') : '';
        if (text) opts.onText(text);
      } catch {
        /* incomplete/non-JSON event — skip */
      }
    }
  }
}
