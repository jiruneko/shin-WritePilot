export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const VIDEO_BUCKET = "videos";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type Video = {
  id: string; title: string; description: string; storage_path: string | null; youtube_id: string | null; is_sample: boolean;
  thumbnail_url: string | null; brand?: "TERAKOYA" | "WRITEPILOT"; access_level?: "FREE" | "PAID"; category?: "IT_BASIC" | "GENERATIVE_AI"; is_published: boolean; is_deleting: boolean;
  published_at: string | null; created_by: string | null; created_at: string; updated_at: string;
};
export type VideoResult = { error?: string; id?: string; path?: string; success?: boolean };

export function parseYouTubeId(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("YouTubeのURLを入力してください。"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("HTTPSのYouTube URLを入力してください。");
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (host === "youtu.be" && /^\/[A-Za-z0-9_-]{11}\/?$/.test(url.pathname)) {
    id = url.pathname.split("/")[1];
  } else if (host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else if (/^\/(shorts|embed)\/[A-Za-z0-9_-]{11}\/?$/.test(url.pathname)) id = url.pathname.split("/")[2];
  }
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error("対応したYouTube動画URLを入力してください。");
  return id;
}

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
  const brand = String(form.get("brand") ?? "WRITEPILOT");
  const access_level = String(form.get("access_level") ?? "PAID");
  const category = String(form.get("category") ?? "IT_BASIC");
  if (!["TERAKOYA", "WRITEPILOT"].includes(brand) || !["FREE", "PAID"].includes(access_level) || !["IT_BASIC", "GENERATIVE_AI"].includes(category)) throw new Error("講座区分が不正です。");
  const source = String(form.get("source_type") ?? "UPLOAD");
  if (source !== "YOUTUBE" && source !== "UPLOAD") throw new Error("動画の登録方法が不正です。");
  const youtube_id = source === "YOUTUBE" ? parseYouTubeId(String(form.get("youtube_url") ?? "").trim()) : null;
  // A YouTube URL is intrinsically public: never present it as a protected paid lesson.
  if (source === "YOUTUBE" && (brand !== "TERAKOYA" || access_level !== "FREE")) throw new Error("YouTube教材はIT's てらこやの無料講座専用です。");
  if (brand === "TERAKOYA" && access_level === "FREE" && source !== "YOUTUBE" && form.get("is_published") === "on") throw new Error("てらこやの無料公開にはYouTube動画が必要です。");
  return { title, description, thumbnail_url: thumbnail || null, brand, access_level, category, is_published: form.get("is_published") === "on", youtube_id, source };
}
export function validateFile(file: { name: string; size: number; type: string }) {
  if (!file.name.toLowerCase().endsWith(".mp4") || file.type !== "video/mp4") return "MP4動画を選択してください。";
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_VIDEO_BYTES) return "動画は0バイトより大きく、50MiB以下にしてください。";
}
