"use server";
import { questionFeedback } from "@/src/lib/videos/quiz-feedback";
import { revalidatePath } from "next/cache";
import { createClient } from "@/src/lib/supabase/server";
import { UUID, VIDEO_BUCKET } from "@/src/lib/videos/validation";
export async function renewPlayback(id: string): Promise<{ url?: string; error?: string }> {
  try {
    if (!UUID.test(id)) return { error: "動画が見つかりません。" };
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { error: "もう一度ログインしてください。" };
    const { data: video, error } = await supabase.from("videos").select("storage_path").eq("id", id).eq("is_deleting", false).maybeSingle();
    if (error || !video?.storage_path) return { error: "動画が存在しないか、公開が終了しています。" };
    const { data, error: signingError } = await supabase.storage.from(VIDEO_BUCKET).createSignedUrl(video.storage_path, 300);
    if (signingError || !data) return { error: "再生URLを取得できませんでした。" };
    return { url: data.signedUrl };
  } catch { return { error: "通信に失敗しました。再試行してください。" }; }
}


export async function completeLesson(id: string): Promise<{ success?: boolean; error?: string }> {
  try {
    if (!UUID.test(id)) return { error: "教材IDが不正です。" };
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { error: "もう一度ログインしてください。" };
    const { data: video, error: videoError } = await supabase.from("videos").select("id")
      .eq("id", id).eq("is_published", true).eq("is_deleting", false).maybeSingle();
    if (videoError || !video) return { error: "教材を確認できません。公開が終了した可能性があります。" };
    // Identity is always derived from the verified session, never from client input.
    const { error } = await supabase.from("video_completions").upsert(
      { user_id: user.id, video_id: id }, { onConflict: "user_id,video_id", ignoreDuplicates: true }
    );
    if (error) return { error: "学習完了を保存できませんでした。再試行してください。" };
    revalidatePath("/dashboard");
    revalidatePath("/videos");
    revalidatePath(`/videos/${id}`);
    return { success: true };
  } catch { return { error: "通信に失敗しました。再試行してください。" }; }
}

export async function undoCompleteLesson(id: string): Promise<{ success?: boolean; error?: string }> {
  try {
    if (!UUID.test(id)) return { error: "教材IDが不正です。" };
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { error: "もう一度ログインしてください。" };
    // Server-verified identity plus database RLS: never accept user_id from the caller.
    const { error } = await supabase.from("video_completions").delete()
      .eq("user_id", user.id).eq("video_id", id);
    if (error) return { error: "学習完了を取り消せませんでした。再試行してください。" };
    revalidatePath("/dashboard");
    revalidatePath("/videos");
    revalidatePath(`/videos/${id}`);
    return { success: true };
  } catch { return { error: "通信に失敗しました。再試行してください。" }; }
}

export async function submitVideoQuiz(id: string, answers: number[], submissionId: string) {
  if (typeof id !== "string" || !UUID.test(id) || !Array.isArray(answers)
    || typeof submissionId !== "string" || !UUID.test(submissionId)
    || answers.length !== 3 || !answers.every(answer => Number.isInteger(answer) && answer >= 0 && answer < 3)) {
    return { error: "各問題の回答を選んでください。" };
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { error: "もう一度ログインしてください。" };

    // The RPC checks current lesson access even when called outside this action.
    const { data, error } = await supabase.rpc("submit_video_quiz", { lesson_id: id, answers, request_id: submissionId });
    if (error) {
      if (["PGRST202", "PGRST205", "42P01", "42703", "42883"].includes(error.code)) {
        return { error: "履歴保存機能のDB準備が完了していません。管理者に連絡してください。回答は保存されていません。" };
      }
      return { error: "採点結果を保存できませんでした。同じ回答で再試行してください。" };
    }
    if (!data || !Array.isArray(data.correct) || data.correct.length !== answers.length
      || !data.correct.every((value: unknown): value is boolean => typeof value === "boolean")) {
      return { error: "この理解度テストを利用できません。" };
    }

    revalidatePath(`/videos/${id}`);
    return { feedback: questionFeedback(data.questions, data.answers, data.correct), correct: data.correct as boolean[], score: data.correct_count as number, percentage: data.percentage as number, saved: true };
  } catch {
    return { error: "通信に失敗しました。再試行してください。" };
  }
}
