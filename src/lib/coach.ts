// =========================================================================
// LIFTOFF COACH — an on-device, adaptive recommendation engine.
//
// It "trains on your data" every time it runs: it re-derives a lightweight
// model from your own history (completed tasks, focus sessions, streak,
// roadmap, ideas) with recency weighting, so it adapts as you go. Every
// suggestion is explainable — it always tells you *why*. Nothing leaves the
// device and there is no external API.
// =========================================================================
import { startOfDay, differenceInCalendarDays } from 'date-fns';
import type { Phase, TodoTask, Idea, FocusSession, Habit, HabitLog } from '../store/data';
import { dayKey } from './streak';
import { isHabitDueOn } from './habits';
import { countRoadmap } from './roadmap';

export interface CoachState {
  phases: Phase[];
  tasks: TodoTask[];
  focusSessions: FocusSession[];
  ideas: Idea[];
  activityHistory: { date: string; type: string }[];
  streak: number;
  pomodoro: { focusMins: number };
  habits: Habit[];
  habitLog: HabitLog[];
  targetDate: string;
  // Explicit start anchor for pace math; falls back to inference when absent.
  journeyStart?: string;
}

// ---- Goal-drift / pace monitoring ---------------------------------------
export interface Briefing {
  status: 'ahead' | 'on-track' | 'behind' | 'idle';
  headline: string;
  detail: string;
  expectedPct: number;
  actualPct: number;
  daysLeft: number;
  weeksBehind: number;
}

// Compares how far through the timeline you are vs. how much of the roadmap is
// actually done — the heart of the "is this person on track?" monitoring.
export function getBriefing(state: CoachState, now = new Date()): Briefing {
  const roadmap = countRoadmap(state.phases);
  const target = new Date(state.targetDate);
  const daysLeft = Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 86400000));
  const actualPct = roadmap.percent;

  if (roadmap.total === 0) {
    return {
      status: 'idle',
      headline: 'Set up your roadmap',
      detail: 'Import or build a roadmap so I can track your pace to the goal.',
      expectedPct: 0,
      actualPct,
      daysLeft,
      weeksBehind: 0,
    };
  }

  // Anchor the journey start to the explicit field when set; otherwise fall
  // back to inferring it from the earliest signal we have.
  let start = state.journeyStart ? Date.parse(state.journeyStart) : Infinity;
  if (!isFinite(start)) {
    for (const t of state.tasks) if (t.createdAt) start = Math.min(start, Date.parse(t.createdAt));
    for (const a of state.activityHistory) start = Math.min(start, Date.parse(a.date));
    for (const f of state.focusSessions) start = Math.min(start, Date.parse(f.date));
  }
  if (!isFinite(start)) start = now.getTime();

  const total = target.getTime() - start;
  if (total <= 0) {
    const behind = actualPct < 100;
    return {
      status: behind ? 'behind' : 'ahead',
      headline: behind ? `Target date reached — ${actualPct}% done` : 'Goal complete',
      detail: `${actualPct}% of your roadmap is finished.`,
      expectedPct: 100,
      actualPct,
      daysLeft,
      weeksBehind: 0,
    };
  }

  const elapsed = Math.min(Math.max(now.getTime() - start, 0), total);
  const expectedPct = (elapsed / total) * 100;
  const diff = actualPct - expectedPct;
  const status: Briefing['status'] = diff >= 5 ? 'ahead' : diff >= -8 ? 'on-track' : 'behind';

  let weeksBehind = 0;
  if (status === 'behind') {
    const timeForActual = start + (actualPct / 100) * total;
    weeksBehind = Math.max(0, (now.getTime() - timeForActual) / (7 * 86400000));
  }

  const headline =
    status === 'ahead'
      ? "You're ahead of schedule"
      : status === 'on-track'
        ? "You're on track"
        : `You're ~${weeksBehind < 2 ? weeksBehind.toFixed(1) : Math.round(weeksBehind)} week${weeksBehind >= 2 ? 's' : ''} behind`;

  const detail = `${actualPct}% done vs ~${Math.round(expectedPct)}% expected by now · ${daysLeft} days to target`;

  return { status, headline, detail, expectedPct, actualPct, daysLeft, weeksBehind };
}

