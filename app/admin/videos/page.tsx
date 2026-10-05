import Link from "next/link";
import { requireAdmin } from "@/src/lib/auth/profile";
import { LmsShell } from "@/app/components/lms-shell";
import { DeleteVideoButton } from "@/app/components/delete-video-button";
export const dynamic = "force-dynamic";
export default async function AdminVideosPage() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.from("videos").select("*").order("created_at", { ascending: false });
  if (error) throw new Error("管理用動画一覧を取得できませんでした。");
  return <LmsShell title="動画管理" admin><Link className="button-primary mb-6" href="/admin/videos/new">動画をアップロード</Link>
    <div className="space-y-5">{data?.length ? data.map(video => <article key={video.id} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="break-words text-xl font-semibold">{video.title}</h2><p className="text-sm text-slate-400">{video.is_deleting ? "削除待ち（再試行してください）" : video.is_published ? "公開中" : "非公開"}</p>
      <div className="flex flex-wrap gap-3">{!video.is_deleting && <><Link className="button-secondary" href={`/admin/videos/${video.id}/edit`}>編集・公開設定</Link><Link className="button-secondary" href={`/videos/${video.id}`}>プレビュー</Link></>}</div>
      <DeleteVideoButton id={video.id} title={video.title} retry={video.is_deleting} />
    </article>) : <p className="text-slate-300">動画はまだありません。最初の教材をアップロードしてください。</p>}</div>
  </LmsShell>;
}
