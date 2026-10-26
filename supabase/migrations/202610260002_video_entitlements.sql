begin;
-- Enrollment-based access control. This migration is additive and leaves existing video data intact.
create table public.video_entitlements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (user_id, video_id)
);
alter table public.video_entitlements enable row level security;
revoke all on public.video_entitlements from public, anon, authenticated;
grant select on public.video_entitlements to authenticated;
create policy entitlement_read_self on public.video_entitlements for select to authenticated
  using (user_id = (select auth.uid()));
-- No client-side INSERT/UPDATE/DELETE: entitlements must be granted by a trusted
-- server-side payment workflow or by a database administrator.

create function private.can_view_lesson(lesson_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.videos v
    where v.id = lesson_id
      and (
        (auth.role() = 'authenticated' and private.is_admin())
        or (
          v.is_published and not v.is_deleting
          and (
            (v.brand = 'TERAKOYA' and v.access_level = 'FREE'
             and v.storage_path is null and v.youtube_id is not null)
            or (
              auth.role() = 'authenticated'
              and private.is_member()
              and exists (select 1 from public.video_entitlements e
                          where e.video_id = v.id and e.user_id = (select auth.uid()))
            )
          )
        )
      )
  );
$$;
revoke all on function private.can_view_lesson(uuid) from public;
grant execute on function private.can_view_lesson(uuid) to anon, authenticated;

drop policy if exists videos_read on public.videos;
drop policy if exists terakoya_anon_read on public.videos;
create policy videos_read_authorized on public.videos for select to authenticated
  using (private.can_view_lesson(id));
create policy videos_read_public on public.videos for select to anon
  using (private.can_view_lesson(id));

-- A signed URL must never be obtainable for paid uploads without enrollment.
create or replace function private.can_read_video_object(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.role() = 'authenticated' and exists (
    select 1 from public.videos v
    where v.storage_path = object_name and private.can_view_lesson(v.id)
  );
$$;

drop policy if exists completions_insert_self on public.video_completions;
create policy completions_insert_self on public.video_completions for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_member()
              and private.can_view_lesson(video_id));
commit;
