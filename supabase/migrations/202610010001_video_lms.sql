begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, anon;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role text not null default 'USER' check (role in ('USER', 'ADMIN')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
create policy profiles_read_self on public.profiles for select to authenticated using (id = (select auth.uid()));
-- No client INSERT/UPDATE grants: neither metadata nor direct REST can promote a role.

create function private.is_member() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()));
$$;
create function private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'ADMIN');
$$;
revoke all on function private.is_member(), private.is_admin() from public;
grant execute on function private.is_member(), private.is_admin() to authenticated, anon;

create function private.sync_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email) values (new.id, coalesce(new.email, ''))
    on conflict (id) do update set email = excluded.email, updated_at = now();
  return new;
end;
$$;
revoke all on function private.sync_profile() from public;
create trigger writepilot_sync_profile after insert or update of email on auth.users for each row execute function private.sync_profile();
insert into public.profiles (id, email) select id, coalesce(email, '') from auth.users on conflict (id) do nothing;

create table public.videos (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 200),
  description text not null default '' check (length(description) <= 10000),
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.mp4$'),
  thumbnail_url text check (thumbnail_url is null or (length(thumbnail_url) <= 2048 and thumbnail_url ~ '^https://')),
  is_published boolean not null default false,
  is_deleting boolean not null default false,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index videos_published_idx on public.videos (published_at desc) where is_published and not is_deleting;
alter table public.videos enable row level security;
revoke all on public.videos from anon, authenticated;
grant select, insert, update, delete on public.videos to authenticated;
create policy videos_read on public.videos for select to authenticated using (
  (select private.is_admin()) or ((select private.is_member()) and is_published and not is_deleting)
);
create policy videos_insert on public.videos for insert to authenticated with check (
  (select private.is_admin()) and created_by = (select auth.uid()) and storage_path = auth.uid()::text || '/' || id::text || '.mp4'
);
create policy videos_update on public.videos for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy videos_delete on public.videos for delete to authenticated using ((select private.is_admin()));

create function private.video_timestamps() returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' then
    if new.id <> old.id or new.storage_path <> old.storage_path then
      raise exception 'Video identity and file path are immutable';
    end if;
    if old.is_deleting and not new.is_deleting then raise exception 'Deletion cannot be cancelled'; end if;
    new.created_at := old.created_at;
    new.published_at := old.published_at;
  else
    new.published_at := null;
  end if;
  if new.is_deleting then new.is_published := false; end if;
  if new.is_published and new.published_at is null then new.published_at := now(); end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.video_timestamps() from public;
create trigger writepilot_video_timestamps before insert or update on public.videos for each row execute function private.video_timestamps();

create function private.profile_timestamp() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
revoke all on function private.profile_timestamp() from public;
create trigger writepilot_profile_timestamp before update on public.profiles for each row execute function private.profile_timestamp();

-- This migration intentionally sets the bucket private, including an existing bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', false, 52428800, array['video/mp4'])
on conflict (id) do update set public = false, file_size_limit = 52428800, allowed_mime_types = array['video/mp4'];

create function private.can_read_video_object(object_name text) returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_admin() or (private.is_member() and exists (
    select 1 from public.videos where storage_path = object_name and is_published and not is_deleting
  ));
$$;
revoke all on function private.can_read_video_object(text) from public;
grant execute on function private.can_read_video_object(text) to authenticated, anon;

-- Restrictive guards prevent older permissive policies from exposing this bucket.
-- Helpers may be planned even in an unchosen CASE branch; anon can execute these
-- own-identity-only predicates, but CASE still denies all anonymous bucket access.
create policy writepilot_storage_read_guard on storage.objects as restrictive for select to public using (
  bucket_id <> 'videos' or case when auth.role() = 'authenticated' then private.can_read_video_object(name) else false end
);
create policy writepilot_storage_insert_guard on storage.objects as restrictive for insert to public with check (
  bucket_id <> 'videos' or case when auth.role() = 'authenticated' then
    private.is_admin() and name ~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.mp4$') else false end
);
create policy writepilot_storage_update_guard on storage.objects as restrictive for update to public using (bucket_id <> 'videos') with check (bucket_id <> 'videos');
create policy writepilot_storage_delete_guard on storage.objects as restrictive for delete to public using (
  bucket_id <> 'videos' or case when auth.role() = 'authenticated' then private.is_admin() else false end
);
create policy writepilot_storage_read on storage.objects for select to authenticated using (bucket_id = 'videos' and private.can_read_video_object(name));
create policy writepilot_storage_insert on storage.objects for insert to authenticated with check (bucket_id = 'videos' and private.is_admin());
create policy writepilot_storage_delete on storage.objects for delete to authenticated using (bucket_id = 'videos' and private.is_admin());
commit;
