-- Schedule the Kairos anniversary resurfacer once a day via pg_cron. Runs at
-- 13:00 UTC (morning across the Americas, afternoon in Europe/India) — a
-- gentle time to receive "on this day". The function's own de-dup ledger makes
-- a lagged or double run harmless.
--
-- Requires the pg_cron + pg_net extensions and the function deployed with
-- "Verify JWT" OFF. Run once in the Supabase SQL editor.
select cron.schedule(
  'kairos-resurface-daily',
  '0 13 * * *',
  $$
  select net.http_post(
    url := 'https://kqsudgkpzawyloccjtpa.supabase.co/functions/v1/send-journal-resurfacing',
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);

-- To remove the schedule:
--   select cron.unschedule('kairos-resurface-daily');
