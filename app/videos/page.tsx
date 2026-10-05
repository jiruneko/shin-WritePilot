import { requireProfile } from "@/src/lib/auth/profile";
import { LmsShell } from "@/app/components/lms-shell";
import { VideoCard } from "@/app/components/video-card";
import { loadLearning } from "@/src/lib/videos/progress";
import { LearningProgress } from "@/app/components/learning-progress";
export const dynamic = "force-dynamic";
export default async function VideosPage() {
  const { user, profile, supabase } = await requireProfile();
  const { videos, progress } = await loadLearning(supabase, user.id);
  return <LmsShell title="動画教材" admin={profile.role === "ADMIN"}>
    <LearningProgress {...progress} />
    {videos.length ? <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{videos.map(video => <VideoCard key={video.id} video={video} completed={progress.completedIds.has(video.id)} />)}</div> : <p className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-slate-300">公開中の動画はまだありません。教材の追加をお待ちください。</p>}
  </LmsShell>;
}
