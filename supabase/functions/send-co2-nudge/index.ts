// Supabase Edge Function: send-co2-nudge
//
// Delivers the morning CO2 tolerance nudge to a phone with the app CLOSED. The
// in-app version (src/afterburn/co2Reminder.ts) can only fire while a tab is
// alive, which is exactly the wrong assumption for a 09:30 reminder — at 09:30
// the app is shut and the phone is in a pocket.
//
// The rule is the same one the browser uses, copied verbatim from
// src/afterburn/innovation/co2Server.ts between the two markers below. Do not
// hand-edit that block: change the source and run
// `node scripts/sync-co2-shared.mjs`. src/afterburn/innovation/co2ServerParity.test.ts
// fails the build if the two copies differ by a single character.
//
// Timing: driven by a 5-minute pg_cron (see the migration). Each device's IANA
// zone rides on its push_subscriptions row, so "09:30" means 09:30 where the
// device is — and a device that travels starts nudging on the new local morning
// the first time the app is opened there.
//
// Crash-proof in the same style as send-reminders: every failure is returned as
// readable JSON rather than killing the run, and `?test=1` force-sends one nudge
// to every subscribed device right now, ignoring the window and the ledger.
//
// Deploy: see docs/PUSH_SETUP.md. Requires the same VAPID_* secrets as
// send-reminders and "Verify JWT" OFF so the cron can call it.
import { createClient } from "npm:@supabase/supabase-js@2";

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

/** Where a notification tap should land. Read at boot by src/afterburn/deepLink.ts,
 *  which switches to Afterburn and opens the test itself. */
const CO2_URL = `/?${CO2_PARAM}=1`;

Deno.serve(async (req) => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  try {
    const pub = Deno.env.get("VAPID_PUBLIC_KEY");
    const priv = Deno.env.get("VAPID_PRIVATE_KEY");
    const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:anushkdua2508@gmail.com";
    if (!pub || !priv)
      return json(500, { ok: false, step: "secrets", error: "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set" });

    let webpush: any;
    try {
      webpush = (await import("npm:web-push@3.6.7")).default;
    } catch (e) {
      return json(500, { ok: false, step: "import web-push", error: String(e) });
    }
    webpush.setVapidDetails(subject, pub, priv);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const testMode = new URL(req.url).searchParams.get("test") === "1";
    const now = new Date();

    // Driven from the subscriptions, not from the user list: only a subscribed
    // device can be nudged, and this keeps the scan proportional to the number
    // of devices rather than the number of accounts.
    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint, subscription, user_id, time_zone");
    if (error) return json(500, { ok: false, step: "select push_subscriptions", error: error.message });

    // Group by user, then by zone. Two devices in the same zone share one
    // decision and one ledger row; two devices in different zones each get their
    // own morning, which is the entire reason the zone is part of the key.
    const byUser = new Map<string, Map<string, { endpoint: string; subscription: unknown }[]>>();
    let missingZone = 0;
    for (const s of subs ?? []) {
      const zone = (s.time_zone ?? "").trim();
      if (!zone) {
        // A subscription made before the zone column existed. It self-heals the
        // next time the app is opened on that device; until then we cannot know
        // when its morning is, and guessing UTC would buzz someone at 3am.
        missingZone++;
        continue;
      }
      let zones = byUser.get(s.user_id);
      if (!zones) byUser.set(s.user_id, (zones = new Map()));
      const list = zones.get(zone);
      if (list) list.push(s);
      else zones.set(zone, [s]);
    }

    let sent = 0, dueCount = 0, skippedAlreadySent = 0, skippedLoggedOrClosed = 0;

    for (const [userId, zones] of byUser) {
      // One read per user, reused across that user's zones.
      const { data: wd } = await supabase.from("workout_data").select("data").eq("id", userId).maybeSingle();
      const recovery: { date?: string | null }[] = (wd?.data as any)?.recovery ?? [];

      for (const [zone, devices] of zones) {
        const due = testMode
          ? { day: "test", slot: 0, title: CO2_TITLE, body: CO2_TAGLINES[0] }
          : co2Due(zone, recovery, now, CO2_CRON_GRACE_MINUTES);
        if (!due) {
          skippedLoggedOrClosed++;
          continue;
        }
        dueCount++;

        // Claim before sending. The primary key makes a duplicate or overlapping
        // run's insert fail, so a slot is pushed exactly once per zone per day.
        if (!testMode) {
          const { error: claimErr } = await supabase
            .from("co2_nudge_log")
            .insert({ user_id: userId, time_zone: zone, local_day: due.day, slot: due.slot });
          if (claimErr) {
            if ((claimErr as any).code === "23505") { skippedAlreadySent++; continue; } // already sent
            console.error("co2_nudge_log insert error", claimErr.message);
            continue; // don't push if we couldn't record it (avoids a loop)
          }
        }

        const payload = JSON.stringify({ title: due.title, body: due.body, url: CO2_URL, tag: CO2_TAG });
        for (const d of devices) {
          try {
            await webpush.sendNotification(d.subscription, payload);
            sent++;
          } catch (e: any) {
            // 404/410 = the browser threw the subscription away (uninstalled,
            // cleared data, permission revoked). Drop the dead row.
            if (e?.statusCode === 404 || e?.statusCode === 410)
              await supabase.from("push_subscriptions").delete().eq("endpoint", d.endpoint);
            else console.error("push error", e?.statusCode, String(e));
          }
        }
      }
    }

    // Best-effort prune so the ledger doesn't grow unbounded (older than 7 days).
    if (!testMode) {
      const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60_000).toISOString();
      await supabase.from("co2_nudge_log").delete().lt("sent_at", cutoff);
    }

    return json(200, {
      ok: true,
      sent,
      due: dueCount,
      subscriptions: subs?.length ?? 0,
      missingZone,
      skippedAlreadySent,
      skippedLoggedOrClosed,
      testMode,
    });
  } catch (e) {
    return json(500, { ok: false, step: "unhandled", error: String(e) });
  }
});
