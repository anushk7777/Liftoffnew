// Liftoff Focus — what the dashboard is actually for.
//
// The old dashboard answered two questions: "how much is LEFT?" (a 120-day
// countdown) and "what did you FINISH?" (a list of completed tasks that already
// lived on the Tasks page). Neither is the question you open a goal app to ask.
// It showed a receipt, not a cockpit — and its largest card said "Not started"
// to someone with nine tasks, three habits and a six-day streak, because it only
// knew how to read a roadmap.
//
// What replaced it, and the evidence behind each piece:
//
//   * TODAY — the tasks and habits actually due, in one tickable list.
//     Masicampo & Baumeister (2011, JPSP) showed unfinished goals produce
//     intrusive thoughts and measurably worse performance on unrelated tasks —
//     and that simply MAKING A SPECIFIC PLAN eliminated the effect. A concrete
//     "here is today" is that plan.
//
//   * MOMENTUM — what moved, against your own recent baseline.
//     Amabile & Kramer analysed ~12,000 daily diaries from 238 people: of every
//     event that marks a good day, making progress on meaningful work beat all
//     others. So the headline is progress made, never distance remaining.
//
//   * CONSISTENCY — a rate over a window, not a streak that resets.
//     Lally et al. (2010) tracked 96 people for 12 weeks: median 66 days to
//     automaticity (range 18-254), and critically, MISSING A SINGLE DAY DID NOT
//     ALTER THE CURVE. A counter that drops to zero after one slip tells you
//     something the data says is false, on the day you can least afford it.
//
//   * SCHEDULED TIME — an implementation intention.
//     Gollwitzer & Sheeran's meta-analysis (94 tests, ~8,000 participants) put
//     "when situation X, I will do Y" at d = 0.65 on goal attainment. The Habit
//     type has carried a `scheduledTime` field all along and nothing read it.
//
// Everything here is pure and deterministic so it can be tested without a
// browser, and every function takes `now` so tests never depend on the clock.
import { differenceInCalendarDays, startOfDay } from 'date-fns';
import type { Habit, HabitLog, TodoTask, FocusSession } from '../store/data';
import type { ActivityLog } from '../store/useStore';
import { dayKey } from '../lib/streak';
import { isHabitDueOn } from '../lib/habits';

/** One line in the Today list — a task or a habit, treated the same way. */
export interface TodayItem {
  kind: 'task' | 'habit';
  id: string;
  title: string;
  done: boolean;
  /** "HH:mm" when the item has a scheduled time; used for ordering and display. */
  at?: string;
  /** Tasks only. */
  priority?: TodoTask['priority'];
  category?: string;
  /** Days overdue; 0 when due today. Tasks only. */
  overdueBy?: number;
  emoji?: string;
}

export interface TodayPlan {
  items: TodayItem[];
  done: number;
  total: number;
  /** Overdue tasks pulled into today, counted separately so the UI can say so. */
  overdue: number;
  /** True when there is genuinely nothing scheduled — not the same as "all done". */
  empty: boolean;
}

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;
/** Minutes past midnight, or null when the value is missing or malformed.
 *  Hand-edited and imported data reaches here, so a bad string must not sort
 *  an item to the top of the day by parsing as NaN. */
