// The scheduling rule for the morning CO2 nudge, written so it can run in two
// places at once: in the browser, and on a Supabase Edge Function that pushes to
// a phone with the app fully closed.
//
// WHY THIS FILE IS DUPLICATED
//
// The Edge Function is deployed by pasting a single file into the Supabase
// dashboard (see docs/PUSH_SETUP.md), so it cannot import from `src/`. Rather
// than let two copies of a scheduling rule drift apart — the classic way a
// reminder starts firing at the wrong hour on one surface only — the block
// below is copied VERBATIM into `supabase/functions/send-co2-nudge/index.ts`
// between the same two markers, and `co2ServerParity.test.ts` fails the build if
// so much as a character differs.
//
// So: edit the block here, then run `node scripts/sync-co2-shared.mjs` to push
// it into the Edge Function. Never hand-edit the copy.
//
// WHY IT TAKES A TIMEZONE INSTEAD OF READING THE CLOCK
//
// The browser copy could simply call `getHours()`. The server cannot: it runs on
// UTC and has to answer "is it 09:30 where this person is?" for whichever device
// is going to buzz. So the whole rule is expressed in terms of an IANA zone and
// an instant, which has the pleasant side effect of making DST, half-hour
// offsets and travel testable rather than hoped-for.

// ===== SHARED WITH supabase/functions/send-co2-nudge/index.ts — BEGIN =====
/** Window, in minutes past local midnight. 09:30 to 11:00. */
export const CO2_WINDOW_START = 9 * 60 + 30;
export const CO2_WINDOW_END = 11 * 60;
/** How often it asks again inside the window. */
export const CO2_SLOT_MINUTES = 30;
/** The scheduled sender runs on a 5-minute cron, so the 11:00 last call would be
 *  silently dropped whenever a tick ran late. This grace covers the cron's own
 *  lag — it never creates an extra nudge, because the slot index is unchanged
 *  for the whole half hour after 11:00. Zero on the client, which checks every
 *  minute and needs no allowance. */
export const CO2_CRON_GRACE_MINUTES = 5;

export const CO2_TITLE = 'CO2 tolerance test';

/** Notification tag shared by the in-app copy and the pushed copy. Same tag
 *  means the second REPLACES the first rather than stacking two identical cards
 *  in the shade — the belt to the braces of not raising both in the first
 *  place. */
export const CO2_TAG = 'afterburn-co2';

/** Query flag on the URL a tapped notification opens: `/?co2=1`. A service
 *  worker can only hand the app a location, so the intent has to survive as
 *  something the address bar can carry. */
export const CO2_PARAM = 'co2';

/** One line per slot, so four nudges in a morning are not the same sentence
 *  four times. Ordered from invitation to last call — the tone tightens as the
 *  window closes, because by 11:00 it genuinely is the last useful moment. */
export const CO2_TAGLINES = [
  'One slow breath out. Your recovery score is waiting.',
  'Before the day gets loud — one exhale, one number.',
  "Still time. One breath tells you what today's training should cost.",
  'Last call — the window closes at 11, and a late reading tells you nothing.',
] as const;

/** Wall-clock reading of an instant in a particular place. */
export interface Co2Wall {
  /** Local calendar day, `yyyy-mm-dd`. */
  day: string;
  /** Minutes past local midnight, 0-1439. */
  minutes: number;
}

/**
 * What the clock says in `timeZone` at instant `when`.
 *
 * `hourCycle: 'h23'` rather than `hour12: false` on purpose: the latter reports
 * midnight as hour "24" in several engines, which would put 00:10 at minute
 * 1450 and quietly break any window comparison.
 *
 * Returns null for a zone the platform does not recognise, so a garbage or
 * missing value can never be mistaken for UTC and nudge someone at 3am.
 */
export function wallClockIn(when: Date, timeZone: string): Co2Wall | null {
  if (!timeZone) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(when);
    const at = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const y = at('year');
    const mo = at('month');
    const d = at('day');
    const h = Number(at('hour'));
    const mi = Number(at('minute'));
    if (!y || !mo || !d || !Number.isFinite(h) || !Number.isFinite(mi)) return null;
    return { day: `${y}-${mo}-${d}`, minutes: h * 60 + mi };
  } catch {
    return null;
  }
}

/** A nudge that is due right now, or null when there is nothing to say. */
export interface Co2Due {
  /** Local calendar day it belongs to — half of the de-dup key. */
  day: string;
  /** Which half-hour slot inside the window, 0-based — the other half. */
  slot: number;
  title: string;
  body: string;
}

/**
 * Should the CO2 test be nudged in `timeZone` right now?
 *
 * Null when outside the window, when the test has already been logged on that
 * zone's calendar day, or when the zone is unusable. Says nothing about whether
 * this slot has already been SENT — that is the caller's ledger, because the
 * browser keeps it in localStorage and the server keeps it in Postgres.
 *
 * `recovery` is deliberately typed structurally rather than as the app's
 * RecoveryEntry: this block has to compile inside a Deno function that has no
 * access to the app's types.
 */
export function co2Due(
  timeZone: string,
  recovery: readonly { date?: string | null }[] | null | undefined,
  when: Date,
  graceMinutes = 0,
): Co2Due | null {
  const wall = wallClockIn(when, timeZone);
  if (!wall) return null;
  if (wall.minutes < CO2_WINDOW_START) return null;
  if (wall.minutes > CO2_WINDOW_END + graceMinutes) return null;

  // Logged today? Then the reminder has done its job and must go quiet. Compared
  // in the SAME zone the window was read in, so an entry logged at 23:00 in
  // Auckland is not counted as "today" for a phone in Los Angeles.
  for (const r of recovery ?? []) {
    if (!r?.date) continue;
    const t = Date.parse(r.date);
    if (Number.isNaN(t)) continue;
    const logged = wallClockIn(new Date(t), timeZone);
    if (logged && logged.day === wall.day) return null;
  }

  const slot = Math.min(
    Math.floor((wall.minutes - CO2_WINDOW_START) / CO2_SLOT_MINUTES),
    CO2_TAGLINES.length - 1,
  );
  return { day: wall.day, slot, title: CO2_TITLE, body: CO2_TAGLINES[slot] };
}
// ===== SHARED WITH supabase/functions/send-co2-nudge/index.ts — END =====
