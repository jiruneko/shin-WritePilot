begin;

-- Paid playback must use a private bucket and the existing object-level guard.
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'videos' and not public) then
    raise exception 'WritePilot videos bucket must be private';
  end if;
end;
$$;

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(btrim(title)) between 1 and 200),
  syllabus_version text not null,
  published_at timestamptz
);

create table public.course_lessons (
  course_id uuid not null references public.courses(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  position integer not null check (position > 0),
  primary key (course_id, video_id),
  unique (course_id, position)
);

create index course_lessons_video_id_idx on public.course_lessons(video_id);

create table public.course_entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  granted_at timestamptz not null default now(),
  expires_at timestamptz check (expires_at > granted_at),
  revoked_at timestamptz,
  primary key (user_id, course_id)
);

create index course_entitlements_course_id_idx on public.course_entitlements(course_id);

alter table public.courses enable row level security;
alter table public.course_lessons enable row level security;
alter table public.course_entitlements enable row level security;

revoke all on public.courses, public.course_lessons, public.course_entitlements from public, anon, authenticated;
grant select on public.courses, public.course_lessons to anon, authenticated;
grant select on public.course_entitlements to authenticated;
grant select, insert, update, delete on public.courses, public.course_lessons, public.course_entitlements to service_role;

create policy courses_read_published on public.courses for select to anon, authenticated
  using (published_at <= now());

create policy course_lessons_read_visible on public.course_lessons for select to anon, authenticated
  using (
    exists (select 1 from public.courses c where c.id = course_id)
    and exists (select 1 from public.videos v where v.id = video_id and v.is_published and not v.is_deleting)
  );

create policy course_entitlements_read_own on public.course_entitlements for select to authenticated
  using (user_id = (select auth.uid()));

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
          v.is_published
          and not v.is_deleting
          and (
            (v.access_level = 'FREE' and
              ((v.brand = 'TERAKOYA' and v.youtube_id is not null)
                or v.storage_path is not null))
            or (
              auth.role() = 'authenticated'
              and private.is_member()
              and (
                exists (
                  select 1 from public.video_entitlements e
                  where e.video_id = v.id and e.user_id = auth.uid()
                )
                or (
                  v.access_level = 'PAID'
                  and v.storage_path is not null
                  and exists (
                    select 1 from public.course_lessons cl
                    join public.courses c on c.id = cl.course_id
                    join public.course_entitlements e on e.course_id = c.id
                    where cl.video_id = v.id
                      and c.published_at <= now()
                      and e.user_id = auth.uid()
                      and e.granted_at <= now()
                      and e.revoked_at is null
                      and (e.expires_at is null or e.expires_at > now())
                  )
                )
              )
            )
          )
        )
      )
  );
$function$;

create or replace function private.can_read_video_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.videos v
    where v.storage_path = object_name and private.can_view_lesson(v.id)
  );
$function$;

grant usage on schema private to anon;
grant execute on function private.can_read_video_object(text) to anon;
alter policy writepilot_storage_read_guard on storage.objects
  using (bucket_id <> 'videos' or private.can_read_video_object(name));
alter policy writepilot_storage_read on storage.objects to anon, authenticated;

commit;
