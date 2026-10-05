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
  await db.exec(readFileSync(new URL("../supabase/migrations/202610050001_learning_progress.sql", import.meta.url), "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });


const sample = "51000000-0000-4000-8000-000000000001";
const seed = readFileSync(new URL("../supabase/seeds/sample_lessons.sql", import.meta.url), "utf8");
const insertCompletion = (user = learner, video = published) => `insert into public.video_completions(user_id,video_id) values('${user}','${video}') on conflict(user_id,video_id) do nothing`;

describe("learning migration with real PostgreSQL RLS", () => {
  it("seeds three samples idempotently without overwriting admin edits", async () => {
    await db.exec(seed);
    await asUser(`update public.videos set title='編集したサンプル' where id='${sample}'`, admin);
    await db.exec(seed);
    expect((await asUser("select id from public.videos where is_sample")).rows).toHaveLength(3);
    expect((await asUser(`select title,storage_path from public.videos where id='${sample}'`)).rows).toEqual([{ title: "編集したサンプル", storage_path: null }]);
  });
  it("stores completion once across retries and fresh auth contexts", async () => {
    await asUser(insertCompletion());
    const original = (await asUser("select * from public.video_completions")).rows;
    await asUser(insertCompletion());
    await expect(asUser("select * from public.video_completions", "", "anon")).rejects.toThrow(/permission denied/);
    expect((await asUser("select * from public.video_completions")).rows).toEqual(original);
    expect(original).toHaveLength(1);
    // Reopen PostgreSQL from its persisted files, not application/UI state.
    const snapshot = await db.dumpDataDir();
    await db.close();
    db = new PGlite({ loadDataDir: snapshot });
    expect((await asUser("select * from public.video_completions")).rows).toEqual(original);
  });
  it("isolates two learners and even administrators", async () => {
    expect((await asUser("select * from public.video_completions", other)).rows).toHaveLength(0);
    expect((await asUser("select * from public.video_completions", admin)).rows).toHaveLength(0);
    await expect(asUser(insertCompletion(other))).rejects.toThrow(/row-level security/);
    await expect(asUser(`update public.video_completions set user_id='${other}'`)).rejects.toThrow(/permission denied/);
    await expect(asUser("delete from public.video_completions")).rejects.toThrow(/permission denied/);
    await asUser(insertCompletion(other), other);
    expect((await asUser("select user_id from public.video_completions", other)).rows).toEqual([{ user_id: other }]);
    expect((await asUser("select user_id from public.video_completions")).rows).toEqual([{ user_id: learner }]);
  });
  it("rejects hidden, nonexistent and deleting lessons, including for admins", async () => {
    await expect(asUser(insertCompletion(learner, hidden))).rejects.toThrow(/row-level security/);
    await expect(asUser(insertCompletion(admin, hidden), admin)).rejects.toThrow(/row-level security/);
    await expect(asUser(insertCompletion(learner, "99000000-0000-4000-8000-000000000099"))).rejects.toThrow();
    await asUser(`update public.videos set is_deleting=true where id='${hidden}'`, admin);
    await expect(asUser(insertCompletion(learner, hidden))).rejects.toThrow(/row-level security/);
  });
  it("accepts sample completion and preserves it when unpublished", async () => {
    await asUser(insertCompletion(learner, sample));
    await asUser(`update public.videos set is_published=false where id='${sample}'`, admin);
    expect((await asUser(`select * from public.video_completions where video_id='${sample}'`)).rows).toHaveLength(1);
    expect((await asUser(`select id from public.videos where id='${sample}'`)).rows).toHaveLength(0);
    await asUser(`update public.videos set is_published=true where id='${sample}'`, admin);
  });
  it("rejects invalid sample sources and changing an existing source", async () => {
    await expect(db.exec("insert into public.videos(title,youtube_id,is_sample) values('bad','https://evil.test',true)")).rejects.toThrow(/check constraint/);
    await expect(asUser(`update public.videos set youtube_id='12345678901' where id='${sample}'`, admin)).rejects.toThrow(/immutable/);
  });
  it("cascades completion on lesson and account deletion; stale sessions cannot write", async () => {
    await asUser(`delete from public.videos where id='${sample}'`, admin);
    expect((await asUser(`select * from public.video_completions where video_id='${sample}'`)).rows).toHaveLength(0);
    await db.exec(`delete from auth.users where id='${other}'`);
    expect((await db.query(`select * from public.video_completions where user_id='${other}'`)).rows).toHaveLength(0);
    await expect(asUser(insertCompletion(other), other)).rejects.toThrow(/row-level security/);
  });
});
