-- ===========================================================================
-- Make deleting an account actually delete its workspace.
--
-- journal_data and workout_data both declare
--   id uuid primary key references auth.users(id) on delete cascade
-- so removing a user removes their diary and training log with it.
--
-- user_data does not. Its id is a bare `text primary key` with no foreign key,
-- so deleting the account leaves the row — tasks, roadmap, notes, habits,
-- focus sessions — orphaned in the table forever. No one else can read it (a
-- new account gets a fresh uuid, and RLS blocks it regardless), but it should
-- not outlive the account it belongs to.
--
-- This aligns user_data with the other two. Run it in the Supabase SQL editor
-- AFTER cleanup_crossaccount_data.sql — the foreign key cannot be added while
-- rows point at users that no longer exist.
-- ===========================================================================

-- 1. Show what is about to be removed: rows whose owner is already gone, or
--    whose id was never a uuid at all (pre-auth local ids, device ids, …).
select id, updated_at,
       case
         when id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
           then 'not a uuid'
         else 'no such account'
       end as reason
from public.user_data
where id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   or id::uuid not in (select id from auth.users);

-- 2. Delete them. Review step 1 first — this is not reversible.
delete from public.user_data
where id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   or id::uuid not in (select id from auth.users);

-- 3. Convert the key to uuid and tie it to the account.
alter table public.user_data
  alter column id type uuid using id::uuid;

alter table public.user_data
  drop constraint if exists user_data_id_fkey;

alter table public.user_data
  add constraint user_data_id_fkey
  foreign key (id) references auth.users (id) on delete cascade;

-- 4. The policy compared auth.uid()::text to a text column. Now that id is a
--    uuid the cast is gone; the rule itself is unchanged.
drop policy if exists "own user data" on public.user_data;
create policy "own user data" on public.user_data
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- The client needs no change: it sends session.user.id, which PostgREST
-- coerces to uuid on the way in and returns as a string on the way out.
