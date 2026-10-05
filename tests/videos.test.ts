import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), info: vi.fn(), remove: vi.fn(), signed: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/src/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from, storage: { from: () => ({ info: mocks.info, remove: mocks.remove, createSignedUrl: mocks.signed }) } }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
import { prepareUpload, saveVideo, deleteVideo } from "@/app/admin/videos/actions";
import { completeLesson, renewPlayback } from "@/app/videos/actions";
import { summarizeProgress, loadLearning } from "@/src/lib/videos/progress";
import { requireAdmin } from "@/src/lib/auth/profile";
import { videoMetadata, validateFile, MAX_VIDEO_BYTES } from "@/src/lib/videos/validation";
const id = "10000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000001";
function query(data: unknown = null, error: unknown = null) {
  const result = { data, error };
  const q = { select: vi.fn(), eq: vi.fn(), single: vi.fn(), maybeSingle: vi.fn(), insert: vi.fn(), update: vi.fn(), upsert: vi.fn(), order: vi.fn(), delete: vi.fn(), then: Promise.resolve(result).then.bind(Promise.resolve(result)) };
  for (const key of ["select", "eq", "insert", "update", "delete", "upsert", "order"] as const) q[key].mockReturnValue(q);
  q.single.mockResolvedValue(result); q.maybeSingle.mockResolvedValue(result);
  return q;
}
function form() { const f = new FormData(); f.set("title", "教材"); f.set("description", "説明"); f.set("is_published", "on"); return f; }
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key");
  mocks.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  mocks.from.mockReturnValue(query({ role: "ADMIN" }));
  mocks.info.mockResolvedValue({ data: { name: `${id}.mp4` }, error: null });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.signed.mockResolvedValue({ data: { signedUrl: "https://example.test/signed" }, error: null });
});
describe("server authorization and mutation recovery", () => {
  it("rejects direct admin page access by a learner", async () => {
    mocks.from.mockReturnValue(query({ role: "USER" }));
    await expect(requireAdmin()).rejects.toThrow("NOT_FOUND");
  });
  it("redirects anonymous admin page access to login", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/login");
  });
  it.each(["USER", undefined])("rejects direct upload/save/delete actions with role %s", async role => {
    mocks.from.mockReturnValue(query(role ? { role } : null));
    expect((await prepareUpload({ name: "a.mp4", type: "video/mp4", size: 12 })).error).toBeTruthy();
    expect((await saveVideo(id, form(), true)).error).toBeTruthy();
    expect((await deleteVideo(id, true)).error).toBeTruthy();
    expect(mocks.info).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("allows admin preparation and derives the path from verified identity", async () => {
    const result = await prepareUpload({ name: "a.mp4", type: "video/mp4", size: 100 });
    expect(result.path).toBe(`${userId}/${result.id}.mp4`);
  });
  it("saves metadata only after Storage verification; ignores a forged path and owner", async () => {
    const insert = query();
    mocks.from.mockReturnValueOnce(query({ role: "ADMIN" })).mockReturnValueOnce(query()).mockReturnValueOnce(insert);
    const f = form(); f.set("storage_path", "victim/file"); f.set("created_by", "victim");
    expect((await saveVideo(id, f, true)).success).toBe(true);
    expect(mocks.info).toHaveBeenCalledWith(`${userId}/${id}.mp4`);
    expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({ storage_path: `${userId}/${id}.mp4`, created_by: userId }));
  });
  it("does not register a nonexistent upload", async () => {
    mocks.info.mockResolvedValue({ data: null, error: { message: "missing" } });
    expect((await saveVideo(id, form(), true)).error).toContain("アップロード済み");
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });
  it("keeps the file on an ambiguous insert failure and permits idempotent retry", async () => {
    mocks.from.mockReturnValueOnce(query({ role: "ADMIN" })).mockReturnValueOnce(query()).mockReturnValueOnce(query(null, { message: "lost response" }));
    expect((await saveVideo(id, form(), true)).error).toContain("再試行");
    expect(mocks.remove).not.toHaveBeenCalled();
    mocks.from.mockReturnValueOnce(query({ role: "ADMIN" })).mockReturnValueOnce(query({ id, storage_path: `${userId}/${id}.mp4` }));
    expect((await saveVideo(id, form(), true)).success).toBe(true);
  });
  it("updates metadata without file replacement and rejects a deleting row", async () => {
    const update = query({ id });
    mocks.from.mockReturnValueOnce(query({ role: "ADMIN" })).mockReturnValueOnce(update);
    expect((await saveVideo(id, form(), false)).success).toBe(true);
    expect(update.eq).toHaveBeenCalledWith("is_deleting", false);
    expect(mocks.info).not.toHaveBeenCalled();
    mocks.from.mockReturnValueOnce(query({ role: "ADMIN" })).mockReturnValueOnce(query());
    expect((await saveVideo(id, form(), false)).error).toBeTruthy();
  });
  it("requires explicit delete confirmation", async () => {
    expect((await deleteVideo(id, false)).error).toBeTruthy(); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("hides a video before file deletion and retains its tombstone on Storage failure", async () => {
    const tombstone = query({ storage_path: "server/path.mp4" });
    mocks.from.mockReturnValueOnce(query({ role: "ADMIN" })).mockReturnValueOnce(tombstone);
    mocks.remove.mockResolvedValue({ error: { message: "offline" } });
    expect((await deleteVideo(id, true)).error).toContain("非公開");
    expect(tombstone.update).toHaveBeenCalledWith({ is_deleting: true, is_published: false });
    expect(mocks.remove).toHaveBeenCalledWith(["server/path.mp4"]);
    expect(mocks.from).toHaveBeenCalledTimes(2);
  });
  it("reports DB cleanup failure and supports retry after an already removed file", async () => {
    mocks.from.mockReturnValueOnce(query({ role: "ADMIN" })).mockReturnValueOnce(query({ storage_path: "server/path.mp4" })).mockReturnValueOnce(query(null, { message: "offline" }));
    expect((await deleteVideo(id, true)).error).toContain("ファイルは削除済み");
    mocks.from.mockReturnValueOnce(query({ role: "ADMIN" })).mockReturnValueOnce(query({ storage_path: "server/path.mp4" })).mockReturnValueOnce(query());
    expect((await deleteVideo(id, true)).success).toBe(true);
  });
  it("does not sign URLs for a missing/non-public row and renews accessible playback", async () => {
    mocks.from.mockReturnValueOnce(query());
    expect((await renewPlayback(id)).error).toBeTruthy(); expect(mocks.signed).not.toHaveBeenCalled();
    mocks.from.mockReturnValueOnce(query({ storage_path: "verified/path.mp4" }));
    expect((await renewPlayback(id)).url).toBeTruthy();
    expect(mocks.signed).toHaveBeenCalledWith("verified/path.mp4", 300);
  });
});
describe("input boundaries", () => {
  it.each([{ name: "x.exe", type: "video/mp4", size: 1 }, { name: "x.mp4", type: "image/png", size: 1 }, { name: "x.mp4", type: "video/mp4", size: 0 }, { name: "x.mp4", type: "video/mp4", size: MAX_VIDEO_BYTES + 1 }])("rejects invalid file %j", file => { expect(validateFile(file)).toBeTruthy(); });
  it.each(["javascript:alert(1)", "http://example.test/x", "https://user:password@example.test/x", "not-a-url"])("rejects unsafe thumbnail %s", url => {
    const f = form(); f.set("thumbnail_url", url); expect(() => videoMetadata(f)).toThrow();
  });
  it("validates title/description limits and accepts optional empty thumbnail", () => {
    expect(videoMetadata(form()).thumbnail_url).toBeNull();
    const f = form(); f.set("title", " "); expect(() => videoMetadata(f)).toThrow();
    f.set("title", "valid"); f.set("description", "x".repeat(10001)); expect(() => videoMetadata(f)).toThrow();
  });
});


describe("learning progress actions and reads", () => {
  it("uses verified identity and an idempotent insert", async () => {
    const write = query();
    mocks.from.mockReturnValueOnce(query({ id })).mockReturnValueOnce(write);
    expect(await completeLesson(id)).toEqual({ success: true });
    expect(write.upsert).toHaveBeenCalledWith({ user_id: userId, video_id: id }, { onConflict: "user_id,video_id", ignoreDuplicates: true });
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard");
    expect(mocks.revalidate).toHaveBeenCalledWith("/videos");
    expect(mocks.revalidate).toHaveBeenCalledWith(`/videos/${id}`);
  });
  it("never reports success for a DB error or a lost response", async () => {
    mocks.from.mockReturnValueOnce(query({ id })).mockReturnValueOnce(query(null, { message: "offline" }));
    expect(await completeLesson(id)).toEqual({ error: expect.any(String) });
    expect(mocks.revalidate).not.toHaveBeenCalled();
    mocks.from.mockImplementationOnce(() => { throw new Error("network"); });
    expect(await completeLesson(id)).toEqual({ error: expect.any(String) });
  });
  it("rejects anonymous, invalid, missing and unpublished lessons", async () => {
    expect((await completeLesson("bad-id")).error).toBeTruthy();
    expect(mocks.from).not.toHaveBeenCalled();
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect((await completeLesson(id)).error).toBeTruthy();
    expect(mocks.from).not.toHaveBeenCalled();
    const unavailable = query();
    mocks.from.mockReturnValueOnce(unavailable);
    expect((await completeLesson(id)).error).toBeTruthy();
    expect(unavailable.eq).toHaveBeenCalledWith("is_published", true);
    expect(unavailable.eq).toHaveBeenCalledWith("is_deleting", false);
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });
  it("skips Storage deletion for sample lessons", async () => {
    mocks.from.mockReturnValueOnce(query({ role: "ADMIN" })).mockReturnValueOnce(query({ storage_path: null })).mockReturnValueOnce(query());
    expect((await deleteVideo(id, true)).success).toBe(true);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("calculates 33%, handles empty catalogue, and excludes duplicates and unavailable lessons", () => {
    expect(summarizeProgress([], [{ video_id: "old" }])).toMatchObject({ total: 0, completed: 0, percent: 0 });
    expect(summarizeProgress([{ id: "a" }, { id: "b" }, { id: "c" }], [{ video_id: "a" }, { video_id: "a" }, { video_id: "old" }])).toMatchObject({ total: 3, completed: 1, percent: 33 });
  });
  it("loads persisted progress with an identity filter and does not mask read failures as zero", async () => {
    const read = query([{ id, video_completions: [{ video_id: id }] }]);
    mocks.from.mockReturnValueOnce(read);
    const { createClient } = await import("@/src/lib/supabase/server");
    const client = await createClient();
    expect((await loadLearning(client, userId)).progress).toMatchObject({ total: 1, completed: 1, percent: 100 });
    expect(read.eq).toHaveBeenCalledWith("video_completions.user_id", userId);
    mocks.from.mockReturnValueOnce(query(null, { message: "offline" }));
    await expect(loadLearning(client, userId)).rejects.toThrow("取得できません");
  });
});