export interface CoachProfile {
  topCategories: { name: string; weight: number }[];
  peakHours: number[];
  hourHistogram: number[]; // 24 buckets, normalized 0..1
  tasksPerDay: number;
  avgSessionMins: number;
  totalFocusMin: number;
  dataPoints: number;
  insights: string[];
  trend: {
    tasksThisWeek: number;
    tasksLastWeek: number;
    focusThisWeekMin: number;
    focusLastWeekMin: number;
  };
}

export type CoachAction =
  | { kind: 'logDay' }
  | { kind: 'navigate'; to: string }
  | { kind: 'addRoadmap'; ref: { phaseId: string; weekId: string; taskId: string } };

export interface Suggestion {
  id: string;
  title: string;
  reason: string;
  icon: string;
  tone: 'urgent' | 'focus' | 'plan' | 'win' | 'idea';
  actionLabel: string;
  action: CoachAction;
  score: number;
}

const decay = (ageDays: number, halfLife: number) => Math.pow(0.5, ageDays / halfLife);

export function formatHour(h: number): string {
  const period = h < 12 ? 'am' : 'pm';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${period}`;
}

const titleCase = (s: string) =>
  s.length <= 3 ? s.toUpperCase() : s.charAt(0).toUpperCase() + s.slice(1);

// ---- Model: re-derived from history on every call ("autotrain") ----------
export function buildProfile(state: CoachState, now = new Date()): CoachProfile {
  const catWeights = new Map<string, number>();
  let dataPoints = 0;

  for (const t of state.tasks) {
    if (t.status !== 'done' || !t.completedAt) continue;
    dataPoints++;
    const cat = (t.category || 'general').toLowerCase();
    const age = differenceInCalendarDays(now, new Date(t.completedAt));
    catWeights.set(cat, (catWeights.get(cat) || 0) + decay(Math.max(0, age), 14));
  }
  // Roadmap completions carry a small flat signal (no timestamps available).
  for (const p of state.phases)
    for (const w of p.weeks)
      for (const t of w.tasks)
        if (t.completed) {
          const cat = t.type.toLowerCase();
          catWeights.set(cat, (catWeights.get(cat) || 0) + 0.4);
          dataPoints++;
        }

  const maxCat = Math.max(1e-6, ...catWeights.values());
  const topCategories = [...catWeights.entries()]
    .filter(([name]) => name !== 'general')
    .map(([name, weight]) => ({ name: titleCase(name), weight: weight / maxCat }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4);

  // Focus productivity by hour-of-day, recency-weighted.
  const hist = new Array(24).fill(0);
  let totalFocusMin = 0;
  let sessionCount = 0;
  for (const s of state.focusSessions) {
    if (s.kind !== 'focus') continue;
    totalFocusMin += s.durationMins;
    sessionCount++;
    dataPoints++;
    const d = new Date(s.date);
    const age = differenceInCalendarDays(now, d);
    hist[d.getHours()] += decay(Math.max(0, age), 21) * s.durationMins;
  }
  const maxHour = Math.max(1e-6, ...hist);
  const hourHistogram = hist.map((v) => v / maxHour);
  const peakHours = hist
    .map((v, h) => ({ v, h }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, 3)
    .map((x) => x.h);

  // Recent throughput.
  const weekAgo = startOfDay(new Date(now)).getTime() - 6 * 86400000;
  const recentDone = state.tasks.filter(
    (t) => t.status === 'done' && t.completedAt && new Date(t.completedAt).getTime() >= weekAgo,
  ).length;
  const tasksPerDay = recentDone / 7;
  const avgSessionMins = sessionCount ? Math.round(totalFocusMin / sessionCount) : state.pomodoro.focusMins;

  // Week-over-week trend (throughput + focus minutes).
  const dayMs = 86400000;
  const todayMs = startOfDay(new Date(now)).getTime();
  const thisWeekStart = todayMs - 6 * dayMs;
  const lastWeekStart = todayMs - 13 * dayMs;
  let tasksThisWeek = 0, tasksLastWeek = 0, focusThisWeekMin = 0, focusLastWeekMin = 0;
  for (const t of state.tasks) {
    if (t.status !== 'done' || !t.completedAt) continue;
    const c = new Date(t.completedAt).getTime();
    if (c >= thisWeekStart) tasksThisWeek++;
    else if (c >= lastWeekStart) tasksLastWeek++;
  }
  for (const s of state.focusSessions) {
    if (s.kind !== 'focus') continue;
    const d = new Date(s.date).getTime();
    if (d >= thisWeekStart) focusThisWeekMin += s.durationMins;
    else if (d >= lastWeekStart) focusLastWeekMin += s.durationMins;
  }

  const insights: string[] = [];
  if (peakHours.length)
    insights.push(`You focus best around ${formatHour(peakHours[0])}.`);
  if (topCategories.length)
    insights.push(`Your strongest area lately is ${topCategories[0].name}.`);
  insights.push(
    tasksPerDay >= 0.1
      ? `You're completing about ${tasksPerDay.toFixed(1)} tasks per day.`
      : `Complete a few tasks and the coach will start tailoring to you.`,
  );
  if (totalFocusMin > 0)
    insights.push(`Your average focus session is ${avgSessionMins} minutes.`);

  return {
    topCategories,
    peakHours,
    hourHistogram,
    tasksPerDay,
    avgSessionMins,
    totalFocusMin,
    dataPoints,
    insights,
    trend: { tasksThisWeek, tasksLastWeek, focusThisWeekMin, focusLastWeekMin },
  };
}

