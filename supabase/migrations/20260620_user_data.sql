-- Productivity app cloud sync. One row per signed-in account holding the whole
-- persisted store (tasks, roadmap, habits, focus sessions, …) as JSON. This
-- codifies the table + RLS the app already relies on (src/store/useStore.ts
-- upserts { id: session.user.id } and reads .eq('id', session.user.id)).
-- `create ... if not exists` makes this safe to run even if the table is live.
create table if not exists public.user_data (
  id         text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

-- Each account can only read/write its own row. id stores auth.uid() as text.
drop policy if exists "own user data" on public.user_data;
create policy "own user data" on public.user_data
  for all using (auth.uid()::text = id) with check (auth.uid()::text = id);
