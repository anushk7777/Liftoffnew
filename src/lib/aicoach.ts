// Optional LLM-powered coach. Brings the user's OWN Anthropic API key (stored
// only in this browser, never synced) and asks Claude for a personalized
// briefing grounded in the same data the on-device heuristic coach uses.
// The Anthropic SDK is imported dynamically so it stays out of the main bundle
// and only loads when the user actually asks the AI coach.
import type AnthropicSDK from '@anthropic-ai/sdk';
import { safeSetItem } from './utils';
import { buildProfile, getSuggestions, getBriefing, buildDailyPlan, formatHour } from './coach';
import type { CoachState } from './coach';

const KEY_STORAGE = 'liftoff_anthropic_key';
const MODEL_STORAGE = 'liftoff_ai_model';

export const AI_MODELS = [
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 — most capable (priciest)' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — balanced' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — fastest & cheapest' },
] as const;

export type AiModelId = (typeof AI_MODELS)[number]['id'];
const DEFAULT_MODEL: AiModelId = 'claude-opus-4-8';

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

/** Short, human label for the active model (e.g. "Opus 4.8"). */
export const modelShortLabel = (): string =>
  getModel().replace('claude-', '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

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

/**
 * Stream a coaching response from Claude. Calls `onText` with each chunk.
 * Throws on missing key or API error (caller surfaces the message).
 */
export async function generateCoaching(opts: {
  state: CoachState;
  question?: string;
  onText: (chunk: string) => void;
}): Promise<void> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Add your Anthropic API key in Settings → AI Coach first.');

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client: AnthropicSDK = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const context = buildContext(opts.state);
  const q = opts.question?.trim();
  const userText = q
    ? `My current data:\n\n${context}\n\nMy question: ${q}`
    : `My current data:\n\n${context}\n\nGive me a short, personalized briefing: where I stand against my goal, then my top 3 priorities right now — each tied to a specific task or habit above.`;

  const stream = client.messages.stream({
    model: getModel(),
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userText }],
  });
  stream.on('text', (delta) => opts.onText(delta));
  await stream.finalMessage();
}