// ---- Daily plan: order today's work into your peak focus windows ---------
export interface PlanBlock {
  taskId: string;
  title: string;
  startHour: number; // 0..23, local
  mins: number;
}
export interface DailyPlan {
  blocks: PlanBlock[];
  scheduledMins: number; // sum of what fits in the day
  demandMins: number; // sum of all actionable work
  capacityMins: number; // your typical daily focus capacity
  overloaded: boolean;
}

// Parse a human estimate ("30m", "2h", "1.5h", "45") into minutes.
export function parseEstimateMins(s?: string): number {
  if (!s) return 0;
  let mins = 0;
  const h = s.match(/(\d+(?:\.\d+)?)\s*h/i);
  const m = s.match(/(\d+)\s*m/i);
  if (h) mins += parseFloat(h[1]) * 60;
  if (m) mins += parseInt(m[1], 10);
  if (!h && !m) {
    const n = parseFloat(s);
    if (!isNaN(n)) mins = n; // a bare number is treated as minutes
  }
  return Math.round(mins);
}

// Typical daily focus capacity: average focus minutes per active day over the
// last 14 days, floored/capped to a sensible range.
function dailyCapacityMins(state: CoachState, now: Date): number {
  const since = now.getTime() - 14 * 86400000;
  let total = 0;
  const days = new Set<string>();
  for (const s of state.focusSessions) {
    if (s.kind !== 'focus') continue;
    const d = new Date(s.date);
    if (d.getTime() < since) continue;
    total += s.durationMins;
    days.add(d.toDateString());
  }
  const avg = days.size ? total / days.size : 0;
  return Math.min(480, Math.max(120, Math.round(avg || 180)));
}

