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
