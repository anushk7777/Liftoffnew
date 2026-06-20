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

## Notes

- **iOS**: web push only works for PWAs **installed to the Home Screen**
  (iOS 16.4+); it no-ops in a normal Safari tab. Android Chrome and desktop work
  in-browser directly.
- Nothing here changes the existing reminder paths: in-app alarms and calendar
  (.ics) export keep working regardless (`src/lib/reminders.ts`, `src/lib/ics.ts`).