export function buildDailyPlan(state: CoachState, profile: CoachProfile, now = new Date()): DailyPlan {
  const todayStr = startOfDay(now).toISOString();
  const isOverdue = (t: TodoTask) => !!t.dueDate && t.dueDate < todayStr;
  const defaultMins = Math.max(25, state.pomodoro.focusMins);

  // Actionable today: in-progress, due today/overdue, or unscheduled high-priority.
  const candidates = state.tasks.filter(
    (t) =>
      t.status !== 'done' &&
      (t.status === 'doing' || (t.dueDate && t.dueDate <= todayStr) || (!t.dueDate && t.priority === 'high')),
  );

  candidates.sort((a, b) => {
    const doing = (b.status === 'doing' ? 1 : 0) - (a.status === 'doing' ? 1 : 0);
    if (doing) return doing;
    const od = (isOverdue(b) ? 1 : 0) - (isOverdue(a) ? 1 : 0);
    if (od) return od;
    return prio(b) - prio(a);
  });

  const capacityMins = dailyCapacityMins(state, now);
  const demandMins = candidates.reduce((s, t) => s + (parseEstimateMins(t.estimate) || defaultMins), 0);

  // Lay tasks out from the next usable hour, jumping to peak hours when possible.
  const peaks = [...profile.peakHours].sort((a, b) => a - b);
  let cursor = Math.min(Math.max(now.getHours() + 1, 8), 22);
  let scheduledMins = 0;
  const blocks: PlanBlock[] = [];
  for (const t of candidates) {
    if (cursor > 23) break; // out of hours left in the day
    const mins = parseEstimateMins(t.estimate) || defaultMins;
    if (blocks.length >= 1 && scheduledMins + mins > capacityMins) break; // keep at least one
    const peak = peaks.find((p) => p >= cursor);
    const hour = Math.min(peak ?? cursor, 23);
    blocks.push({ taskId: t.id, title: t.title, startHour: hour, mins });
    // advance strictly past this block's hour so no two blocks share an hour
    cursor = hour + Math.max(1, Math.ceil(mins / 60));
    scheduledMins += mins;
  }

  return { blocks, scheduledMins, demandMins, capacityMins, overloaded: demandMins > capacityMins };
}

function nextRoadmapTask(phases: Phase[]) {
  for (const p of phases)
    for (const w of p.weeks)
      for (const t of w.tasks)
        if (!t.completed)
          return { phaseId: p.id, weekId: w.id, taskId: t.id, title: t.title, phaseTitle: p.title, type: t.type };
  return null;
}

