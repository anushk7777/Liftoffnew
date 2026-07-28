import { describe, it, expect } from 'vitest';
import { format } from 'date-fns';
import { todayPlan, consistency, weekMomentum, weekReview, minutesOfDay } from './today';
import type { Habit, HabitLog, TodoTask, FocusSession } from '../store/data';
import type { ActivityLog } from '../store/useStore';

// Constructed in LOCAL time on purpose. As a Z timestamp this is Wednesday
// 02:00 in Auckland, so "a Tuesday" — and every weekly-habit and week-boundary
// assertion below — held only in the UTC container. The production code reads
// the user's local day throughout; the fixture has to as well.
const NOW = new Date(2026, 6, 28, 14, 0, 0); // Tuesday 28 July 2026, local
const DAY = 86_400_000;
const iso = (d: number) => new Date(NOW.getTime() + d * DAY).toISOString();
// Day keys must be LOCAL, exactly as dayKey() produces them. Slicing an ISO
// string is UTC and silently disagrees east of Greenwich — these tests would
// have passed in the UTC container and failed on the owner's machine.
const key = (d: number) => format(new Date(NOW.getTime() + d * DAY), 'yyyy-MM-dd');

const task = (o: Partial<TodoTask> & { id: string; title: string }): TodoTask => ({
  priority: 'medium',
  status: 'todo',
  createdAt: iso(-30),
  ...o,
}) as TodoTask;

const habit = (o: Partial<Habit> & { id: string; name: string }): Habit => ({
  cadence: 'daily',
  createdAt: iso(-30),
  archived: false,
  ...o,
}) as Habit;

describe('minutesOfDay', () => {
  it('parses a valid time and rejects anything else', () => {
    expect(minutesOfDay('09:30')).toBe(570);
    expect(minutesOfDay('00:00')).toBe(0);
    expect(minutesOfDay('23:59')).toBe(1439);
    // Malformed values must not sort to the top of the day by parsing as NaN.
    for (const bad of [undefined, '', 'soon', '25:00', '9:70', '09:30:00', '-1:00'])
      expect(minutesOfDay(bad as string)).toBeNull();
  });
});

describe('todayPlan', () => {
  it('mixes tasks and habits, and orders timed items by the clock', () => {
    const p = todayPlan(
      [
        // Local-time string, not a Z timestamp: a Z time renders at a different
        // clock hour per timezone and could reorder against the 07:00 habit.
        task({ id: 't1', title: 'Afternoon task', dueDate: iso(0), scheduledAt: '2026-07-28T15:00:00' }),
        task({ id: 't2', title: 'Untimed high', dueDate: iso(0), priority: 'high' }),
        task({ id: 't3', title: 'Untimed low', dueDate: iso(0), priority: 'low' }),
      ],
      [habit({ id: 'h1', name: 'Morning pages', scheduledTime: '07:00' })],
      [],
      NOW,
    );
    // Timed first in clock order, then untimed by priority.
    expect(p.items.map((i) => i.title)).toEqual([
      'Morning pages',
      'Afternoon task',
      'Untimed high',
      'Untimed low',
    ]);
    expect(p.total).toBe(4);
    expect(p.done).toBe(0);
  });

  it('pulls overdue tasks into today and counts them', () => {
    const p = todayPlan(
      [
        task({ id: 't1', title: 'Missed on Friday', dueDate: iso(-4), priority: 'low' }),
        task({ id: 't2', title: 'Due today', dueDate: iso(0), priority: 'high' }),
      ],
      [], [], NOW,
    );
    expect(p.overdue).toBe(1);
    // Overdue leads: a task you already missed is still today's problem.
    expect(p.items[0].title).toBe('Missed on Friday');
    expect(p.items[0].overdueBy).toBe(4);
  });

  it('keeps a task ticked TODAY in the list, but drops one finished earlier', () => {
    const p = todayPlan(
      [
        task({ id: 't1', title: 'Ticked just now', dueDate: iso(0), status: 'done', completedAt: iso(0) }),
        task({ id: 't2', title: 'Finished yesterday', dueDate: iso(-1), status: 'done', completedAt: iso(-1) }),
      ],
      [], [], NOW,
    );
    // Ticking something must not make it vanish under your finger.
    expect(p.items.map((i) => i.title)).toEqual(['Ticked just now']);
    expect(p.done).toBe(1);
  });

  it('ignores tasks with no due date — they are not today until you schedule them', () => {
    const p = todayPlan([task({ id: 't1', title: 'Someday' })], [], [], NOW);
    expect(p.empty).toBe(true);
  });

  it('marks a habit done when it is logged for today, and skips archived ones', () => {
    const habits = [
      habit({ id: 'h1', name: 'Read' }),
      habit({ id: 'h2', name: 'Old habit', archived: true }),
    ];
    const log: HabitLog[] = [{ habitId: 'h1', date: key(0) }];
    const p = todayPlan([], habits, log, NOW);
    expect(p.items.map((i) => i.title)).toEqual(['Read']);
    expect(p.items[0].done).toBe(true);
  });

  it('only shows a weekly habit on its own days', () => {
    // NOW is a Tuesday (day 2).
    const mwf = habit({ id: 'h1', name: 'Train', cadence: 'weekly', daysOfWeek: [1, 3, 5] });
    expect(todayPlan([], [mwf], [], NOW).empty).toBe(true);
    const wed = new Date(2026, 6, 29, 14, 0, 0);
    expect(todayPlan([], [mwf], [], wed).items).toHaveLength(1);
  });

  it('survives malformed data without throwing', () => {
    const junk = [
      null, undefined, {},
      { id: 'x', title: 'No due' },
      { id: 'y', title: 'Bad date', dueDate: 'not-a-date' },
    ] as unknown as TodoTask[];
    expect(() => todayPlan(junk, [null] as unknown as Habit[], [null] as unknown as HabitLog[], NOW)).not.toThrow();
    expect(todayPlan(junk, [], [], NOW).empty).toBe(true);
  });
});

