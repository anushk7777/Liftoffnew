# Push reminder setup

Liftoff's client is ready for web-push out of the box: the **Settings →
Reminders → Push reminders** toggle subscribes the browser and stores the
subscription in Supabase (`src/lib/push.ts`), and the service worker shows
incoming notifications (`public/push-sw.js`). The steps below provision the
backend that actually *sends* the pushes. **This was deployed entirely from
the Supabase + Vercel dashboards** (no local CLI needed). ~15 minutes.

The sender, tables, schedule, and config are all version-controlled:
- `supabase/functions/send-reminders/index.ts` — the sender (self-diagnosing, `?test=1` support, de-dup via `reminder_log`)
- `supabase/migrations/20260618_push_subscriptions.sql` — the subscriptions table
- `supabase/migrations/20260620_reminder_log.sql` — the de-dup ledger (run this once too)
- `supabase/migrations/20260619_schedule_send_reminders.sql` — the every-minute cron
- `supabase/config.toml` — sets `verify_jwt = false` for the function

**Steps 0–5 below set up task reminders. [Step 7](#7-the-morning-co2-nudge)
adds the morning CO2 nudge** — it reuses the same VAPID keys and the same
subscriptions, so do it after this is working.

## 0. Generate VAPID keys

```bash
npx web-push generate-vapid-keys
```

Keep both:
- **Public key** → goes in the client env (`VITE_VAPID_PUBLIC_KEY`) **and** as a function secret.
- **Private key** → function secret only. Never ship it to the client.

## 1. Create the subscriptions table (Supabase → SQL Editor)

Run the contents of `supabase/migrations/20260618_push_subscriptions.sql`.
Re-running is harmless — a "policy already exists" error just means it's
already there. This matches the client upsert in `src/lib/push.ts`
(`{ user_id, endpoint, subscription }`, `onConflict: 'endpoint'`).

**Also run `supabase/migrations/20260620_reminder_log.sql`** in the same SQL
editor. This creates the `reminder_log` de-dup ledger the sender uses so it can
re-scan the last 30 minutes of due tasks (catching reminders missed when a cron
tick lags) **without ever double-sending** — each `(user, task, time)` is
pushed exactly once.

## 2. Client public key (Vercel)

Project → **Settings → Environment Variables** → add `VITE_VAPID_PUBLIC_KEY`
= *(public key)* for Production → **Redeploy** (Vite inlines env vars at build
time, so a redeploy is required). Until this is set the toggle stays disabled
with a "not configured" note.

## 3. Function secrets (Supabase → Edge Functions → Secrets)

Add three secrets in the dashboard (no CLI):

| Name | Value |
|------|-------|
| `VAPID_PUBLIC_KEY`  | *(public key)* |
| `VAPID_PRIVATE_KEY` | *(private key)* |
| `VAPID_SUBJECT`     | `mailto:you@example.com` |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — do
not add them.

## 4. Deploy the function (Supabase → Edge Functions)

"Deploy a new function" → **Via Editor** → name it **`send-reminders`** →
paste `supabase/functions/send-reminders/index.ts` → **Deploy**. Then open the
function's settings and turn **Verify JWT OFF** (the cron calls it without a
user token). *(CLI alternative: `npx supabase link --project-ref <ref>` then
`npx supabase functions deploy send-reminders`; `config.toml` sets verify_jwt.)*

## 5. Schedule it every minute (Supabase → SQL Editor)

Enable the `pg_cron` and `pg_net` extensions (Database → Extensions), then run
`supabase/migrations/20260619_schedule_send_reminders.sql`. Confirm with
`select jobid, jobname, schedule, active from cron.job;` — `active` should be
`true`. The function now scans a 30-minute catch-up window and de-dups via
`reminder_log`, so a single late/skipped cron tick no longer drops a reminder
and tasks still fire exactly once.

> **Phone reminders:** each device needs its own subscription. Enabling the
> toggle on desktop does **not** subscribe your phone — open the deployed app on
> the phone (Android Chrome works in-browser; iOS needs the PWA installed to the
> Home Screen) and turn **Push reminders ON** there too.

## 6. Test

1. On the device, open the app → sign in → **Settings → Reminders → Push
   reminders ON** → allow the permission prompt (writes one `push_subscriptions` row).
2. Open `https://<project-ref>.supabase.co/functions/v1/send-reminders?test=1`.
   Expect `{ ok: true, sent: ≥1, subscriptions: ≥1 }` and a notification.
3. Schedule a task ~2 minutes out and confirm it fires on its own.

