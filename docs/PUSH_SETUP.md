# Push reminder setup

Liftoff's client is ready for web-push: the **Settings → Reminders → Push
reminders** toggle subscribes the browser and stores the subscription in
Supabase, and the service worker already shows incoming notifications
(`public/push-sw.js`). What's left is the part only you can provision: VAPID
keys, a table, and a sender. ~15 minutes.

## 1. Generate VAPID keys

```bash
npx web-push generate-vapid-keys
```

- Put the **public** key in the client env as `VITE_VAPID_PUBLIC_KEY`
  (e.g. in Vercel project env, then redeploy). Until this is set, the toggle
  stays disabled and shows a "not configured" note.
- Keep the **private** key for the Edge Function secret (step 3).

## 2. Create the subscriptions table (Supabase SQL editor)

```sql
create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  subscription jsonb not null,
  created_at  timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- Each user manages only their own subscriptions.
create policy "own subscriptions" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

This matches the client upsert in `src/lib/push.ts`
(`{ user_id, endpoint, subscription }`, `onConflict: 'endpoint'`).

## 3. Sender — Supabase Edge Function

Create `supabase/functions/send-reminders/index.ts` that, for each due task,
looks up the user's subscriptions and sends a push with payload
`{ title, body, url }` (the shape `public/push-sw.js` expects). Use the
`web-push` library with your VAPID keys.

```bash
supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com
supabase functions deploy send-reminders
```

Then schedule it (pick one):

- **pg_cron** in Supabase calling the function over HTTP every minute/5 min, or
- the app's existing Scheduler / an external cron hitting the function URL.

The function should select tasks whose `scheduledAt` falls in the current
window, find `push_subscriptions` for each `user_id`, and send. Prune any
subscription that returns HTTP 410/404 (expired).

## Notes

- **iOS**: web push only works for PWAs **installed to the Home Screen**
  (iOS 16.4+). The toggle will no-op in the normal Safari tab — install first
  (the InstallPrompt sheet explains how).
- Nothing here changes the existing reminder paths: in-app alarms and calendar
  (.ics) export keep working regardless (`src/lib/reminders.ts`, `src/lib/ics.ts`).
