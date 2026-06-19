-- Schedule the send-reminders Edge Function to run every minute via pg_cron.
-- Requires the pg_cron and pg_net extensions (enable in Dashboard → Database →
-- Extensions) and the function deployed with "Verify JWT" OFF so the scheduled
-- (unauthenticated) call is accepted.
--
-- This was applied through the Supabase SQL editor during setup; kept here so
-- the schedule is reproducible and version-controlled.
select cron.schedule(
  'send-reminders-every-min',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://kqsudgkpzawyloccjtpa.supabase.co/functions/v1/send-reminders',
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);

-- To remove the schedule:
--   select cron.unschedule('send-reminders-every-min');
