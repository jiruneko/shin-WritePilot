import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const admin = "00000000-0000-4000-8000-000000000001";
const learner = "00000000-0000-4000-8000-000000000002";
const free = "52fb387f-e7b5-4b74-9b7e-264cd644d86d";
const paid = "10000000-0000-4000-8000-000000000002";
const hidden = "10000000-0000-4000-8000-000000000003";
const delta = readFileSync(new URL("../supabase/release/meet_taipei_delta.sql", import.meta.url), "utf8");
async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth; create schema private; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
    create function private.is_admin() returns boolean language sql stable as $$ select auth.uid()='${admin}'::uuid $$;
    create function private.is_member() returns boolean language sql stable as $$ select auth.uid() is not null $$;
    create table public.videos (
      id uuid primary key, title text not null, brand text not null default 'WRITEPILOT',
      access_level text not null default 'PAID', youtube_id text, storage_path text,
      is_published boolean not null default false, is_deleting boolean not null default false
    );
    create table public.video_entitlements(video_id uuid, user_id uuid);
    insert into public.videos(id,title,storage_path,is_published) values
      ('${free}','[第1回] コンピュータとは？基礎入門','file.mp4',true),
      ('${paid}','Premium course','paid.mp4',true),
      ('${hidden}','Hidden course','hidden.mp4',false);
    create function private.can_view_lesson(uuid) returns boolean language sql as $$ select false $$;
    alter table public.videos enable row level security;
    grant usage on schema public, auth, private to authenticated, anon;
    grant select on public.videos to authenticated, anon;
    create policy videos_read_authorized on public.videos for select to authenticated
      using (private.can_view_lesson(id));
    create policy videos_read_public on public.videos for select to anon
      using (private.can_view_lesson(id));
  `);
  await db.exec(readFileSync(new URL("../supabase/migrations/202610270004_free_mp4_read_access.sql", import.meta.url), "utf8"));
  await db.query("update public.videos set title = $1 where id = $2", [
    "【第1回】 コンピュータとは？仕組みをゼロから学ぼう！ | IT's てらこや", free,
  ]);
  await db.exec(readFileSync(new URL("../supabase/migrations/202611100001_video_comprehension_quiz.sql", import.meta.url), "utf8"));
  await db.exec(`insert into auth.users values ('${learner}'), ('${admin}')`);
  await db.exec("delete from private.video_quizzes");
  return db;
}

describe("reviewed production delta", () => {
 it("preserves lessons/entitlements and saves all four scores with user isolation", async () => {
  const db=await fixture();
  try {
   const before=(await db.query("select * from public.videos order by id")).rows;
   await db.exec(delta);
   expect((await db.query("select * from public.videos order by id")).rows).toEqual(before);
   expect((await db.query("select * from public.video_entitlements")).rows).toHaveLength(0);
   expect((await db.query("select jsonb_array_length(questions) n from private.video_quizzes")).rows).toEqual([{n:3}]);
   await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[learner]);
   await db.exec("set role authenticated");
   for (const [i,answers] of [[0,[0,0,1]],[1,[1,0,1]],[2,[1,0,0]],[3,[1,2,0]]] as const) {
    const r=await db.query<{result:{percentage:number}}>("select public.submit_video_quiz($1,$2,$3) result",[free,[...answers],`90000000-0000-4000-8000-${String(i).padStart(12,'0')}`]);
    expect(r.rows[0].result.percentage).toBe([0,33,67,100][i]);
   }
   expect((await db.query("select * from public.video_quiz_attempts")).rows).toHaveLength(4);
   await expect(db.query("select * from private.video_quizzes")).rejects.toMatchObject({code:"42501"});
   await db.exec("reset role");
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
   await db.exec("set role authenticated");
   expect((await db.query("select * from public.video_quiz_attempts")).rows).toHaveLength(0);
   await db.exec("reset role; set role anon");
   await expect(db.query("select * from public.video_quiz_attempts")).rejects.toMatchObject({code:"42501"});
  } finally { await db.close(); }
 },30000);
 it.each(["zero","multiple","existing_quiz","partial_history"])("aborts atomically on %s",async scenario=>{
  const db=await fixture();
  try {
   if(scenario==="zero") await db.exec("update public.videos set is_published=false");
   if(scenario==="multiple") await db.query("update public.videos set title='[第1回] コンピュータとは？duplicate' where id=$1",[paid]);
   if(scenario==="existing_quiz") await db.query("insert into private.video_quizzes values ($1,'[]')",[free]);
   if(scenario==="partial_history") await db.exec("alter table private.video_quizzes add column id uuid");
   await expect(db.exec(delta)).rejects.toThrow(/exactly one|already exists|already present/);
   await db.exec("rollback");
   expect((await db.query("select to_regclass('public.video_quiz_attempts') name")).rows).toEqual([{name:null}]);
  } finally { await db.close(); }
 },30000);
});
