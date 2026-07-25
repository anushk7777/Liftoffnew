-- ===========================================================================
-- One-off cleanup: remove workspace data that leaked onto a second account.
--
-- Context. Before the per-account isolation fix, every workspace kept an
-- offline copy in localStorage that was not scoped to an account. Signing a
-- second Google account into the same browser folded the first account's data
-- into it, and the next save uploaded that into the SECOND account's cloud row.
--
-- The code fix stops further contamination. It cannot undo an upload that has
-- already happened: the row now belongs to the second account, and nothing in
-- the data marks which parts came from someone else. That has to be deleted
-- here, by hand.
--
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor).
-- Work through the steps in order. Do NOT skip step 3 — read before deleting.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- STEP 1. Confirm RLS is actually switched on for every table.
--
-- The policies live in supabase/migrations/, but a migration that was never
-- applied leaves a table wide open. Every row below must read rowsecurity = t.
-- Anything showing f is a real exposure and needs its migration applied.
-- ---------------------------------------------------------------------------
select tablename, rowsecurity as rls_enabled
from pg_tables
where schemaname = 'public'
  and tablename in (
    'user_data', 'journal_data', 'workout_data', 'push_subscriptions',
    'coaching_clients', 'coaching_metrics', 'coaching_plans', 'coaching_messages'
  )
order by tablename;

-- Each table should also list at least one policy here.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;


-- ---------------------------------------------------------------------------
-- STEP 2. Identify the accounts. Note the id of the SECOND account — the one
-- that should never have held your data. That id is used in steps 3 and 4.
-- ---------------------------------------------------------------------------
select id, email, created_at, last_sign_in_at
from auth.users
order by created_at;


-- ---------------------------------------------------------------------------
-- STEP 3. Look before you delete. Check what each account's rows actually hold,
-- so you delete a contaminated row and not a real one.
--
-- A second account that only ever existed to test the client portal should have
-- no moments, no roadmap phases and no tasks. Anything above zero there is data
-- that leaked across.
-- ---------------------------------------------------------------------------
select
  u.email,
  jsonb_array_length(coalesce(j.data -> 'moments', '[]'::jsonb)) as diary_moments,
  j.updated_at
from public.journal_data j
join auth.users u on u.id = j.id
order by u.email;

select
  u.email,
  jsonb_array_length(coalesce(d.data -> 'tasks', '[]'::jsonb))  as tasks,
  jsonb_array_length(coalesce(d.data -> 'phases', '[]'::jsonb)) as roadmap_phases,
  jsonb_array_length(coalesce(d.data -> 'notes', '[]'::jsonb))  as notes,
  d.updated_at
from public.user_data d
join auth.users u on u.id::text = d.id
order by u.email;

select
  u.email,
  jsonb_array_length(coalesce(w.data -> 'sessions', '[]'::jsonb)) as logged_sessions,
  w.updated_at
from public.workout_data w
join auth.users u on u.id = w.id
order by u.email;


-- ---------------------------------------------------------------------------
-- STEP 4. Delete the second account's rows.
--
-- Replace SECOND_ACCOUNT_UUID (both forms) with the id from step 2. Deleting
-- these rows costs that account nothing it should have had — the next sign-in
-- simply starts it on a blank workspace.
--
-- Uncomment to run.
-- ---------------------------------------------------------------------------
-- delete from public.journal_data where id = 'SECOND_ACCOUNT_UUID'::uuid;
-- delete from public.workout_data where id = 'SECOND_ACCOUNT_UUID'::uuid;
-- delete from public.user_data    where id = 'SECOND_ACCOUNT_UUID';        -- id is text here


-- ---------------------------------------------------------------------------
-- STEP 5. Diary photos are files, not rows — deleting journal_data leaves them
-- behind. They are stored under a folder named for the account id.
--
-- Check first:
select name, created_at
from storage.objects
where bucket_id = 'journal-photos'
  and (storage.foldername(name))[1] = 'SECOND_ACCOUNT_UUID';

-- Then remove, once the list above looks right:
-- delete from storage.objects
-- where bucket_id = 'journal-photos'
--   and (storage.foldername(name))[1] = 'SECOND_ACCOUNT_UUID';


-- ---------------------------------------------------------------------------
-- STEP 6. Clear the browser copy too, or the next save re-uploads it.
--
-- In the browser where the second account was signed in:
--   DevTools -> Application -> Storage -> Clear site data
-- or, in the console:
--   localStorage.clear(); location.reload();
--
-- After the fix is deployed, signing out through the account menu does this
-- for you. Do it by hand for any browser that was used before the fix landed.
-- ===========================================================================
