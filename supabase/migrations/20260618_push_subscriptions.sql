-- Stores each browser/device's web-push subscription, one row per endpoint.
-- The send-reminders Edge Function (service role) reads these to deliver pushes.
create table if not exists public.push_subscriptions (
  endpoint     text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  subscription jsonb not null,
  created_at   timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- Each signed-in user can only see/modify their own subscriptions.
create policy "own subscriptions" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
