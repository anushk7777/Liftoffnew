// Two things the app knew but never told you.
//
// ---------------------------------------------------------------------------
// 1. THE MORNING CO2 NUDGE
//
// The CO2 tolerance test is only useful as a TREND, and a trend needs the
// measurement taken at roughly the same time each day — resting, before food
// and caffeine, before training. A score taken at 9am and one taken at 9pm are
// not comparable readings of the same thing, so a test you remember to do "at
// some point" is worth much less than one done in a fixed window.
//
// So the nudge is windowed rather than a single alarm: it opens at 09:30, keeps
// asking on a slot every half hour, and closes at 11:00. Past 11:00 it stays
// quiet for the day — a reading taken at 3pm would pollute the very trend the
// reminder exists to protect, and an app that nags all day gets muted.
//
// It stops the instant the test is logged. Nothing is more corrosive to a
// reminder than one that fires after you have already done the thing.
//
// ---------------------------------------------------------------------------
// 2. NOTE RECALL
//
// You write "left knee felt off on the last set" into an exercise note, and the
// app files it away where you will never see it again. The next time that lift
// comes round — which is exactly when the note is worth something — it is eight
// screens deep in History.
//
// A note is recalled on the exercise it belongs to, for a window that defaults
// to one week. One week because that is roughly one microcycle: you meet the
// lift again, the note applies, and then it expires rather than accumulating
// into a wall of stale text. The window is a setting, so it can be turned off
// or extended.
//
// Everything here is pure and takes `now`, so tests never depend on the clock.
import type { RecoveryEntry, WorkoutSession } from '../types';
import {
  CO2_WINDOW_START,
  CO2_WINDOW_END,
  CO2_SLOT_MINUTES,
  CO2_TAGLINES,
  CO2_TITLE,
} from './co2Server';

const DAY_MS = 86_400_000;

/** Local calendar-day key. Deliberately NOT an ISO slice — that is UTC and
 *  disagrees with the user's day east of Greenwich, which is where the whole
 *  point of a "morning" window would quietly break. */
export const localDay = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ---------------------------------------------------------------------------
// CO2 morning nudge
// ---------------------------------------------------------------------------

// The window, the slot length and the wording live in `co2Server.ts` because the
// server that pushes to a closed phone has to agree with the browser to the
// minute. Re-exported here so every existing caller (and test) still finds them
// where it always has.
export {
  CO2_WINDOW_START,
  CO2_WINDOW_END,
  CO2_SLOT_MINUTES,
  CO2_TAGLINES,
  CO2_TITLE,
} from './co2Server';

export interface Co2Nudge {
  /** Which half-hour slot inside the window this is, 0-based. */
  slot: number;
  /** Stable per day AND per slot, so the same nudge never fires twice. */
  key: string;
  title: string;
  body: string;
}

/**
 * Should the CO2 test be nudged right now?
 *
 * Returns null when there is nothing to say: outside the window, already logged
 * today, or this slot has already fired.
 *
 * `alreadyFired` is the set of keys the caller has raised before. Keeping it a
 * parameter rather than reading storage in here is what makes this testable at
 * a hundred simulated timestamps in a millisecond.
 */
export function co2Nudge(
  recovery: RecoveryEntry[],
  alreadyFired: ReadonlySet<string>,
  now: Date = new Date(),
): Co2Nudge | null {
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < CO2_WINDOW_START || minutes > CO2_WINDOW_END) return null;

  const today = localDay(now);
  // Logged today? Then the reminder has done its job and must go quiet.
  for (const r of recovery ?? []) {
    if (!r?.date) continue;
    const t = Date.parse(r.date);
    if (!Number.isNaN(t) && localDay(new Date(t)) === today) return null;
  }

  const slot = Math.floor((minutes - CO2_WINDOW_START) / CO2_SLOT_MINUTES);
  const key = `co2:${today}:${slot}`;
  if (alreadyFired.has(key)) return null;

  return {
    slot,
    key,
    title: CO2_TITLE,
    body: CO2_TAGLINES[Math.min(slot, CO2_TAGLINES.length - 1)],
  };
}

// ---------------------------------------------------------------------------
// Note recall
// ---------------------------------------------------------------------------

