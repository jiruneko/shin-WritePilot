import { notFound } from "next/navigation";
import Link from "next/link";
import { requireProfile } from "@/src/lib/auth/profile";
import { LmsShell } from "@/app/components/lms-shell";
import { VideoPlayer } from "@/app/components/video-player";
import { VIDEO_BUCKET, UUID } from "@/src/lib/videos/validation";
export const dynamic = "force-dynamic";
export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile, supabase } = await requireProfile();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { data: video, error } = await supabase.from("videos").select("*").eq("id", id).eq("is_deleting", false).maybeSingle();
  if (error) throw new Error("動画を取得できませんでした。");
  if (!video) notFound();
  // Session-scoped Storage client + RLS, never a service-role playback client.
  const { data, error: signingError } = await supabase.storage.from(VIDEO_BUCKET).createSignedUrl(video.storage_path, 300);
  return <LmsShell title={video.title} admin={profile.role === "ADMIN"}>
    {!video.is_published && <p className="mb-4 text-amber-200">非公開動画の管理者プレビュー</p>}
    {signingError || !data ? <p role="alert" className="rounded-xl border border-red-400/30 p-5 text-red-200">再生URLを取得できませんでした。時間をおいて再読み込みしてください。</p> : <VideoPlayer src={data.signedUrl} id={id} />}
    <p className="mt-3 text-sm text-slate-400">再生が途切れた場合は再生URLを自動更新します。改善しない場合は「再生を再試行」を押してください。</p>
    <p className="my-8 whitespace-pre-wrap break-words leading-8 text-slate-300">{video.description || "説明はありません。"}</p>
    <Link href="/videos" className="button-secondary">動画一覧へ戻る</Link>
  </LmsShell>;
}
