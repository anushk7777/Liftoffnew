import { startOfDay, format } from 'date-fns';

// Local calendar-day key — timezone/DST safe.
export const dayKey = (d: string | Date) => format(new Date(d), 'yyyy-MM-dd');

// Walk backwards from today over a set of completed day-keys, allowing a single
// "grace" day (spent, not counted) so one slip doesn't reset the streak.
// Returns the current streak and whether the grace day is still available.
//
// `today` is a parameter, defaulting to now, for the same reason every other
// engine here takes one: without it the answer depends on the day the test runs.
// Two tests compared this against a fixed date and passed for a week before
// going red on a Thursday, which is the worst possible way to find out.
export function streakFromDays(
  days: Set<string>,
  today: Date = new Date(),
): { streak: number; freezeAvailable: boolean } {
  if (days.size === 0) return { streak: 0, freezeAvailable: true };

  let streak = 0;
  let freeze = true;
  const cursor = startOfDay(today);
  // Don't punish today before it's been logged.
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);

  for (;;) {
    if (days.has(dayKey(cursor))) {
      streak++;
    } else if (freeze) {
      freeze = false;
    } else {
      break;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return { streak, freezeAvailable: freeze };
}

// Longest strictly-consecutive run anywhere in history (not just the current
// one) — so "longest streak" survives imports, merges and gaps instead of only
// ever being raised to a streak the app happened to witness live.
export function longestRunFromDays(days: Set<string>): number {
  if (days.size === 0) return 0;
  const sorted = [...days].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(`${sorted[i - 1]}T00:00:00`);
    prev.setDate(prev.getDate() + 1);
    if (dayKey(prev) === sorted[i]) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }
  return best;
}

export const STREAK_MILESTONES = [7, 14, 30, 50, 100, 200, 365];
export const isMilestone = (n: number) => STREAK_MILESTONES.includes(n);
