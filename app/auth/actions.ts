"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import { credentials, registration, type AuthState } from "@/src/lib/auth/validation";
import { isAuthConfigured } from "@/src/lib/auth/user";

const unavailable = { error: "現在アカウント機能を利用できません。時間をおいてお試しください。" };
const connectionError = { error: "通信に失敗しました。時間をおいてもう一度お試しください。" };

export async function signup(_state: AuthState, form: FormData): Promise<AuthState> {
  const parsed = registration(form);
  if (parsed.error) return { error: parsed.error };
  if (!isAuthConfigured()) return unavailable;
  let signedIn = false;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({ email: parsed.email!, password: parsed.password! });
    if (error) return { error: "登録を完了できませんでした。入力内容をご確認のうえ、時間をおいてお試しください。登録済みの場合はログインしてください。" };
    signedIn = Boolean(data.session);
  } catch { return connectionError; }
  if (signedIn) {
    revalidatePath("/", "layout");
    redirect("/dashboard");
  }
  // Same response for an existing account to avoid revealing registration status.
  return { success: "確認メールを送信しました。メールのリンクから登録を完了してください。届かない場合は迷惑メールをご確認ください。すでに登録済みの場合はログインしてください。" };
}

export async function login(_state: AuthState, form: FormData): Promise<AuthState> {
  const parsed = credentials(form);
  if (parsed.error) return { error: parsed.error };
  if (!isAuthConfigured()) return unavailable;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: parsed.email!, password: parsed.password! });
    if (error) return { error: "ログインできませんでした。メールアドレス・パスワードと、確認メールでの登録完了をご確認ください。" };
  } catch { return connectionError; }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  let failed = false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    failed = Boolean(error);
  } catch { failed = true; }
  if (failed) redirect("/account?status=logout-error");
  revalidatePath("/", "layout");
  redirect("/login?status=logged-out");
}

export async function deleteAccount(_state: AuthState, form: FormData): Promise<AuthState> {
  if (form.get("confirmation") !== "delete") return { error: "退会の確認にチェックを入れてください。" };
  const password = String(form.get("password") ?? "");
  if (!password || password.length > 128) return { error: "現在のパスワードを入力してください。" };
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!isAuthConfigured() || !secret) return unavailable;
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.email) return { error: "もう一度ログインしてください。" };

    // Isolated client: reauthentication must not replace the browser's session.
    const verifier = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await verifier.auth.signInWithPassword({ email: user.email, password });
    if (error || data.user?.id !== user.id) return { error: "パスワードを確認してください。" };
    await verifier.auth.signOut({ scope: "local" });

    // This secret is used only inside a Server Action, never sent to the browser.
    const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    // Uploaded teaching materials must be explicitly deleted through the recoverable workflow first.
    const { data: ownedVideos, error: ownershipError } = await supabase.from("videos").select("id").eq("created_by", user.id).limit(1);
    if (ownershipError) return { error: "教材の確認に失敗しました。時間をおいて再試行してください。" };
    if (ownedVideos?.length) return { error: "先に管理画面でアップロード済みの動画を削除してください。" };
    // ID always comes from server-verified identity, never from the form.
    const { error: deletionError } = await admin.auth.admin.deleteUser(user.id);
    if (deletionError) return { error: "退会を完了できませんでした。アカウントは削除されていません。管理者の場合はStorageに未保存の動画が残っていないか確認し、再試行してください。" };
    // Deletion has committed. Cookie cleanup failure must not report deletion as failed.
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  } catch { return connectionError; }
  revalidatePath("/", "layout");
  redirect("/login?status=deleted");
}