// ---- Ranked, explainable suggestions ------------------------------------
export function getSuggestions(state: CoachState, profile: CoachProfile, now = new Date()): Suggestion[] {
  const todayStr = startOfDay(now).toISOString();
  const hour = now.getHours();
  const loggedToday = state.activityHistory.some((l) => l.date === todayStr);
  const candidates: Suggestion[] = [];

  // 1. Protect the streak
  if (!loggedToday) {
    if (state.streak > 0) {
      candidates.push({
        id: 'streak',
        title: `Protect your ${state.streak}-day streak`,
        reason: `You haven't logged today${hour >= 18 ? " — and the day's almost over" : ''}.`,
        icon: 'flame',
        tone: 'urgent',
        actionLabel: 'Log the minimum',
        action: { kind: 'logDay' },
        score: 90 + (hour >= 18 ? 15 : 0),
      });
    } else if (state.activityHistory.length > 0) {
      candidates.push({
        id: 'streak-restart',
        title: 'Start a new streak today',
        reason: 'A short day beats a zero day.',
        icon: 'flame',
        tone: 'win',
        actionLabel: 'Log the minimum',
        action: { kind: 'logDay' },
        score: 55,
      });
    }
  }

  // 2. Overdue tasks
  const overdue = state.tasks.filter(
    (t) => t.status !== 'done' && t.dueDate && t.dueDate < todayStr,
  );
  if (overdue.length) {
    const top = [...overdue].sort((a, b) => prio(b) - prio(a))[0];
    candidates.push({
      id: 'overdue',
      title: overdue.length === 1 ? `Overdue: "${trim(top.title)}"` : `${overdue.length} tasks are overdue`,
      reason: 'Clear the highest-priority one first to stop the pile-up.',
      icon: 'clock',
      tone: 'urgent',
      actionLabel: 'Review tasks',
      action: { kind: 'navigate', to: '/tasks' },
      score: 84 + Math.min(overdue.length, 6),
    });
  }

  // 3. Resume in-progress work
  const doing = state.tasks.find((t) => t.status === 'doing');
  if (doing) {
    candidates.push({
      id: 'resume',
      title: `Resume "${trim(doing.title)}"`,
      reason: 'You left this in progress — finish what you started.',
      icon: 'play',
      tone: 'focus',
      actionLabel: 'Start a focus session',
      action: { kind: 'navigate', to: '/focus' },
      score: 78,
    });
  }

  // 4. Peak-hour focus nudge
  const lastFocus = state.focusSessions.find((s) => s.kind === 'focus');
  const hoursSinceFocus = lastFocus
    ? (now.getTime() - new Date(lastFocus.date).getTime()) / 3600000
    : Infinity;
  if (profile.peakHours.includes(hour) && hoursSinceFocus > 3) {
    candidates.push({
      id: 'peak',
      title: 'This is your peak focus window',
      reason: `You get the most done around ${formatHour(hour)}. Ride it.`,
      icon: 'timer',
      tone: 'focus',
      actionLabel: `Start ${state.pomodoro.focusMins}-min focus`,
      action: { kind: 'navigate', to: '/focus' },
      score: 72,
    });
  }

  // 4b. Goal drift — falling behind the pace to the target date
  const briefing = getBriefing(state, now);
  if (briefing.status === 'behind') {
    candidates.push({
      id: 'drift',
      title: briefing.headline,
      reason: `${briefing.detail}. Close the gap with a roadmap task today.`,
      icon: 'target',
      tone: 'urgent',
      actionLabel: 'Open roadmap',
      action: { kind: 'navigate', to: '/roadmap' },
      score: 88,
    });
  }

  // 5. Next roadmap step → add to today
  const next = nextRoadmapTask(state.phases);
  if (next) {
    const alreadyAdded = state.tasks.some(
      (t) =>
        t.sourceRoadmap?.phaseId === next.phaseId &&
        t.sourceRoadmap?.weekId === next.weekId &&
        t.sourceRoadmap?.taskId === next.taskId,
    );
    if (!alreadyAdded) {
      candidates.push({
        id: 'roadmap-next',
        title: `Next on your roadmap: "${trim(next.title)}"`,
        reason: `From ${cleanPhase(next.phaseTitle)}. Pull it into today.`,
        icon: 'target',
        tone: 'plan',
        actionLabel: 'Add to my tasks',
        action: { kind: 'addRoadmap', ref: { phaseId: next.phaseId, weekId: next.weekId, taskId: next.taskId } },
        score: 64,
      });
    }
  }

  // 6. Plan the day (nothing scheduled, and it's still early)
  const dueToday = state.tasks.filter(
    (t) => t.status !== 'done' && (!t.dueDate || t.dueDate === todayStr),
  );
  if (dueToday.length === 0 && hour < 14) {
    candidates.push({
      id: 'plan',
      title: 'Plan your day',
      reason: 'Nothing is queued for today — pick 2–3 things to win.',
      icon: 'calendar',
      tone: 'plan',
      actionLabel: 'Open tasks',
      action: { kind: 'navigate', to: '/tasks' },
      score: 60,
    });
  }

  // 6b. Habits still due today
  const todayKey = dayKey(now);
  const dueHabits = state.habits.filter((h) => !h.archived && isHabitDueOn(h, now));
  const doneHabitIds = new Set(
    state.habitLog.filter((l) => l.date === todayKey).map((l) => l.habitId),
  );
  const undoneHabits = dueHabits.filter((h) => !doneHabitIds.has(h.id));
  if (undoneHabits.length) {
    candidates.push({
      id: 'habits',
      title:
        undoneHabits.length === 1
          ? `Habit: ${trim(undoneHabits[0].name)}`
          : `${undoneHabits.length} habits left today`,
      reason: 'Consistency compounds — keep the chain alive.',
      icon: 'zap',
      tone: 'win',
      actionLabel: 'Open habits',
      action: { kind: 'navigate', to: '/habits' },
      score: 74 + (hour >= 18 ? 8 : 0),
    });
  }

  // 7. Triage captured ideas
  const inbox = state.ideas.filter((i) => !i.archived).length;
  if (inbox >= 3) {
    candidates.push({
      id: 'triage',
      title: `Triage ${inbox} captured ideas`,
      reason: 'Turn the good ones into tasks; archive the rest.',
      icon: 'idea',
      tone: 'idea',
      actionLabel: 'Open brain dump',
      action: { kind: 'navigate', to: '/brain-dump' },
      score: 48,
    });
  }

  // 7b. Overloaded day — more queued than your usual capacity
  const plan = buildDailyPlan(state, profile, now);
  if (plan.overloaded) {
    const h = (m: number) => Math.round((m / 60) * 10) / 10;
    candidates.push({
      id: 'overload',
      title: 'Today looks overloaded',
      reason: `~${h(plan.demandMins)}h queued vs your usual ~${h(plan.capacityMins)}h. Reschedule the lower-priority items.`,
      icon: 'calendar',
      tone: 'plan',
      actionLabel: 'Open schedule',
      action: { kind: 'navigate', to: '/schedule' },
      score: 70,
    });
  }

  // 7c. Stale tasks — sitting untouched for 10+ days
  const staleCut = now.getTime() - 10 * 86400000;
  const stale = state.tasks.filter(
    (t) => t.status === 'todo' && t.createdAt && new Date(t.createdAt).getTime() < staleCut,
  );
  if (stale.length) {
    const top = [...stale].sort((a, b) => prio(b) - prio(a))[0];
    candidates.push({
      id: 'stale',
      title: stale.length === 1 ? `Unblock "${trim(top.title)}"` : `${stale.length} tasks have stalled`,
      reason: 'Untouched for 10+ days — break the top one into a 25-minute step.',
      icon: 'clock',
      tone: 'plan',
      actionLabel: 'Review tasks',
      action: { kind: 'navigate', to: '/tasks' },
      score: 58,
    });
  }

  // 7d. Week-over-week trend
  const { tasksThisWeek, tasksLastWeek } = profile.trend;
  if (tasksLastWeek > 0 && tasksThisWeek < tasksLastWeek * 0.6) {
    candidates.push({
      id: 'trend-down',
      title: 'Your pace dipped this week',
      reason: `${tasksThisWeek} done vs ${tasksLastWeek} last week. One focused session turns it around.`,
      icon: 'target',
      tone: 'plan',
      actionLabel: 'Start a focus session',
      action: { kind: 'navigate', to: '/focus' },
      score: 56,
    });
  } else if (tasksLastWeek > 0 && tasksThisWeek > tasksLastWeek) {
    candidates.push({
      id: 'trend-up',
      title: `You're up ${Math.round(((tasksThisWeek - tasksLastWeek) / tasksLastWeek) * 100)}% this week`,
      reason: `${tasksThisWeek} done vs ${tasksLastWeek} last week. Keep the momentum going.`,
      icon: 'zap',
      tone: 'win',
      actionLabel: 'Open tasks',
      action: { kind: 'navigate', to: '/tasks' },
      score: 44,
    });
  }

  // 8. Play to your strength (fallback / positive nudge)
  if (profile.topCategories.length && candidates.length < 4) {
    candidates.push({
      id: 'strength',
      title: `Lean into ${profile.topCategories[0].name}`,
      reason: "It's where you have the most momentum right now.",
      icon: 'zap',
      tone: 'win',
      actionLabel: 'Open tasks',
      action: { kind: 'navigate', to: '/tasks' },
      score: 40,
    });
  }

  // Always have at least one move.
  if (candidates.length === 0) {
    candidates.push({
      id: 'fallback',
      title: 'Start a focus session',
      reason: 'Momentum beats motivation. Begin with 25 focused minutes.',
      icon: 'timer',
      tone: 'focus',
      actionLabel: 'Go to Focus',
      action: { kind: 'navigate', to: '/focus' },
      score: 30,
    });
  }

  // Dedupe by action target, sort by score.
  const seen = new Set<string>();
  return candidates
    .sort((a, b) => b.score - a.score)
    .filter((s) => {
      const key = s.action.kind === 'navigate' ? `nav:${s.action.to}` : s.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
}

const prio = (t: TodoTask) => (t.priority === 'high' ? 3 : t.priority === 'medium' ? 2 : 1);
const trim = (s: string, n = 40) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const cleanPhase = (s: string) => s.replace(/^phase\s+[a-z]\s*[—-]\s*/i, '').trim() || s;
