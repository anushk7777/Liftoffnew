-- =========================================================================
-- LIFTOFF COACHING — run this once in the Supabase SQL editor.
-- Creates the coach↔client tables with row-level security so that:
--   • the coach account (COACH email below) sees and manages everything
--   • each client sees ONLY their own row, metrics, and plan
-- Also enables realtime so plan updates appear live on the client's page.
-- =========================================================================

-- The coach's Google account. Change here if the coach email ever changes.
create or replace function public.is_coach()
returns boolean
language sql stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'anushkdua2508@gmail.com'
$$;

-- ---- Clients roster -----------------------------------------------------
create table if not exists public.coaching_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  user_id uuid unique references auth.users (id),
  created_at timestamptz not null default now()
);

-- ---- Body measurements (client-entered) ---------------------------------
create table if not exists public.coaching_metrics (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.coaching_clients (id) on delete cascade,
  taken_on date not null default current_date,
  weight_kg numeric,
  height_cm numeric,
  chest_cm numeric,
  waist_cm numeric,
  hips_cm numeric,
  arm_cm numeric,
  thigh_cm numeric,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists coaching_metrics_client_date
  on public.coaching_metrics (client_id, taken_on);

-- ---- Plan (coach-authored: diet + targets) ------------------------------
create table if not exists public.coaching_plans (
  client_id uuid primary key references public.coaching_clients (id) on delete cascade,
  diet_plan text not null default '',
  calorie_target int,
  protein_target int,
  updated_at timestamptz not null default now()
);

-- ---- Row-level security -------------------------------------------------
alter table public.coaching_clients enable row level security;
alter table public.coaching_metrics enable row level security;
alter table public.coaching_plans   enable row level security;

-- Coach: full control of everything.
drop policy if exists coach_all_clients on public.coaching_clients;
create policy coach_all_clients on public.coaching_clients
  for all using (public.is_coach()) with check (public.is_coach());

drop policy if exists coach_all_metrics on public.coaching_metrics;
create policy coach_all_metrics on public.coaching_metrics
  for all using (public.is_coach()) with check (public.is_coach());

drop policy if exists coach_all_plans on public.coaching_plans;
create policy coach_all_plans on public.coaching_plans
  for all using (public.is_coach()) with check (public.is_coach());

-- Client: may read their own roster row (matched by login email or claimed id).
drop policy if exists client_read_self on public.coaching_clients;
create policy client_read_self on public.coaching_clients
  for select using (
    email = coalesce(auth.jwt() ->> 'email', '') or user_id = auth.uid()
  );

-- Client: first Google sign-in "claims" their row (writes their user id).
drop policy if exists client_claim_self on public.coaching_clients;
create policy client_claim_self on public.coaching_clients
  for update using (email = coalesce(auth.jwt() ->> 'email', ''))
  with check (email = coalesce(auth.jwt() ->> 'email', ''));

-- Client: read + add their own measurements.
drop policy if exists client_read_metrics on public.coaching_metrics;
create policy client_read_metrics on public.coaching_metrics
  for select using (
    client_id in (select id from public.coaching_clients where user_id = auth.uid())
  );

drop policy if exists client_insert_metrics on public.coaching_metrics;
create policy client_insert_metrics on public.coaching_metrics
  for insert with check (
    client_id in (select id from public.coaching_clients where user_id = auth.uid())
  );

-- Client: read their own plan (only the coach can write it).
drop policy if exists client_read_plan on public.coaching_plans;
create policy client_read_plan on public.coaching_plans
  for select using (
    client_id in (select id from public.coaching_clients where user_id = auth.uid())
  );

-- ---- Live updates: plan/metrics changes stream to open pages ------------
do $$ begin
  alter publication supabase_realtime add table public.coaching_plans;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.coaching_metrics;
exception when duplicate_object then null; end $$;

-- =========================================================================
-- v2 — profile fields, messaging, and notification tokens.
-- Safe to re-run: everything below is idempotent.
-- =========================================================================

-- ---- One-time profile details (asked once, edited in Profile) ------------
alter table public.coaching_clients add column if not exists height_cm numeric;
alter table public.coaching_clients add column if not exists birth_year int;
alter table public.coaching_clients add column if not exists sex text;
alter table public.coaching_clients add column if not exists goal text;

-- Height lives on the profile now, not on every check-in.
alter table public.coaching_metrics alter column height_cm drop not null;

-- ---- Coach ↔ client thread (requests, notes, replies) --------------------
create table if not exists public.coaching_messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.coaching_clients (id) on delete cascade,
  -- 'client' | 'coach'
  author text not null check (author in ('client', 'coach')),
  -- 'note' for free text, 'request' when the client asks for a diet plan
  kind text not null default 'note' check (kind in ('note', 'request')),
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists coaching_messages_client_created
  on public.coaching_messages (client_id, created_at);

alter table public.coaching_messages enable row level security;

drop policy if exists coach_all_messages on public.coaching_messages;
create policy coach_all_messages on public.coaching_messages
  for all using (public.is_coach()) with check (public.is_coach());

drop policy if exists client_read_messages on public.coaching_messages;
create policy client_read_messages on public.coaching_messages
  for select using (
    client_id in (select id from public.coaching_clients where user_id = auth.uid())
  );

-- Clients may only post as themselves.
drop policy if exists client_write_messages on public.coaching_messages;
create policy client_write_messages on public.coaching_messages
  for insert with check (
    author = 'client'
    and client_id in (select id from public.coaching_clients where user_id = auth.uid())
  );

-- Clients may update their own profile fields (height/age/goal).
drop policy if exists client_update_profile on public.coaching_clients;
create policy client_update_profile on public.coaching_clients
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$ begin
  alter publication supabase_realtime add table public.coaching_messages;
exception when duplicate_object then null; end $$;

-- =========================================================================
-- v3 — progress photos, unread tracking, check-in reminders.
-- Safe to re-run.
-- =========================================================================

-- ---- Progress photos: store object paths on the check-in row -------------
alter table public.coaching_metrics add column if not exists photo_front text;
alter table public.coaching_metrics add column if not exists photo_side text;

-- Private bucket for client progress photos.
insert into storage.buckets (id, name, public)
values ('coaching-photos', 'coaching-photos', false)
on conflict (id) do nothing;

-- Photos are stored at "<client_id>/<filename>". A client may manage files in
-- their own folder; the coach may read every file in the bucket.
drop policy if exists coaching_photos_client_rw on storage.objects;
create policy coaching_photos_client_rw on storage.objects
  for all
  using (
    bucket_id = 'coaching-photos'
    and (storage.foldername(name))[1] in (
      select id::text from public.coaching_clients where user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'coaching-photos'
    and (storage.foldername(name))[1] in (
      select id::text from public.coaching_clients where user_id = auth.uid()
    )
  );

drop policy if exists coaching_photos_coach_read on storage.objects;
create policy coaching_photos_coach_read on storage.objects
  for select using (bucket_id = 'coaching-photos' and public.is_coach());

-- ---- Unread tracking: let each side mark the other's messages read -------
-- Coach already has full access. Clients may flip read_at on coach messages
-- addressed to them (used to clear their own unread badge).
drop policy if exists client_mark_read on public.coaching_messages;
create policy client_mark_read on public.coaching_messages
  for update using (
    client_id in (select id from public.coaching_clients where user_id = auth.uid())
  )
  with check (
    client_id in (select id from public.coaching_clients where user_id = auth.uid())
  );

-- ---- Reminder preference -------------------------------------------------
alter table public.coaching_clients
  add column if not exists reminders_enabled boolean not null default true;
alter table public.coaching_clients
  add column if not exists last_reminded_at timestamptz;

-- =========================================================================
-- v4 — check-in scheduling.
-- Weight is logged daily; measurements/photos follow a coach-set cadence.
-- Safe to re-run.
-- =========================================================================

-- 0 = Sunday … 6 = Saturday. Defaults to Monday measurements, weekly.
alter table public.coaching_clients
  add column if not exists measure_weekday int not null default 1;
alter table public.coaching_clients
  add column if not exists measure_cadence text not null default 'weekly'
  check (measure_cadence in ('weekly', 'biweekly'));
-- Anchor for biweekly cycles: the first scheduled measurement date.
alter table public.coaching_clients
  add column if not exists measure_anchor date;
-- Whether the daily weight log is expected at all.
alter table public.coaching_clients
  add column if not exists daily_weight boolean not null default true;
