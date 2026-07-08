-- Kairos (journaling) cloud sync. One row per user holding their moments as
-- JSON, mirroring workout_data / user_data. Run once in the Supabase SQL editor
-- (same project). The client syncs to this table from src/kairos/store.ts, and
-- the send-journal-resurfacing Edge Function reads it to email/push a moment
-- back on its anniversary. Degrades to local-only until this runs.
create table if not exists public.journal_data (
  id         uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.journal_data enable row level security;

-- Each user can only read/write their own row. The Edge Function uses the
-- service-role key, which bypasses RLS, so it can resurface across all users.
create policy "own journal data" on public.journal_data
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- De-dup ledger for the annual resurfacing (email + push), so a moment is
-- resurfaced at most once per anniversary day even if the daily cron lags or
-- runs twice. One row = (user, moment, the calendar day it was resurfaced).
create table if not exists public.journal_resurface_log (
  user_id      uuid not null references auth.users(id) on delete cascade,
  moment_id    text not null,
  resurface_on date not null,
  sent_at      timestamptz not null default now(),
  primary key (user_id, moment_id, resurface_on)
);

alter table public.journal_resurface_log enable row level security;
-- No client policy: only the service-role Edge Function touches this table.
