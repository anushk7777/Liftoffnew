-- Schedule the morning CO2 nudge sender via pg_cron.
--
-- Every 5 minutes, not every minute. The window is 90 minutes long and the
-- sender's de-dup ledger makes overlapping ticks harmless, so a minute of
-- precision would buy nothing and cost 288 extra invocations a day. Five
-- minutes also divides every real UTC offset — including the 30-minute ones
-- (India, Adelaide) and the 45-minute ones (Nepal, Chatham) — so 09:30 local is
-- always a tick the cron actually lands on.
--
-- The sender allows itself CO2_CRON_GRACE_MINUTES of slack past 11:00 so that a
-- late tick still delivers the last call rather than dropping it silently. That
-- grace cannot create an extra nudge: the slot index is unchanged for the whole
-- half hour after 11:00, and the slot is part of the de-dup key.
--
-- Requires the pg_cron and pg_net extensions (Dashboard → Database →
-- Extensions) and the function deployed with "Verify JWT" OFF so the scheduled
-- (unauthenticated) call is accepted. Run once in the Supabase SQL editor.
select cron.schedule(
  'send-co2-nudge-every-5-min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://kqsudgkpzawyloccjtpa.supabase.co/functions/v1/send-co2-nudge',
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);

-- To remove the schedule:
--   select cron.unschedule('send-co2-nudge-every-5-min');
