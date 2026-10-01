export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const VIDEO_BUCKET = "videos";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type Video = {
  id: string; title: string; description: string; storage_path: string;
  thumbnail_url: string | null; is_published: boolean; is_deleting: boolean;
  published_at: string | null; created_by: string | null; created_at: string; updated_at: string;
};
export type VideoResult = { error?: string; id?: string; path?: string; success?: boolean };

export function videoMetadata(form: FormData) {
  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const thumbnail = String(form.get("thumbnail_url") ?? "").trim();
  if (!title || title.length > 200) throw new Error("タイトルは1〜200文字で入力してください。");
  if (description.length > 10000) throw new Error("説明は10000文字以内で入力してください。");
  if (thumbnail) {
    try {
      const url = new URL(thumbnail);
      if (url.protocol !== "https:" || url.username || url.password || thumbnail.length > 2048) throw new Error();
    } catch { throw new Error("サムネイルにはHTTPSの画像URLを入力してください。"); }
  }
  return { title, description, thumbnail_url: thumbnail || null, is_published: form.get("is_published") === "on" };
}
export function validateFile(file: { name: string; size: number; type: string }) {
  if (!file.name.toLowerCase().endsWith(".mp4") || file.type !== "video/mp4") return "MP4動画を選択してください。";
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_VIDEO_BYTES) return "動画は0バイトより大きく、50MiB以下にしてください。";
}
