import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { signUp: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn(), getUser: vi.fn(), verifyOtp: vi.fn() },
  verify: { signInWithPassword: vi.fn(), signOut: vi.fn() },
  deleteUser: vi.fn(),
  adminFactory: vi.fn(),
  revalidate: vi.fn(),
  ownedVideos: vi.fn(),
}));
vi.mock("@/src/lib/supabase/server", () => ({ createClient: async () => ({ auth: mocks.auth, from: () => ({ select: () => ({ eq: () => ({ limit: mocks.ownedVideos }) }) }) }) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.adminFactory }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));

import { signup, login, logout, deleteAccount } from "@/app/auth/actions";
import { currentUser, requireUser } from "@/src/lib/auth/user";
import { GET } from "@/app/auth/confirm/route";
import { NextRequest } from "next/server";

function form(values: Record<string, string | undefined> = {}) {
  const f = new FormData();
  Object.entries({ email: "Learner@Example.com ", password: "long-password-123", passwordConfirmation: "long-password-123", ...values }).forEach(([key, value]) => { if (value !== undefined) f.set(key, value); });
  return f;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.ownedVideos.mockResolvedValue({ data: [], error: null });
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-test-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-test-key");
  mocks.auth.getUser.mockResolvedValue({ data: { user: { id: "real-user", email: "learner@example.com" } }, error: null });
  mocks.auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
  mocks.auth.signInWithPassword.mockResolvedValue({ error: null });
  mocks.auth.signOut.mockResolvedValue({ error: null });
  mocks.verify.signInWithPassword.mockResolvedValue({ data: { user: { id: "real-user" } }, error: null });
  mocks.verify.signOut.mockResolvedValue({ error: null });
  mocks.deleteUser.mockResolvedValue({ error: null });
  mocks.adminFactory.mockImplementation((_url, key) => key === "server-test-key" ? { auth: { admin: { deleteUser: mocks.deleteUser } } } : { auth: mocks.verify });
});

describe("registration and login", () => {
  it.each([{ email: "bad" }, { password: "short" }, { passwordConfirmation: "different" }, { password: "x".repeat(129) }])("rejects malformed registration %j", async (values) => {
    expect((await signup({}, form(values))).error).toBeTruthy();
    expect(mocks.auth.signUp).not.toHaveBeenCalled();
  });
  it("normalizes email and sends confirmation instructions", async () => {
    expect((await signup({}, form())).success).toContain("確認メール");
    expect(mocks.auth.signUp).toHaveBeenCalledWith({ email: "learner@example.com", password: "long-password-123" });
  });
  it("supports projects with email confirmation disabled", async () => {
    mocks.auth.signUp.mockResolvedValue({ data: { session: { access_token: "token" } }, error: null });
    await expect(signup({}, form())).rejects.toThrow("REDIRECT:/dashboard");
  });
  it("does not leak provider errors", async () => {
    mocks.auth.signInWithPassword.mockResolvedValue({ error: { message: "private provider detail" } });
    const result = await login({}, form());
    expect(result.error).toContain("ログインできません");
    expect(result.error).not.toContain("private");
  });
  it("accepts existing shorter passwords at login", async () => {
    await expect(login({}, form({ password: "oldpass" }))).rejects.toThrow("REDIRECT:/dashboard");
  });
  it("handles unavailable configuration", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect((await signup({}, form())).error).toBeTruthy();
    expect(mocks.auth.signUp).not.toHaveBeenCalled();
  });
  it("handles network errors", async () => {
    mocks.auth.signInWithPassword.mockRejectedValue(new Error("network"));
    expect((await login({}, form())).error).toContain("通信");
  });
});

