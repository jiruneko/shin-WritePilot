import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const admin = "00000000-0000-4000-8000-000000000001";
const learner = "00000000-0000-4000-8000-000000000002";
const other = "00000000-0000-4000-8000-000000000003";
const paid = "10000000-0000-4000-8000-000000000001";
const free = "10000000-0000-4000-8000-000000000002";
let db: PGlite;
async function asUser(sql: string, id = learner, role = "authenticated") {
  await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.role',$2,false)", [id,role]);
  await db.exec(`set role ${role}`);
  try { return await db.query(sql); } finally { await db.exec("reset role"); }
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema public,auth,storage to authenticated,anon;
    grant all on storage.objects to authenticated,anon;
    create policy legacy_open on storage.objects for all to public using(true) with check(true);
    insert into auth.users(id,email) values
      ('${admin}','admin@example.test'),('${learner}','learner@example.test'),('${other}','other@example.test');
  `);
  for (const file of ["202610010001_video_lms.sql","202610050001_learning_progress.sql","202610260001_terakoya_catalog.sql","202610260002_video_entitlements.sql"]) {
    await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`,import.meta.url),"utf8"));
  }
  await db.exec(`update public.profiles set role='ADMIN' where id='${admin}'`);
  await asUser(`insert into public.videos(id,title,storage_path,is_published,created_by)
    values('${paid}','Paid','${admin}/${paid}.mp4',true,'${admin}')`,admin);
  await db.exec(`insert into public.videos(id,title,storage_path,youtube_id,is_sample,is_published,brand,access_level,category,created_by)
    values('${free}','Free',null,'dQw4w9WgXcQ',true,true,'TERAKOYA','FREE','GENERATIVE_AI','${admin}')`);
  await db.exec(`insert into storage.objects(bucket_id,name) values('videos','${admin}/${paid}.mp4')`);
},30000);
afterAll(async()=>{await db?.close();});
describe("free and paid access control",()=>{
  it("allows anonymous access only to published YouTube Terakoya",async()=>{
    expect((await asUser("select title from public.videos","","anon")).rows).toEqual([{title:"Free"}]);
    expect((await asUser("select name from storage.objects where bucket_id='videos'","","anon")).rows).toHaveLength(0);
  });
  it("keeps paid videos inaccessible without a grant",async()=>{
    expect((await asUser("select title from public.videos")).rows).toEqual([{title:"Free"}]);
    expect((await asUser("select name from storage.objects where bucket_id='videos'")).rows).toHaveLength(0);
  });
  it("grants only one user's paid video and related storage access",async()=>{
    await db.exec(`insert into public.video_entitlements(user_id,video_id) values('${learner}','${paid}')`);
    expect((await asUser("select title from public.videos order by title")).rows).toEqual([{title:"Free"},{title:"Paid"}]);
    expect((await asUser("select name from storage.objects where bucket_id='videos'")).rows).toHaveLength(1);
    expect((await asUser("select title from public.videos",other)).rows).toEqual([{title:"Free"}]);
    expect((await asUser("select name from storage.objects where bucket_id='videos'",other)).rows).toHaveLength(0);
    await expect(asUser(`insert into public.video_entitlements(user_id,video_id) values('${other}','${paid}')`,other)).rejects.toThrow(/permission denied/);
  });
  it("revocation blocks video and storage reads",async()=>{
    await db.exec(`delete from public.video_entitlements where user_id='${learner}' and video_id='${paid}'`);
    expect((await asUser("select title from public.videos")).rows).toEqual([{title:"Free"}]);
    expect((await asUser("select name from storage.objects where bucket_id='videos'")).rows).toHaveLength(0);
  });
});