/** How long a note keeps coming back. `0` turns recall off entirely; `Infinity`
 *  keeps every note forever. One week is the default — roughly one microcycle,
 *  so you meet the lift again while the note still applies. */
export type RecallWindow = number;
export const DEFAULT_RECALL_DAYS = 7;

export interface RecalledNote {
  /** The exercise the note was written on. */
  exercise: string;
  text: string;
  /** ISO date of the session it came from. */
  date: string;
  /** Whole days between that session and now. 0 means today. */
  daysAgo: number;
  /** The day the session belonged to, e.g. "Pull #1" — context for a digest. */
  dayName?: string;
}

const stamp = (s: WorkoutSession): number => Date.parse(s?.completedAt ?? s?.date ?? '');

/**
 * The most recent note left on a given exercise, inside the recall window.
 *
 * Only the LATEST is returned, not every note ever written. A note written
 * three sessions ago has usually been superseded by the one written since, and
 * stacking them turns a useful reminder into a wall of text you stop reading.
 */
export function noteForExercise(
  sessions: WorkoutSession[],
  exerciseName: string,
  windowDays: RecallWindow = DEFAULT_RECALL_DAYS,
  now: Date = new Date(),
): RecalledNote | null {
  if (!exerciseName || !(windowDays > 0)) return null;
  const cutoff = now.getTime() - windowDays * DAY_MS;
  const target = exerciseName.trim().toLowerCase();

  let best: RecalledNote | null = null;
  let bestT = -Infinity;
  for (const s of sessions ?? []) {
    const t = stamp(s);
    if (Number.isNaN(t) || t < cutoff || t > now.getTime()) continue;
    for (const e of s?.entries ?? []) {
      if (!e?.name || e.name.trim().toLowerCase() !== target) continue;
      const text = (e.notes ?? '').trim();
      if (!text) continue;
      if (t > bestT) {
        bestT = t;
        best = {
          exercise: e.name,
          text,
          date: new Date(t).toISOString(),
          daysAgo: Math.floor((now.getTime() - t) / DAY_MS),
          dayName: s.dayName,
        };
      }
    }
  }
  return best;
}

export interface NoteDigest {
  notes: RecalledNote[];
  /** Distinct exercises that carry a note in the window. */
  lifts: number;
  windowDays: number;
  /** True when there is genuinely nothing to show — the UI renders nothing at
   *  all in that case rather than an empty card. */
  empty: boolean;
}

/**
 * Everything noted inside the window, newest first, one entry per exercise.
 *
 * Deduplicated by exercise for the same reason `noteForExercise` returns only
 * the latest: a digest that lists four notes about the same lift is a diary,
 * not a summary.
 */
export function noteDigest(
  sessions: WorkoutSession[],
  windowDays: RecallWindow = DEFAULT_RECALL_DAYS,
  now: Date = new Date(),
): NoteDigest {
  if (!(windowDays > 0)) return { notes: [], lifts: 0, windowDays: 0, empty: true };
  const cutoff = now.getTime() - windowDays * DAY_MS;

  const byExercise = new Map<string, RecalledNote>();
  for (const s of sessions ?? []) {
    const t = stamp(s);
    if (Number.isNaN(t) || t < cutoff || t > now.getTime()) continue;
    for (const e of s?.entries ?? []) {
      const text = (e?.notes ?? '').trim();
      if (!e?.name || !text) continue;
      const k = e.name.trim().toLowerCase();
      const prev = byExercise.get(k);
      if (!prev || Date.parse(prev.date) < t) {
        byExercise.set(k, {
          exercise: e.name,
          text,
          date: new Date(t).toISOString(),
          daysAgo: Math.floor((now.getTime() - t) / DAY_MS),
          dayName: s.dayName,
        });
      }
    }
  }

  const notes = [...byExercise.values()].sort(
    (a, b) => Date.parse(b.date) - Date.parse(a.date) || a.exercise.localeCompare(b.exercise),
  );
  return { notes, lifts: notes.length, windowDays, empty: notes.length === 0 };
}

/** "yesterday" / "3 days ago" — for a note, exact dates read as clutter. */
export function agoLabel(daysAgo: number): string {
  if (daysAgo <= 0) return 'today';
  if (daysAgo === 1) return 'yesterday';
  return `${daysAgo} days ago`;
}
