-- Liftoff Afterburn cloud sync. One row per user holding the workout program +
-- logged sessions as JSON, mirroring the productivity app's user_data table.
-- Run once in the Supabase SQL editor (same project). The client syncs to this
-- table from src/afterburn/store.ts; it degrades to local-only until this runs.
create table if not exists public.workout_data (
  id         uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.workout_data enable row level security;

-- Each user can only read/write their own row.
create policy "own workout data" on public.workout_data
  for all using (auth.uid() = id) with check (auth.uid() = id);
