import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const admin = "00000000-0000-4000-8000-000000000001";
const learner = "00000000-0000-4000-8000-000000000002";
const free = "10000000-0000-4000-8000-000000000001";
const paid = "10000000-0000-4000-8000-000000000002";
const hidden = "10000000-0000-4000-8000-000000000003";
let db: PGlite;

async function withDatabaseRole<T>(id: string, role: "authenticated" | "anon", run: () => Promise<T>) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)", [id, role]);
  await db.exec(`set role ${role}`);
  try {
    return await run();
  } finally {
    await db.exec("reset role");
  }
}

beforeAll(async () => {
  db = new PGlite();
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
  const original = (await db.query("select video_id, questions from private.video_quizzes")).rows;
  await db.exec(readFileSync(new URL("../supabase/migrations/202611110001_quiz_attempt_history.sql", import.meta.url), "utf8"));
  expect((await db.query("select video_id, questions from private.video_quizzes")).rows).toEqual(original);
}, 30000);
afterAll(async () => { await db?.close(); });


const submit = (answers: number[], key: string, lesson = free) => db.query<{result: {correct_count: number; percentage: number; questions: unknown}}>(
 "select public.submit_video_quiz($1,$2,$3) result", [lesson, answers, key]);
const key = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
describe("persistent quiz attempts", () => {
 it.each([[[1,2,0],3,100],[[1,0,0],2,67],[[0,0,1],0,0]] as const)("grades and stores %j", async (answers, score, percent) => {
   await withDatabaseRole(learner,"authenticated",async () => {
     const result = (await submit([...answers],key(score+1))).rows[0].result;
     expect(result.correct_count).toBe(score); expect(result.percentage).toBe(percent);
     expect(JSON.stringify(result.questions)).not.toContain('"correct"');
   });
 });
 it("deduplicates retries, rejects changed payload and preserves fresh attempts",async () => {
   await withDatabaseRole(learner,"authenticated",async () => {
     const first=await submit([1,2,0],key(10));
     expect((await submit([1,2,0],key(10))).rows).toEqual(first.rows);
     await expect(submit([0,0,0],key(10))).rejects.toThrow(/reused/);
     await submit([1,2,0],key(11));
     expect((await db.query("select * from public.video_quiz_attempts")).rows).toHaveLength(5);
   });
 });
 it("survives database reload and isolates users; no direct writes or anonymous RPC",async () => {
   const snapshot=await db.dumpDataDir(); await db.close(); db=new PGlite({loadDataDir:snapshot});
   await withDatabaseRole(learner,"authenticated",async () => {
     expect((await db.query("select * from public.video_quiz_attempts")).rows).toHaveLength(5);
     for (const sql of ["delete from public.video_quiz_attempts", "update public.video_quiz_attempts set correct_count=0", "insert into public.video_quiz_attempts default values", "select * from private.video_quizzes"]) {
       await expect(db.query(sql)).rejects.toMatchObject({code:"42501"});
     }
     await expect(submit([1],key(12))).rejects.toMatchObject({code:"22023"});
     expect((await submit([1,2,0],key(13),paid)).rows[0].result).toBeNull();
   });
   await withDatabaseRole(admin,"authenticated",async () => {
     expect((await db.query("select * from public.video_quiz_attempts")).rows).toHaveLength(0);
   });
   await withDatabaseRole("","anon",async () => {
     await expect(submit([1,2,0],key(14))).rejects.toMatchObject({code:"42501"});
   });
 });
});
