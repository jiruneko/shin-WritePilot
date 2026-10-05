import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

const admin = "00000000-0000-4000-8000-000000000001";
const learner = "00000000-0000-4000-8000-000000000002";
const other = "00000000-0000-4000-8000-000000000003";
const published = "10000000-0000-4000-8000-000000000001";
const hidden = "10000000-0000-4000-8000-000000000002";
let db: PGlite;
async function asUser(sql: string, id = learner, role = "authenticated") {
  await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', $2, false)", [id, role]);
  await db.exec(`set role ${role}`);
  try { return await db.query(sql); } finally { await db.exec("reset role"); }
}
beforeAll(async () => {
  db = new PGlite();
  // Minimal Auth/Storage catalog fixture; the application migration and PostgreSQL RLS
  // execute unchanged. This does not replace testing the hosted Auth/Storage APIs.
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role', true) $$;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema public, auth, storage to authenticated, anon;
    grant all on storage.objects to authenticated, anon;
    -- Simulate a legacy, dangerously broad policy: restrictive bucket guards must win.
    create policy legacy_open on storage.objects for all to public using (true) with check (true);
    insert into auth.users (id,email) values ('${admin}','admin@example.test');
  `);
  await db.exec(readFileSync(new URL("../supabase/migrations/202610010001_video_lms.sql", import.meta.url), "utf8"));
  await db.exec(`
    update public.profiles set role = 'ADMIN' where id = '${admin}';
    insert into auth.users (id,email,raw_user_meta_data) values
      ('${learner}','learner@example.test','{"role":"ADMIN"}'), ('${other}','other@example.test','{}');
    insert into storage.objects (bucket_id,name) values ('videos','${admin}/${published}.mp4'),('videos','${admin}/${hidden}.mp4');
  `);
  await asUser(`insert into public.videos (id,title,storage_path,is_published,created_by) values
    ('${published}','公開動画','${admin}/${published}.mp4',true,'${admin}'),
    ('${hidden}','非公開動画','${admin}/${hidden}.mp4',false,'${admin}')`, admin);
}, 30000);
afterAll(async () => { await db?.close(); });

describe("migration and actual PostgreSQL RLS", () => {
  it("backfills existing accounts and ignores signup role metadata", async () => {
    const result = await asUser("select id,role from public.profiles");
    expect(result.rows).toEqual([{ id: learner, role: "USER" }]);
    expect((await asUser("select role from public.profiles", admin)).rows).toEqual([{ role: "ADMIN" }]);
  });
  it("prevents own role escalation and editing another profile", async () => {
    await expect(asUser(`update public.profiles set role='ADMIN' where id='${learner}'`)).rejects.toThrow(/permission denied/);
    await expect(asUser(`update public.profiles set display_name='forged' where id='${admin}'`)).rejects.toThrow(/permission denied/);
    await expect(asUser(`insert into public.profiles(id,email,role) values(gen_random_uuid(),'x','ADMIN')`)).rejects.toThrow(/permission denied/);
  });
  it("lets learners read only published video rows and matching storage objects", async () => {
    expect((await asUser("select id from public.videos")).rows).toEqual([{ id: published }]);
    expect((await asUser("select name from storage.objects where bucket_id='videos'")).rows).toEqual([{ name: `${admin}/${published}.mp4` }]);
    expect((await asUser(`select id from public.videos where id='${hidden}'`)).rows).toHaveLength(0);
  });
  it("rejects anonymous reads even with legacy open Storage policies", async () => {
    await expect(asUser("select * from public.videos", "", "anon")).rejects.toThrow(/permission denied/);
    expect((await asUser("select * from storage.objects where bucket_id='videos'", "", "anon")).rows).toHaveLength(0);
    await expect(asUser("insert into storage.objects(bucket_id,name) values('videos','bad.mp4')", "", "anon")).rejects.toThrow(/row-level security/);
  });
  it("blocks learner video inserts, updates, deletes and file uploads/deletes", async () => {
    await expect(asUser(`insert into public.videos(title,storage_path,created_by) values('bad','${learner}/${hidden}.mp4','${learner}')`)).rejects.toThrow(/row-level security/);
    expect((await asUser(`update public.videos set title='bad' where id='${published}' returning id`)).rows).toHaveLength(0);
    expect((await asUser(`delete from public.videos where id='${published}' returning id`)).rows).toHaveLength(0);
    await expect(asUser(`insert into storage.objects(bucket_id,name) values('videos','${learner}/${hidden}.mp4')`)).rejects.toThrow(/row-level security/);
    expect((await asUser("delete from storage.objects where bucket_id='videos' returning id")).rows).toHaveLength(0);
  });
  it("allows admin reads, uploads and metadata edits, but no file overwrite", async () => {
    expect((await asUser("select id from public.videos", admin)).rows).toHaveLength(2);
    expect((await asUser("select id from storage.objects where bucket_id='videos'", admin)).rows).toHaveLength(2);
    await asUser(`insert into storage.objects(bucket_id,name) values('videos','${admin}/10000000-0000-4000-8000-000000000099.mp4')`, admin);
    expect((await asUser(`update public.videos set title='編集済み' where id='${hidden}' returning title`, admin)).rows).toEqual([{ title: "編集済み" }]);
    expect((await asUser("update storage.objects set name='overwrite' where bucket_id='videos' returning id", admin)).rows).toHaveLength(0);
    await expect(asUser(`update public.videos set storage_path='${admin}/10000000-0000-4000-8000-000000000099.mp4' where id='${hidden}'`, admin)).rejects.toThrow(/immutable/);
  });
  it("tracks publication time and removes read access after unpublishing", async () => {
    expect((await asUser(`select published_at from public.videos where id='${published}'`)).rows[0]).toHaveProperty("published_at", expect.any(Date));
    await asUser(`update public.videos set is_published=false where id='${published}'`, admin);
    expect((await asUser("select id from public.videos")).rows).toHaveLength(0);
    expect((await asUser("select id from storage.objects where bucket_id='videos'")).rows).toHaveLength(0);
    await asUser(`update public.videos set is_published=true where id='${published}'`, admin);
  });
  it("makes deletion monotonic, hides pending rows and allows administrator cleanup", async () => {
    await asUser(`update public.videos set is_deleting=true where id='${published}'`, admin);
    expect((await asUser("select id from public.videos")).rows).toHaveLength(0);
    await expect(asUser(`update public.videos set is_deleting=false where id='${published}'`, admin)).rejects.toThrow(/cannot be cancelled/);
    await asUser(`delete from storage.objects where name='${admin}/${published}.mp4'`, admin);
    await asUser(`delete from public.videos where id='${published}'`, admin);
    expect((await asUser(`select id from public.videos where id='${published}'`, admin)).rows).toHaveLength(0);
  });
  it("cascades profiles on account deletion and denies stale JWT access", async () => {
    await asUser(`update public.videos set is_published=true where id='${hidden}'`, admin);
    await db.exec(`delete from auth.users where id='${other}'`);
    expect((await asUser("select * from public.profiles", other)).rows).toHaveLength(0);
    expect((await asUser("select * from public.videos", other)).rows).toHaveLength(0);
    expect((await asUser("select * from storage.objects where bucket_id='videos'", other)).rows).toHaveLength(0);
  });
  it("synchronizes email without resetting admin role", async () => {
    await db.exec(`update auth.users set email='changed@example.test' where id='${admin}'`);
    expect((await asUser("select email,role from public.profiles", admin)).rows).toEqual([{ email: "changed@example.test", role: "ADMIN" }]);
    expect((await db.query("select public,file_size_limit,allowed_mime_types from storage.buckets where id='videos'")).rows[0]).toMatchObject({ public: false, file_size_limit: 52428800, allowed_mime_types: ["video/mp4"] });
  });
});