describe("session boundaries", () => {
  it("denies unauthenticated account access", async () => {
    mocks.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });
    expect(await currentUser()).toBeNull();
    await expect(requireUser()).rejects.toThrow("REDIRECT:/login");
  });
  it("logs out this browser and invalidates the rendered layout", async () => {
    await expect(logout()).rejects.toThrow("REDIRECT:/login?status=logged-out");
    expect(mocks.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
  });
  it("does not falsely report logout success", async () => {
    mocks.auth.signOut.mockResolvedValue({ error: { message: "offline" } });
    await expect(logout()).rejects.toThrow("REDIRECT:/account?status=logout-error");
  });
});

describe("account deletion authorization", () => {
  it("requires an explicit confirmation", async () => {
    expect((await deleteAccount({}, form())).error).toBeTruthy();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
  it("fails safely without the server key", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect((await deleteAccount({}, form({ confirmation: "delete" }))).error).toBeTruthy();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
  it("rejects a missing or deleted user", async () => {
    mocks.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await deleteAccount({}, form({ confirmation: "delete" }))).error).toContain("ログイン");
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
  it("rejects a wrong password", async () => {
    mocks.verify.signInWithPassword.mockResolvedValue({ data: { user: null }, error: { message: "invalid password" } });
    expect((await deleteAccount({}, form({ confirmation: "delete" }))).error).toContain("パスワード");
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
  it("rejects identity changes during reauthentication", async () => {
    mocks.verify.signInWithPassword.mockResolvedValue({ data: { user: { id: "different-user" } }, error: null });
    expect((await deleteAccount({}, form({ confirmation: "delete" }))).error).toBeTruthy();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
  it("ignores a forged ID and deletes only the verified account", async () => {
    await expect(deleteAccount({}, form({ confirmation: "delete", userId: "victim" }))).rejects.toThrow("REDIRECT:/login?status=deleted");
    expect(mocks.deleteUser).toHaveBeenCalledExactlyOnceWith("real-user");
    expect(mocks.auth.signOut).toHaveBeenCalled();
  });
  it("blocks account deletion until uploaded materials are removed", async () => {
    mocks.ownedVideos.mockResolvedValue({ data: [{ id: "video" }], error: null });
    expect((await deleteAccount({}, form({ confirmation: "delete" }))).error).toContain("動画を削除");
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
  it("preserves the current session when deletion fails", async () => {
    mocks.deleteUser.mockResolvedValue({ error: { message: "dependent data" } });
    expect((await deleteAccount({}, form({ confirmation: "delete" }))).error).toContain("削除されていません");
    expect(mocks.auth.signOut).not.toHaveBeenCalled();
  });
  it("reports successful deletion even if subsequent logout throws", async () => {
    mocks.auth.signOut.mockRejectedValue(new Error("already deleted"));
    await expect(deleteAccount({}, form({ confirmation: "delete" }))).rejects.toThrow("REDIRECT:/login?status=deleted");
  });
});

describe("email confirmation", () => {
  it("verifies signup tokens and ignores external redirect parameters", async () => {
    mocks.auth.verifyOtp.mockResolvedValue({ error: null });
    const result = await GET(new NextRequest("https://writepilot.test/auth/confirm?token_hash=abc&type=signup&next=https://evil.example"));
    expect(mocks.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "abc", type: "signup" });
    expect(result.headers.get("location")).toBe("https://writepilot.test/dashboard");
    expect(result.headers.get("cache-control")).toBe("no-store");
  });
  it.each(["", "?token_hash=abc&type=recovery", "?type=signup"])("rejects invalid confirmation %s", async (query) => {
    const result = await GET(new NextRequest(`https://writepilot.test/auth/confirm${query}`));
    expect(result.headers.get("location")).toContain("confirmation-error");
    expect(mocks.auth.verifyOtp).not.toHaveBeenCalled();
  });
  it("handles expired tokens", async () => {
    mocks.auth.verifyOtp.mockResolvedValue({ error: { message: "expired" } });
    const result = await GET(new NextRequest("https://writepilot.test/auth/confirm?token_hash=abc&type=signup"));
    expect(result.headers.get("location")).toContain("confirmation-error");
  });
});
