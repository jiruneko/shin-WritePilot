-- Verify only an authenticated ADMIN's own uploaded MP4.
-- This avoids Storage API SELECT permission differences for object metadata lookup.
-- No Storage object data or private URLs are returned.
create or replace function public.writepilot_admin_video_exists(video_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'ADMIN'
    )
    and exists (
      select 1 from storage.objects o
      where o.bucket_id = 'videos'
        and o.name = (select auth.uid())::text || '/' || video_id::text || '.mp4'
    );
$$;
revoke all on function public.writepilot_admin_video_exists(uuid) from public;
revoke all on function public.writepilot_admin_video_exists(uuid) from anon;
grant execute on function public.writepilot_admin_video_exists(uuid) to authenticated;
