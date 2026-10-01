"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/src/lib/supabase/server";
import { VIDEO_BUCKET, UUID, videoMetadata, validateFile, type VideoResult } from "@/src/lib/videos/validation";

async function adminContext() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("unauthorized");
  const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profileError || profile?.role !== "ADMIN") throw new Error("forbidden");
  return { supabase, user };
}
function invalidate(id?: string) {
  revalidatePath("/videos");
  revalidatePath("/admin/videos");
  if (id) { revalidatePath(`/videos/${id}`); revalidatePath(`/admin/videos/${id}/edit`); }
}
const failure = { error: "操作できませんでした。管理者権限と通信状態を確認して再試行してください。" };

export async function prepareUpload(file: { name: string; size: number; type: string }): Promise<VideoResult> {
  try {
    const { user } = await adminContext();
    const error = validateFile(file);
    if (error) return { error };
    const id = crypto.randomUUID();
    return { id, path: `${user.id}/${id}.mp4` };
  } catch { return failure; }
}

export async function saveVideo(id: string, form: FormData, isNew: boolean): Promise<VideoResult> {
  try {
    const { supabase, user } = await adminContext();
    if (!UUID.test(id)) return { error: "動画IDが不正です。" };
    let metadata;
    try { metadata = videoMetadata(form); } catch (error) { return { error: (error as Error).message }; }
    if (isNew) {
      // Never accept a storage path or owner supplied by the browser.
      const path = `${user.id}/${id}.mp4`;
      const { data: object, error: objectError } = await supabase.storage.from(VIDEO_BUCKET).info(path);
      if (objectError || !object) return { error: "アップロード済み動画を確認できません。再試行してください。" };
      // Idempotent retry after a lost response: do not delete a potentially committed file.
      const { data: existing, error: lookupError } = await supabase.from("videos").select("id,storage_path").eq("id", id).maybeSingle();
      if (lookupError) return failure;
      if (existing) {
        if (existing.storage_path !== path) return failure;
        invalidate(id);
        return { success: true, id };
      }
      const { error } = await supabase.from("videos").insert({ ...metadata, id, storage_path: path, created_by: user.id });
      if (error) return { error: "動画情報を保存できませんでした。ファイルは保持しています。同じ画面で保存を再試行してください。" };
    } else {
      const { data, error } = await supabase.from("videos").update(metadata).eq("id", id).eq("is_deleting", false).select("id").maybeSingle();
      if (error || !data) return { error: "保存できませんでした。削除処理中、または動画が存在しない可能性があります。" };
    }
    invalidate(id);
    return { success: true, id };
  } catch { return failure; }
}

export async function deleteVideo(id: string, confirmed: boolean): Promise<VideoResult> {
  try {
    const { supabase } = await adminContext();
    if (!confirmed || !UUID.test(id)) return { error: "削除の確認が必要です。" };
    // Tombstone first; retries continue from the same state. Never republish on failure.
    const { data: video, error } = await supabase.from("videos").update({ is_deleting: true, is_published: false }).eq("id", id).select("storage_path").maybeSingle();
    if (error) return failure;
    if (!video) return { success: true };
    invalidate(id);
    const { error: storageError } = await supabase.storage.from(VIDEO_BUCKET).remove([video.storage_path]);
    if (storageError) return { error: "動画を非公開にしましたがファイル削除に失敗しました。削除を再試行してください。" };
    const { error: dbError } = await supabase.from("videos").delete().eq("id", id).eq("is_deleting", true);
    if (dbError) return { error: "ファイルは削除済みです。動画情報の削除を完了するため再試行してください。" };
    invalidate(id);
    return { success: true };
  } catch { return failure; }
}
