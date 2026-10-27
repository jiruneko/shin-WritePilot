-- Public thumbnail images are intentionally readable by all learners.
-- Writes remain restricted to authenticated ADMIN accounts.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('video-thumbnails', 'video-thumbnails', true, 5242880,
  array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

create policy writepilot_thumbnail_admin_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'video-thumbnails'
  and (select private.is_admin())
  and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\\.(jpg|png|webp)$')
);

create policy writepilot_thumbnail_public_read on storage.objects
for select to public using (bucket_id = 'video-thumbnails');

-- No update/delete permissions are granted: use new immutable object paths on replacement.
-- Private videos bucket policies are unchanged.
