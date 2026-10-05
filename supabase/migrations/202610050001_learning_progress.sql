begin;

-- Reuse the existing video catalogue for both uploaded and sample lessons.
alter table public.videos alter column storage_path drop not null;
alter table public.videos add column youtube_id text;
alter table public.videos add column is_sample boolean not null default false;
alter table public.videos add constraint videos_source_check check (
  (storage_path is not null and youtube_id is null and not is_sample)
  or (storage_path is null and youtube_id is not null and youtube_id ~ '^[A-Za-z0-9_-]{11}$' and is_sample)
);
-- Null-safe identity checks also protect the new source columns.
create function private.video_source_immutable() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.storage_path is distinct from old.storage_path
    or new.youtube_id is distinct from old.youtube_id
    or new.is_sample is distinct from old.is_sample then
    raise exception 'Video source is immutable';
  end if;
  return new;
end;
$$;
revoke all on function private.video_source_immutable() from public;
create trigger writepilot_video_source_immutable before update on public.videos
  for each row execute function private.video_source_immutable();

create table public.video_completions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, video_id)
);
alter table public.video_completions enable row level security;
revoke all on public.video_completions from public, anon, authenticated;
-- Completion is append-only; ON CONFLICT DO NOTHING makes retries idempotent.
grant select, insert on public.video_completions to authenticated;
create policy completions_read_self on public.video_completions for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_member()));
create policy completions_insert_self on public.video_completions for insert to authenticated
  with check (
    user_id = (select auth.uid()) and (select private.is_member()) and exists (
      select 1 from public.videos v where v.id = video_id and v.is_published and not v.is_deleting
    )
  );
commit;
