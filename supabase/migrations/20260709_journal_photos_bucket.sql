-- Kairos moment photos → Supabase Storage (instead of base64 in the JSON row).
-- Creates a PRIVATE bucket and per-user RLS so each user can only read/write
-- objects under their own folder ("<user_id>/<moment_id>.jpg"). Run once in the
-- Supabase SQL editor. Until this runs, photos gracefully fall back to being
-- stored inline in journal_data (still saved, just heavier).

-- 1. The private bucket.
insert into storage.buckets (id, name, public)
values ('journal-photos', 'journal-photos', false)
on conflict (id) do nothing;

-- 2. Per-user access: the first path segment must equal the user's id.
create policy "kairos read own photos"
  on storage.objects for select
  using (bucket_id = 'journal-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "kairos insert own photos"
  on storage.objects for insert
  with check (bucket_id = 'journal-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "kairos update own photos"
  on storage.objects for update
  using (bucket_id = 'journal-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "kairos delete own photos"
  on storage.objects for delete
  using (bucket_id = 'journal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