export function minutesOfDay(hhmm: string | undefined): number | null {
  if (!hhmm || !HHMM.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

const PRIORITY_RANK: Record<TodoTask['priority'], number> = { high: 0, medium: 1, low: 2 };

/**
 * Everything due today, in the order you would actually do it.
 *
 * Overdue tasks are included rather than left behind on another screen: a task
 * you missed is still today's problem, and hiding it is how it stays missed.
 * They are marked, not silently merged.
 */
export function todayPlan(
  tasks: TodoTask[],
  habits: Habit[],
  habitLog: HabitLog[],
  now: Date = new Date(),
): TodayPlan {
  const today = startOfDay(now);
  const key = dayKey(now);
  const loggedToday = new Set(
    (habitLog ?? []).filter((l) => l?.date === key).map((l) => l.habitId),
  );

  const items: TodayItem[] = [];
  let overdue = 0;

  for (const t of tasks ?? []) {
    if (!t?.id) continue;
    // A task with no due date is not "today's" work — it lives on the Tasks
    // page until you schedule it. Otherwise every unscheduled idea would pile
    // into today and the list would stop meaning anything.
    if (!t.dueDate) continue;
    const due = Date.parse(t.dueDate);
    if (Number.isNaN(due)) continue;
    const diff = differenceInCalendarDays(today, startOfDay(new Date(due)));
    if (diff < 0) continue; // still in the future
    // A task finished on an earlier day has left today; one finished TODAY stays
    // visible so ticking it does not make it vanish under your finger.
    const finishedEarlier =
      t.status === 'done' && t.completedAt && dayKey(t.completedAt) !== key;
    if (finishedEarlier) continue;
    if (diff > 0 && t.status !== 'done') overdue++;
    items.push({
      kind: 'task',
      id: t.id,
      title: t.title,
      done: t.status === 'done',
      at: t.scheduledAt ? new Date(t.scheduledAt).toTimeString().slice(0, 5) : undefined,
      priority: t.priority,
      category: t.category,
      overdueBy: diff,
    });
  }

  for (const h of habits ?? []) {
    if (!h?.id || h.archived) continue;
    if (!isHabitDueOn(h, now)) continue;
    items.push({
      kind: 'habit',
      id: h.id,
      title: h.name,
      done: loggedToday.has(h.id),
      at: h.scheduledTime,
      emoji: h.emoji,
    });
  }

  // Timed items first in clock order, then untimed. Within untimed: overdue,
  // then priority, then habits, then title — so the list is stable and the
  // thing most likely to be done next is nearest the top.
  items.sort((a, b) => {
    const am = minutesOfDay(a.at);
    const bm = minutesOfDay(b.at);
    if (am != null && bm != null) return am - bm || a.title.localeCompare(b.title);
    if (am != null) return -1;
    if (bm != null) return 1;
    const ao = a.overdueBy ?? 0;
    const bo = b.overdueBy ?? 0;
    if (ao !== bo) return bo - ao;
    const ap = a.priority ? PRIORITY_RANK[a.priority] : 3;
    const bp = b.priority ? PRIORITY_RANK[b.priority] : 3;
    return ap - bp || a.title.localeCompare(b.title);
  });

  const done = items.filter((i) => i.done).length;
  return { items, done, total: items.length, overdue, empty: items.length === 0 };
}

export interface ConsistencyWindow {
  /** Newest last, one entry per day in the window. */
  days: { key: string; hit: boolean }[];
  hit: number;
  total: number;
  pct: number;
}

/**
 * How often you showed up over a fixed window.
 *
 * Deliberately NOT a streak. Lally et al. found a missed day leaves the habit
 * curve intact, so resetting a counter to zero states something false at the
 * exact moment it does the most damage. A rate over fourteen days survives a
 * bad day, still rewards showing up, and cannot be gamed by a single login.
 */
export function consistency(
  activity: ActivityLog[],
  windowDays = 14,
  now: Date = new Date(),
): ConsistencyWindow {
  const logged = new Set(
    (activity ?? []).filter((a) => a?.date).map((a) => dayKey(a.date)),
  );
  const days: ConsistencyWindow['days'] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = dayKey(d);
    days.push({ key, hit: logged.has(key) });
  }
  const hit = days.filter((d) => d.hit).length;
  return { days, hit, total: windowDays, pct: Math.round((hit / windowDays) * 100) };
}

export interface MomentumStat {
  label: string;
  value: number;
  /** The same measure over the preceding window, for comparison. */
  prev: number;
  unit: string;
  /** null when there is no prior window to compare against. */
  dir: 'up' | 'down' | 'flat' | null;
}

const inRange = (iso: string | undefined, from: number, to: number): boolean => {
  if (!iso) return false;
  const t = Date.parse(iso);
  return !Number.isNaN(t) && t >= from && t < to;
};

/**
 * What actually moved this week, against the week before it.
 *
 * The comparison is to YOUR OWN previous week, not to a target. A target you
 * set once, months ago, mostly measures how optimistic you were that day;
 * last week measures whether you are moving.
 */
export function weekMomentum(
  tasks: TodoTask[],
  focusSessions: FocusSession[],
  habitLog: HabitLog[],
  now: Date = new Date(),
): MomentumStat[] {
  const end = now.getTime();
  const weekMs = 7 * 86_400_000;
  const thisFrom = end - weekMs;
  const prevFrom = end - 2 * weekMs;

  const closed = (from: number, to: number) =>
    (tasks ?? []).filter((t) => t?.status === 'done' && inRange(t.completedAt, from, to)).length;

  const focusMins = (from: number, to: number) =>
    (focusSessions ?? [])
      .filter((s) => s?.kind === 'focus' && inRange(s.date, from, to))
      .reduce((a, s) => a + (Number(s.durationMins) || 0), 0);

  const habitHits = (from: number, to: number) =>
    (habitLog ?? []).filter((l) => {
      if (!l?.date) return false;
      // HabitLog dates are day keys (yyyy-MM-dd), not datetimes.
      const t = Date.parse(`${l.date}T12:00:00`);
      return !Number.isNaN(t) && t >= from && t < to;
    }).length;

  const dir = (v: number, p: number, hadPrev: boolean): MomentumStat['dir'] =>
    !hadPrev ? null : v > p ? 'up' : v < p ? 'down' : 'flat';

  // "Had a previous week" means there is history to compare with, not that the
  // number was non-zero — a genuine zero last week is a real comparison.
  const oldest = Math.min(
    ...[
      ...(tasks ?? []).map((t) => Date.parse(t?.createdAt ?? '')),
      ...(focusSessions ?? []).map((s) => Date.parse(s?.date ?? '')),
    ].filter((n) => !Number.isNaN(n)),
    end,
  );
  const hadPrev = oldest <= prevFrom;

  const t1 = closed(thisFrom, end);
  const t0 = closed(prevFrom, thisFrom);
  const f1 = focusMins(thisFrom, end);
  const f0 = focusMins(prevFrom, thisFrom);
  const h1 = habitHits(thisFrom, end);
  const h0 = habitHits(prevFrom, thisFrom);

  return [
    { label: 'Tasks done', value: t1, prev: t0, unit: '', dir: dir(t1, t0, hadPrev) },
    { label: 'Focus', value: Math.round((f1 / 60) * 10) / 10, prev: Math.round((f0 / 60) * 10) / 10, unit: 'h', dir: dir(f1, f0, hadPrev) },
    { label: 'Habits hit', value: h1, prev: h0, unit: '', dir: dir(h1, h0, hadPrev) },
  ];
}

export interface WeekReview {
  /** Monday-start week the review covers. */
  from: string;
  to: string;
  closed: number;
  /** Due inside the week and still not done. */
  slipped: number;
  focusHours: number;
  habitHits: number;
  habitDue: number;
  /** Titles of what slipped, so the review is actionable rather than a scold. */
  slippedTitles: string[];
}

/**
 * The week as a finishable unit.
 *
 * Kivetz, Urminsky & Zheng (2006) tracked 948 café-card holders: the gap
 * between visits shrank as the card filled, and cards handed out with two
 * stamps already on them were completed FASTER than empty ten-stamp cards.
 * Effort rises near a reachable finish line — which a 120-day countdown is not,
 * and a week is.
 */
export function weekReview(
  tasks: TodoTask[],
  focusSessions: FocusSession[],
  habits: Habit[],
  habitLog: HabitLog[],
  now: Date = new Date(),
): WeekReview {
  const end = startOfDay(now);
  const start = new Date(end);
  // Monday-start, matching how the rest of the app buckets weeks.
  const dow = (end.getDay() + 6) % 7;
  start.setDate(start.getDate() - dow);
  const from = start.getTime();
  const to = now.getTime();

  const closed = (tasks ?? []).filter(
    (t) => t?.status === 'done' && inRange(t.completedAt, from, to),
  ).length;

  // Slipped means the day it was due has ALREADY PASSED. Comparing against the
  // current instant counted everything due today as slipped from the moment the
  // screen loaded — telling you that you had failed at tasks you still had all
  // afternoon to do.
  const slippedTasks = (tasks ?? []).filter((t) => {
    if (!t?.dueDate || t.status === 'done') return false;
    const d = Date.parse(t.dueDate);
    if (Number.isNaN(d)) return false;
    const due = startOfDay(new Date(d));
    return due.getTime() >= from && due.getTime() < end.getTime();
  });

  const focusMins = (focusSessions ?? [])
    .filter((s) => s?.kind === 'focus' && inRange(s.date, from, to))
    .reduce((a, s) => a + (Number(s.durationMins) || 0), 0);

  const keys = new Set<string>();
  for (let d = new Date(start); d.getTime() <= to; d.setDate(d.getDate() + 1)) keys.add(dayKey(d));
  const habitHits = (habitLog ?? []).filter((l) => l?.date && keys.has(l.date)).length;
  let habitDue = 0;
  for (const h of habits ?? []) {
    if (!h?.id || h.archived) continue;
    for (const k of keys) if (isHabitDueOn(h, new Date(`${k}T12:00:00`))) habitDue++;
  }

  return {
    from: dayKey(start),
    to: dayKey(now),
    closed,
    slipped: slippedTasks.length,
    focusHours: Math.round((focusMins / 60) * 10) / 10,
    habitHits,
    habitDue,
    slippedTitles: slippedTasks.slice(0, 3).map((t) => t.title),
  };
}