describe('consistency', () => {
  it('reports a rate over the window, newest last', () => {
    const activity: ActivityLog[] = [0, -1, -2, -4, -5].map((d) => ({ date: iso(d), type: 'full' }));
    const c = consistency(activity, 14, NOW);
    expect(c.days).toHaveLength(14);
    expect(c.days[13].key).toBe(key(0));
    expect(c.days[13].hit).toBe(true);
    expect(c.hit).toBe(5);
    expect(c.pct).toBe(36);
  });

  it('does not collapse to zero after one missed day', () => {
    // Twelve of the last fourteen, with a gap three days ago. A streak counter
    // would read 2; the evidence says the habit curve is untouched.
    const days = [0, -1, -2, -4, -5, -6, -7, -8, -9, -10, -11, -12];
    const c = consistency(days.map((d) => ({ date: iso(d), type: 'full' })), 14, NOW);
    expect(c.hit).toBe(12);
    expect(c.pct).toBe(86);
  });

  it('handles an empty and a malformed history', () => {
    expect(consistency([], 14, NOW).hit).toBe(0);
    expect(() => consistency([null, {}] as unknown as ActivityLog[], 14, NOW)).not.toThrow();
  });
});

describe('weekMomentum', () => {
  const focus = (d: number, mins: number): FocusSession =>
    ({ id: `f${d}`, date: iso(d), durationMins: mins, kind: 'focus' }) as FocusSession;

  it('compares this week with the one before it', () => {
    const tasks = [
      task({ id: 'a', title: 'a', status: 'done', completedAt: iso(-1) }),
      task({ id: 'b', title: 'b', status: 'done', completedAt: iso(-3) }),
      task({ id: 'c', title: 'c', status: 'done', completedAt: iso(-9) }),
      task({ id: 'old', title: 'old', createdAt: iso(-40) }),
    ];
    const m = weekMomentum(tasks, [focus(-1, 60), focus(-8, 120)], [{ habitId: 'h', date: key(-1) }], NOW);
    const byLabel = Object.fromEntries(m.map((x) => [x.label, x]));
    expect(byLabel['Tasks done'].value).toBe(2);
    expect(byLabel['Tasks done'].prev).toBe(1);
    expect(byLabel['Tasks done'].dir).toBe('up');
    expect(byLabel['Focus'].value).toBe(1);
    expect(byLabel['Focus'].prev).toBe(2);
    expect(byLabel['Focus'].dir).toBe('down');
  });

  it('reports no direction when there is no prior week to compare against', () => {
    // A brand-new user has nothing behind them; an arrow would be invented.
    const tasks = [task({ id: 'a', title: 'a', createdAt: iso(-2), status: 'done', completedAt: iso(-1) })];
    for (const s of weekMomentum(tasks, [], [], NOW)) expect(s.dir).toBeNull();
  });

  it('treats a genuine zero last week as a real comparison', () => {
    const tasks = [
      task({ id: 'old', title: 'old', createdAt: iso(-30) }),
      task({ id: 'a', title: 'a', status: 'done', completedAt: iso(-1) }),
    ];
    const m = weekMomentum(tasks, [], [], NOW);
    expect(m[0].prev).toBe(0);
    expect(m[0].dir).toBe('up');
  });

  it('survives malformed sessions and logs', () => {
    expect(() =>
      weekMomentum(
        [null] as unknown as TodoTask[],
        [null, { kind: 'focus' }] as unknown as FocusSession[],
        [null, { habitId: 'x' }] as unknown as HabitLog[],
        NOW,
      ),
    ).not.toThrow();
  });
});

describe('weekReview', () => {
  it('does not call a task due TODAY slipped — the day is not over', () => {
    // Comparing the due date against the current instant marked everything due
    // today as failed the moment the screen loaded.
    const tasks = [task({ id: 'a', title: 'Due today, still open', dueDate: iso(0) })];
    expect(weekReview(tasks, [], [], [], NOW).slipped).toBe(0);
  });

  it('counts what closed and names what slipped, Monday-start', () => {
    // NOW is Tuesday 28 Jul 2026, so the week began Monday 27th.
    const tasks = [
      task({ id: 'a', title: 'Closed Monday', status: 'done', completedAt: iso(-1) }),
      task({ id: 'b', title: 'Slipped Monday', dueDate: iso(-1) }),
      task({ id: 'c', title: 'Last week', status: 'done', completedAt: iso(-8) }),
    ];
    const r = weekReview(tasks, [], [], [], NOW);
    expect(r.closed).toBe(1);
    expect(r.slipped).toBe(1);
    expect(r.slippedTitles).toEqual(['Slipped Monday']);
  });

  it('counts habit hits against how many were actually due', () => {
    const h = [habit({ id: 'h1', name: 'Read' })]; // daily
    const log: HabitLog[] = [{ habitId: 'h1', date: key(-1) }, { habitId: 'h1', date: key(0) }];
    const r = weekReview([], [], h, log, NOW);
    expect(r.habitHits).toBe(2);
    expect(r.habitDue).toBe(2); // Monday and Tuesday
  });

  it('survives malformed data', () => {
    expect(() => weekReview(
      [null] as unknown as TodoTask[], [null] as unknown as FocusSession[],
      [null] as unknown as Habit[], [null] as unknown as HabitLog[], NOW,
    )).not.toThrow();
  });
});
