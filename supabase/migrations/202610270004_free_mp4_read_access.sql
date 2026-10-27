-- Repair the production entitlement gate without exposing paid or unpublished lessons.
-- This migration targets the access-control schema currently deployed on Supabase.
begin;

-- The three launch episodes are intentionally free. Do not change any other titles.
update public.videos
set access_level = 'FREE'
where storage_path is not null
  and is_published = true
  and is_deleting = false
  and (
    title like '[第1回] コンピュータとは？%'
    or title = 'What Is Generative AI? | AI for Beginners – Episode 1 | WritePilot'
    or title like '[第1集] 什麼是電腦？%'
  );

create or replace function private.can_view_lesson(lesson_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.videos v
    where v.id = lesson_id
      and (
        (auth.role() = 'authenticated' and private.is_admin())
        or (
          v.is_published = true
          and v.is_deleting = false
          and (
            -- Free YouTube lessons and free MP4 lessons are public;
            -- paid MP4s are not exposed without an individual entitlement.
            (v.access_level = 'FREE' and
              ((v.brand = 'TERAKOYA' and v.youtube_id is not null)
                or v.storage_path is not null))
            or (
              auth.role() = 'authenticated'
              and private.is_member()
              and exists (
                select 1 from public.video_entitlements e
                where e.video_id = v.id and e.user_id = auth.uid()
              )
            )
          )
        )
      )
  );
$function$;

commit;
