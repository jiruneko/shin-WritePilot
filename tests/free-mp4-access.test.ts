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

async function readAs(id: string, role: "authenticated" | "anon" = "authenticated") {
  return withDatabaseRole(id, role, async () =>
    (await db.query<{ id: string }>("select id from public.videos order by id")).rows.map(row => row.id)
  );
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
  await db.query("update public.videos set title = $1 where id = $2", [
    "【第1回】 コンピュータとは？仕組みをゼロから学ぼう！ | IT's てらこや", free,
  ]);
  await db.exec(readFileSync(new URL("../supabase/migrations/202611100001_video_comprehension_quiz.sql", import.meta.url), "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });

describe("free MP4 access control migration", () => {
  it("labels only the selected launch lesson free", async () => {
    expect((await db.query("select title,access_level from public.videos order by id")).rows)
      .toEqual([
        { title: "【第1回】 コンピュータとは？仕組みをゼロから学ぼう！ | IT's てらこや", access_level: "FREE" },
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

async function quiz(id: string, answers: number[] | null = null) {
  const result = await db.query<{ quiz: unknown }>(
    "select public.video_quiz($1, $2) as quiz", [id, answers]
  );
  return result.rows[0].quiz;
}

describe("video comprehension quiz", () => {
  it("seeds the existing launch video and exposes only three prompts and options", async () => {
    await withDatabaseRole(learner, "authenticated", async () => {
      const questions = await quiz(free);
      expect(questions).toEqual(Array.from({ length: 3 }, () => ({
        prompt: expect.any(String),
        options: [expect.any(String), expect.any(String), expect.any(String)],
      })));
      await expect(db.query("select questions from private.video_quizzes")).rejects.toMatchObject({ code: "42501" });
    });
  });

  it.each([
    [[1, 2, 0], [true, true, true]],
    [[1, 0, 0], [true, false, true]],
    [[0, 0, 1], [false, false, false]],
  ])("grades %j as %j", async (answers, expected) => {
    await withDatabaseRole(learner, "authenticated", async () => {
      expect(await quiz(free, answers)).toEqual(expected);
    });
  });

  it("rejects malformed submissions and anonymous RPC calls", async () => {
    await withDatabaseRole(learner, "authenticated", async () => {
      await expect(quiz(free, [1, 2])).rejects.toMatchObject({ code: "22023" });
      await expect(quiz(free, [1, 2, 3])).rejects.toMatchObject({ code: "22023" });
    });
    await withDatabaseRole("", "anon", async () => {
      await expect(quiz(free)).rejects.toMatchObject({ code: "42501" });
      await expect(quiz(free, [1, 2, 0])).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("checks entitlement again on submission and excludes unpublished videos", async () => {
    await db.exec("begin");
    try {
      await db.query(
        "insert into private.video_quizzes select id, questions from public.videos cross join private.video_quizzes where id in ($1, $2)",
        [paid, hidden]
      );
      await db.query("delete from public.video_entitlements where video_id = $1", [paid]);
      await withDatabaseRole(learner, "authenticated", async () => {
        expect(await quiz(paid)).toBeNull();
        expect(await quiz(paid, [1, 2, 0])).toBeNull();
      });
      await db.query("insert into public.video_entitlements values ($1, $2)", [paid, learner]);
      await withDatabaseRole(learner, "authenticated", async () => {
        expect(await quiz(paid)).toHaveLength(3);
      });
      await db.query("delete from public.video_entitlements where video_id = $1", [paid]);
      await withDatabaseRole(learner, "authenticated", async () => {
        expect(await quiz(paid, [1, 2, 0])).toBeNull();
      });
      await withDatabaseRole(admin, "authenticated", async () => {
        expect(await quiz(hidden)).toBeNull();
      });
    } finally {
      await db.exec("rollback");
    }
  });
});

it("prefers the known launch UUID when multiple videos have the same title", async () => {
  const launchId = "52fb387f-e7b5-4b74-9b7e-264cd644d86d";
  const migration = readFileSync(new URL("../supabase/migrations/202611100001_video_comprehension_quiz.sql", import.meta.url), "utf8");
  const seed = migration.slice(migration.indexOf("with candidates as"), migration.indexOf("-- NULL requests"));
  await db.exec("begin");
  try {
    await db.query("insert into public.videos (id, title, storage_path, is_published) select $1, title, 'launch.mp4', true from public.videos where id = $2", [launchId, free]);
    await db.exec("delete from private.video_quizzes");
    await db.exec(seed);
    expect((await db.query("select video_id from private.video_quizzes")).rows).toEqual([{ video_id: launchId }]);
  } finally {
    await db.exec("rollback");
  }
});
