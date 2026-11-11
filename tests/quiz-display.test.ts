import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), signed: vi.fn() }));
vi.mock("@/src/lib/auth/profile", () => ({ requireProfile: async () => ({
  user: { id: "00000000-0000-4000-8000-000000000001" }, profile: { role: "USER" },
  supabase: { rpc: mocks.rpc, from: mocks.from, storage: { from: () => ({ createSignedUrl: mocks.signed }) } },
}) }));
vi.mock("@/app/videos/actions", () => ({ submitVideoQuiz: vi.fn() }));
vi.mock("@/app/components/lms-shell", () => ({ LmsShell: ({ children }: { children: React.ReactNode }) => React.createElement("main", null, children) }));
vi.mock("@/app/components/video-player", () => ({ VideoPlayer: () => React.createElement("video", { "data-testid": "player" }) }));
vi.mock("@/app/components/complete-lesson-button", () => ({ CompleteLessonButton: () => React.createElement("button", null, "視聴完了") }));
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => React.createElement("a", null, children) }));
import VideoPage from "@/app/videos/[id]/page";
const id = "52fb387f-e7b5-4b74-9b7e-264cd644d86d";
const questions = [1,2,3].map(n => ({ prompt: `設問${n}`, options: ["選択肢A","選択肢B","選択肢C"] }));
function query(data: unknown, error: unknown = null, reject = false) {
  const q = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), maybeSingle: vi.fn(), limit: vi.fn() };
  q.select.mockReturnValue(q); q.eq.mockReturnValue(q); q.order.mockReturnValue(q);
  q.maybeSingle.mockResolvedValue({ data, error });
  q.limit.mockImplementation(async () => { if (reject) throw new Error("network"); return { data, error }; });
  return q;
}
function fixture(historyError = false, reject = false) {
  mocks.from.mockImplementation(table => table === "videos"
    ? query({ id, title: "コンピュータとは？", storage_path: "file.mp4", is_published: true })
    : table === "video_completions" ? query(null)
    : query(historyError ? null : [{ id: "attempt", correct_count: 2, question_count: 3, percentage: 67, taken_at: "2026-11-11T00:00:00Z" }], historyError ? { code: "PGRST205" } : null, reject));
}
async function html() { return renderToStaticMarkup(await VideoPage({ params: Promise.resolve({ id }) })); }
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.clearAllMocks(); fixture();
  mocks.rpc.mockResolvedValue({ data: questions, error: null });
  mocks.signed.mockResolvedValue({ data: { signedUrl: "https://example.test/video" }, error: null });
});
describe("quiz display alongside persistent history", () => {
  it("renders three answerable questions, playback and history on fresh page loads", async () => {
    for (let n=0;n<2;n++) {
      const markup=await html();
      expect(markup.match(/<fieldset/g)).toHaveLength(3);
      expect(markup.match(/type="radio"/g)).toHaveLength(9);
      expect(markup).toContain("回答を提出する"); expect(markup).toContain("67%"); expect(markup).toContain("<video");
    }
    expect(mocks.rpc).toHaveBeenCalledWith("video_quiz", { lesson_id: id });
  });
  it("still fetches and renders the quiz when Storage signing fails", async () => {
    mocks.signed.mockResolvedValue({ data: null, error: { message: "Storage unavailable" } });
    const markup=await html();
    expect(markup).toContain("再生URLを取得できません");
    expect(markup.match(/<fieldset/g)).toHaveLength(3);
  });
  it.each([false,true])("keeps quiz visible when history fails (throws=%s)", async reject => {
    fixture(true,reject);
    const markup=await html();
    expect(markup).toContain("履歴を取得できません"); expect(markup.match(/<fieldset/g)).toHaveLength(3);
  });
  it("shows a missing RPC error instead of silently hiding the quiz", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    expect(await html()).toContain("接続先のクイズ機能が未適用");
  });
  it("shows a diagnostic when the RPC returns no accessible quiz", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect(await html()).toContain("テスト未登録、または受験権限がない");
  });
});
