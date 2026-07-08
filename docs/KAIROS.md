# Kairos — your private diary of moments

Kairos (καιρός) is the ancient-Greek word for the *fleeting, opportune instant* —
the opposite of chronos, clock time. Kairos is the third workspace inside Liftoff
(alongside Focus and Afterburn): a private, local-first diary built around one
idea — **amor fati**, love of what was.

You capture the exact moment — a few words, how it feels, and, if you like, a
**real-time photo** (camera only, never the gallery, so it's genuinely *this*
moment). The timestamp is locked at capture and never editable. Then Kairos
brings those moments back to you: an **On This Day** feed in-app, plus an
**email + push nudge** on the milestone anniversaries — *"1 year ago today you
wrote this."*

## What's in v1

- **Capture** — text + optional mood (7 moods) + optional real-time camera photo
  + optional place. One tap to keep it.
- **On This Day** — every moment captured on today's date in an earlier year.
- **Moments** — the full timeline, grouped by month.
- **Annual resurfacing** — on the 1 / 2 / 3 / 5 / 10-year anniversaries, a moment
  comes back as a web-push nudge and (optionally) an email.

Coming next: sealed letters to your future self, voice notes, and a year-in-review.

## Privacy

Moments are your private diary. They're stored **local-first** (in your browser)
and synced to your own row in Supabase, isolated per-user by Row-Level Security
(`auth.uid() = id`) — exactly like your tasks and workouts. Nothing is public or
shared.

They are **not** end-to-end encrypted, and this is a deliberate trade-off: the
server has to be able to read a moment's text to email it back to you on its
anniversary, which is the whole point of the feature. If you'd rather keep
everything on-device only, the app still works fully offline — the resurfacing
email/push simply won't fire.

> Photos are downscaled (max 1024px, JPEG) before storage, then uploaded to a
> **private Supabase Storage bucket** (`journal-photos`), one folder per user,
> with RLS so only you can read them. The moment stores a lightweight path (not
> the image bytes), and the app renders it via a short-lived signed URL. Until
> the storage bucket migration is run, photos fall back to being stored inline
> in `journal_data` (still saved, just heavier). See setup step 5 below.

## Backend setup (one-time)

The resurfacing engine reuses the **same Supabase project and web-push (VAPID)
setup** as the task reminders (see `docs/PUSH_SETUP.md`). If push already works
for reminders, most of this is already done.

1. **Create the tables.** Run `supabase/migrations/20260708_journal_data.sql` in
   the Supabase SQL editor. This creates `journal_data` (your synced moments) and
   `journal_resurface_log` (the anti-duplicate ledger), both with RLS.

2. **Deploy the function.** Deploy `supabase/functions/send-journal-resurfacing`
   the same way as `send-reminders` (in-browser editor or
   `npx supabase functions deploy send-journal-resurfacing`). Turn **Verify JWT
   OFF** (`config.toml` already sets this) so the cron can call it.

   It uses the VAPID secrets already set for `send-reminders`
   (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`).

3. **(Optional) Enable email.** Push works out of the box. To also send the
   "on this day" **email**, add two function secrets:
   - `RESEND_API_KEY` — a [Resend](https://resend.com) API key (free tier is fine).
   - `RESEND_FROM` — e.g. `Kairos <you@yourdomain.com>` (or leave unset to use
     Resend's `onboarding@resend.dev` sandbox sender for testing).

   Without `RESEND_API_KEY`, the function simply skips email and still pushes.

4. **Schedule it.** Run `supabase/migrations/20260708_schedule_journal_resurfacing.sql`
   to add a daily pg_cron job (13:00 UTC). Requires the `pg_cron` + `pg_net`
   extensions (Database → Extensions).

5. **Photo storage.** Run `supabase/migrations/20260709_journal_photos_bucket.sql`
   to create the private `journal-photos` bucket + per-user RLS. After this,
   captured photos upload to Storage and the JSON row only holds a path. (Photos
   captured before this ran remain inline and keep working.)

## Testing delivery

Open the function URL with `?test=1`:

```
https://<project>.supabase.co/functions/v1/send-journal-resurfacing?test=1
```

Test mode resurfaces each user's **most recent** moment immediately (bypassing
the anniversary + de-dup checks). Expect JSON like
`{ ok: true, pushes: >=1, emails: >=0, emailConfigured: <bool> }` — and a
notification on any device where you've enabled push, plus an email if configured.
Then a real anniversary fires automatically from the daily cron.
