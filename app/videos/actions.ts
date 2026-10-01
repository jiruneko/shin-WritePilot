"use server";
import { createClient } from "@/src/lib/supabase/server";
import { UUID, VIDEO_BUCKET } from "@/src/lib/videos/validation";
export async function renewPlayback(id: string): Promise<{ url?: string; error?: string }> {
  try {
    if (!UUID.test(id)) return { error: "動画が見つかりません。" };
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { error: "もう一度ログインしてください。" };
    const { data: video, error } = await supabase.from("videos").select("storage_path").eq("id", id).eq("is_deleting", false).maybeSingle();
    if (error || !video) return { error: "動画が存在しないか、公開が終了しています。" };
    const { data, error: signingError } = await supabase.storage.from(VIDEO_BUCKET).createSignedUrl(video.storage_path, 300);
    if (signingError || !data) return { error: "再生URLを取得できませんでした。" };
    return { url: data.signedUrl };
  } catch { return { error: "通信に失敗しました。再試行してください。" }; }
}
