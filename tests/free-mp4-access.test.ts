import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const admin = "00000000-0000-4000-8000-000000000001";
const learner = "00000000-0000-4000-8000-000000000002";
const free = "10000000-0000-4000-8000-000000000001";
const paid = "10000000-0000-4000-8000-000000000002";
const hidden = "10000000-0000-4000-8000-000000000003";
let db: PGlite;

async function readAs(id: string, role = "authenticated") {
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)", [id, role]);
  await db.exec(`set role ${role}`);
  try {
    return (await db.query("select id from public.videos order by id")).rows.map(row => row.id);
  } finally {
    await db.exec("reset role");
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth; create schema private;
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
}, 30000);
afterAll(async () => { await db?.close(); });

describe("free MP4 access control migration", () => {
  it("labels only the selected launch lesson free", async () => {
    expect((await db.query("select title,access_level from public.videos order by id")).rows)
      .toEqual([
        { title: "[第1回] コンピュータとは？基礎入門", access_level: "FREE" },
        { title: "Premium course", access_level: "PAID" },
        { title: "Hidden course", access_level: "PAID" },
      ]);
  });
  it("lets learners and anonymous visitors read free MP4 only", async () => {
    expect(await readAs(learner)).toEqual([free]);
    expect(await readAs("", "anon")).toEqual([free]);
  });
  it("keeps paid courses behind entitlement and hidden courses hidden", async () => {
    await db.exec(`insert into public.video_entitlements values ('${paid}','${learner}')`);
    expect(await readAs(learner)).toEqual([free, paid]);
    expect(await readAs("", "anon")).toEqual([free]);
    expect(await readAs(admin)).toEqual([free, paid, hidden]);
  });
});