### Troubleshooting (the function self-reports as JSON)
- `subscriptions: 0` → no device subscribed; enable the toggle (and confirm the
  Vercel redeploy picked up `VITE_VAPID_PUBLIC_KEY` — hard-refresh to drop a
  stale service worker).
- `ok: false, step: "secrets"` → the VAPID secrets aren't set (step 3).
- `401` on the test URL → Verify JWT wasn't turned off (step 4).
- Still nothing → check the function's **Logs** in the dashboard.

## 7. The morning CO2 nudge

Sends the 09:30–11:00 CO2 tolerance reminder to a **closed** app. Reuses the
VAPID keys and `push_subscriptions` rows from the steps above — no new secrets.
~5 minutes.

- `supabase/functions/send-co2-nudge/index.ts` — the sender
- `supabase/migrations/20260728_co2_push.sql` — the `time_zone` column + `co2_nudge_log` ledger
- `supabase/migrations/20260728_schedule_co2_nudge.sql` — the 5-minute cron

**7a. Tables** (SQL Editor) — run `supabase/migrations/20260728_co2_push.sql`.
It adds `push_subscriptions.time_zone` and creates the de-dup ledger. Safe to
re-run.

**7b. Deploy** (Edge Functions) — "Deploy a new function" → **Via Editor** →
name it **`send-co2-nudge`** → paste `supabase/functions/send-co2-nudge/index.ts`
→ **Deploy** → turn **Verify JWT OFF**.

> Paste the file **as it is in the repo**. It carries a copy of the scheduling
> rule between two `SHARED WITH …` markers, kept byte-identical to
> `src/afterburn/innovation/co2Server.ts` by `node scripts/sync-co2-shared.mjs`
> and enforced by `co2ServerParity.test.ts`. Editing the copy by hand is how the
> browser ends up saying 09:30 and the phone buzzing at 08:30.

**7c. Schedule** (SQL Editor) — run
`supabase/migrations/20260728_schedule_co2_nudge.sql`. Confirm with
`select jobname, schedule, active from cron.job;`.

**7d. Give it your timezone.** The nudge fires at 09:30 *local*, and the sender
runs on UTC — so it reads the IANA zone stored on each subscription. Existing
subscriptions have none yet. **Open Liftoff once on each device**: the app writes
the zone on boot (`syncPushSubscription` in `src/lib/push.ts`) and refreshes it
every time, so travelling corrects itself. Settings → Reminders shows which zone
this device is sending as.

**7e. Test.**

1. `https://<project-ref>.supabase.co/functions/v1/send-co2-nudge?test=1` →
   expect `{ ok: true, sent: ≥1 }` and a notification within seconds. Test mode
   ignores the window, the "already logged" check and the ledger.
2. A real run: `…/send-co2-nudge` with no query string. Between 09:30 and 11:00
   local, with today's test not yet logged, expect `due: 1` and `sent: ≥1`.
   Outside that window expect `skippedLoggedOrClosed: ≥1` and `sent: 0` — that is
   the function working, not failing.
3. Tap the notification: it should open Liftoff on Afterburn → Progress.

### What the response fields mean

| Field | Meaning |
|-------|---------|
| `subscriptions` | Devices found across all users. `0` → nobody has push on. |
| `missingZone` | Subscriptions with no timezone yet — **open the app on that device** (7d). These are skipped, never guessed. |
| `due` | Zone-groups owed a nudge on this tick. |
| `sent` | Pushes actually delivered. |
| `skippedAlreadySent` | This slot was already pushed — the ledger doing its job. Normal. |
| `skippedLoggedOrClosed` | Outside the window, or the test is already logged today. Normal for all but 90 minutes a day. |

### Behaviour worth knowing

- **Four nudges a morning, maximum** — 09:30, 10:00, 10:30 and an 11:00 last
  call, each with its own line. It stops the moment the test is logged.
- **The cron runs every 5 minutes**, so a nudge can land up to ~4 minutes late.
  The sender allows 5 minutes of grace past 11:00 so a late tick still delivers
  the last call; that cannot produce a fifth nudge.
- **Two devices in one country share a nudge; two in different countries each
  get their own morning** — the de-dup key is (user, zone, local day, slot).
- **Only one OS notification.** With push on, the app stops raising its own copy
  and shows only the in-app banner.

## Notes

- **iOS**: web push only works for PWAs **installed to the Home Screen**
  (iOS 16.4+); it no-ops in a normal Safari tab. Android Chrome and desktop work
  in-browser directly.
- Nothing here changes the existing reminder paths: in-app alarms and calendar
  (.ics) export keep working regardless (`src/lib/reminders.ts`, `src/lib/ics.ts`).
