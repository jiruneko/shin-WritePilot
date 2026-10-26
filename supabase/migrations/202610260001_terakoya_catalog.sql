begin;
-- Existing lessons remain WritePilot-only; no legacy item becomes publicly visible.
alter table public.videos
  add column brand text not null default 'WRITEPILOT'
    check (brand in ('TERAKOYA', 'WRITEPILOT')),
  add column access_level text not null default 'PAID'
    check (access_level in ('FREE', 'PAID')),
  add column category text not null default 'IT_BASIC'
    check (category in ('IT_BASIC', 'GENERATIVE_AI'));

-- Only published YouTube-sourced Terakoya lessons may be made anonymous.
-- In particular, private Supabase Storage assets are never disclosed to anon.
alter table public.videos add constraint terakoya_public_source_check check (
  not (brand = 'TERAKOYA' and access_level = 'FREE' and is_published)
  or (storage_path is null and youtube_id is not null)
);
grant select on public.videos to anon;
create policy terakoya_anon_read on public.videos for select to anon using (
  brand = 'TERAKOYA' and access_level = 'FREE'
  and is_published and not is_deleting
  and storage_path is null and youtube_id is not null
);
create index videos_terakoya_public_idx on public.videos (published_at desc)
  where brand = 'TERAKOYA' and access_level = 'FREE' and is_published and not is_deleting;
commit;
