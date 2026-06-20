-- De-duplication ledger for background push reminders. The send-reminders Edge
-- Function records every (user, task, scheduled time) it has already pushed, so
-- a wider catch-up window can re-scan recent tasks without ever double-sending,
-- and a reminder is never silently dropped when a cron tick runs late.
-- Run once in the Supabase SQL editor (same project).
create table if not exists public.reminder_log (
  user_id      uuid not null references auth.users(id) on delete cascade,
  task_id      text not null,
  scheduled_at timestamptz not null,
  sent_at      timestamptz not null default now(),
  primary key (user_id, task_id, scheduled_at)
);

-- Only the Edge Function (service role) touches this table; lock out clients.
alter table public.reminder_log enable row level security;

-- Housekeeping: let the function prune rows older than a day cheaply.
create index if not exists reminder_log_sent_at_idx on public.reminder_log (sent_at);
