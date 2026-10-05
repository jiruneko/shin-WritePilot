import { requireProfile } from "@/src/lib/auth/profile";
import { LmsShell } from "@/app/components/lms-shell";
import { VideoCard } from "@/app/components/video-card";
import type { Video } from "@/src/lib/videos/validation";
export const dynamic = "force-dynamic";
export default async function VideosPage() {
  const { profile, supabase } = await requireProfile();
  const { data, error } = await supabase.from("videos").select("*").eq("is_published", true).eq("is_deleting", false).order("published_at", { ascending: false });
  if (error) throw new Error("動画一覧を取得できませんでした。");
  return <LmsShell title="動画教材" admin={profile.role === "ADMIN"}>
    {data?.length ? <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{(data as Video[]).map(video => <VideoCard key={video.id} video={video} />)}</div> : <p className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-slate-300">公開中の動画はまだありません。教材の追加をお待ちください。</p>}
  </LmsShell>;
}
