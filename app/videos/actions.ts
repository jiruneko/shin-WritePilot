"use server";
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
