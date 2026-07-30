-- Backend for the morning CO2 nudge delivered to a CLOSED app.
-- Run once in the Supabase SQL editor (same project). Safe to re-run.
--
-- Two things the sender needs that the existing push tables do not carry:
--
--   1. WHERE the device is. The nudge fires at 09:30 *local*, and the sender
--      runs on UTC — so it cannot know when to send without an IANA zone. It is
--      stored per subscription rather than per user on purpose: the phone is the
--      thing that buzzes, and a phone that flies to another country should start
--      nudging on the new local morning. src/lib/push.ts writes it on subscribe
--      and refreshes it on every app open, so travel corrects itself.
--
--   2. WHAT has already been sent, so a cron tick that runs twice, or runs late
--      and overlaps the next one, cannot buzz the same half-hour slot twice.

alter table public.push_subscriptions
  add column if not exists time_zone text;

-- De-duplication ledger, one row per (user, zone, local day, slot).
--
-- The zone is part of the key, not decoration: two devices in different
-- countries are in genuinely different mornings, and keying on the day alone
-- would let the first one to fire silence the second for the rest of the day.
create table if not exists public.co2_nudge_log (
  user_id   uuid not null references auth.users(id) on delete cascade,
  time_zone text not null,
  local_day text not null,          -- yyyy-mm-dd as read in time_zone
  slot      smallint not null,      -- 0..3 across the 09:30-11:00 window
  sent_at   timestamptz not null default now(),
  primary key (user_id, time_zone, local_day, slot)
);

-- Only the Edge Function (service role) touches this table; lock out clients.
alter table public.co2_nudge_log enable row level security;

-- Housekeeping: let the function prune old rows cheaply.
create index if not exists co2_nudge_log_sent_at_idx on public.co2_nudge_log (sent_at);
