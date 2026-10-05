import type { SupabaseClient } from "@supabase/supabase-js";
import type { Video } from "./validation";

export function summarizeProgress(videos: { id: string }[], completions: { video_id: string }[]) {
  const available = new Set(videos.map(video => video.id));
  const completedIds = new Set(completions.map(row => row.video_id).filter(id => available.has(id)));
  const total = available.size;
  const completed = completedIds.size;
  return { total, completed, percent: total ? Math.round(completed / total * 100) : 0, completedIds };
}

export async function loadLearning(supabase: SupabaseClient, userId: string) {
  // One embedded relationship keeps numerator and denominator on the same catalogue snapshot.
  // RLS is authoritative; the explicit identity filter provides defense in depth.
  const { data, error } = await supabase.from("videos")
    .select("*,video_completions(video_id)")
    .eq("is_published", true).eq("is_deleting", false)
    .eq("video_completions.user_id", userId)
    .order("published_at", { ascending: false });
  if (error) throw new Error("教材と学習進捗を取得できませんでした。時間をおいて再読み込みしてください。");
  const rows = (data ?? []) as (Video & { video_completions: { video_id: string }[] })[];
  return { videos: rows, progress: summarizeProgress(rows, rows.flatMap(row => row.video_completions)) };
}
