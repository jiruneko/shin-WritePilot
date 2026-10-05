import { notFound } from "next/navigation";
import Link from "next/link";
import { requireProfile } from "@/src/lib/auth/profile";
import { LmsShell } from "@/app/components/lms-shell";
import { VideoPlayer } from "@/app/components/video-player";
import { VIDEO_BUCKET, UUID } from "@/src/lib/videos/validation";
import { CompleteLessonButton } from "@/app/components/complete-lesson-button";
export const dynamic = "force-dynamic";
export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, profile, supabase } = await requireProfile();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { data: video, error } = await supabase.from("videos").select("*").eq("id", id).eq("is_deleting", false).maybeSingle();
  if (error) throw new Error("動画を取得できませんでした。");
  if (!video) notFound();
  // Session-scoped Storage client + RLS, never a service-role playback client.
  const { data, error: signingError } = video.storage_path
    ? await supabase.storage.from(VIDEO_BUCKET).createSignedUrl(video.storage_path, 300)
    : { data: null, error: null };
  const { data: completion, error: completionError } = await supabase.from("video_completions")
    .select("video_id").eq("user_id", user.id).eq("video_id", id).maybeSingle();
  if (completionError) throw new Error("学習完了の状態を取得できませんでした。再読み込みしてください。");
  return <LmsShell title={video.title} admin={profile.role === "ADMIN"}>
    {!video.is_published && <p className="mb-4 text-amber-200">非公開動画の管理者プレビュー</p>}
    {video.is_sample && <p className="mb-4 text-amber-200">サンプル教材：操作体験用のデモ映像です。正式な講義ではありません。</p>}
    {video.youtube_id && /^[A-Za-z0-9_-]{11}$/.test(video.youtube_id) ? <div>
      <iframe className="aspect-video w-full rounded-2xl border-0" src={`https://www.youtube-nocookie.com/embed/${video.youtube_id}`} title={`${video.title}のサンプル動画`} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      <p className="mt-3 text-sm text-slate-400">再生できない場合は <a className="underline" href={`https://www.youtube.com/watch?v=${video.youtube_id}`} target="_blank" rel="noopener noreferrer">YouTubeで開く</a>。外部サービスの提供状況により視聴できない場合があります。</p>
    </div> : signingError || !data ? <p role="alert" className="rounded-xl border border-red-400/30 p-5 text-red-200">再生URLを取得できませんでした。時間をおいて再読み込みしてください。</p> : <VideoPlayer src={data.signedUrl} id={id} />}
    {video.storage_path && <p className="mt-3 text-sm text-slate-400">再生が途切れた場合は再生URLを自動更新します。改善しない場合は「再生を再試行」を押してください。</p>}
    <p className="my-8 whitespace-pre-wrap break-words leading-8 text-slate-300">{video.description || "説明はありません。"}</p>
    {video.is_published && <CompleteLessonButton key={`${user.id}:${id}`} id={id} completed={!!completion} />}
    <Link href="/videos" className="button-secondary">動画一覧へ戻る</Link>
  </LmsShell>;
}
