import Link from "next/link";
import type { Video } from "@/src/lib/videos/validation";
import { Thumbnail } from "./video-thumbnail";
export function VideoCard({ video, completed }: { video: Video; completed?: boolean }) {
  return <Link href={`/videos/${video.id}`} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 transition hover:border-sky-400">
    <Thumbnail url={video.thumbnail_url} />
    <div className="space-y-3 p-5">{video.is_sample && <p className="text-sm text-amber-200">サンプル教材</p>}{completed !== undefined && <p className="text-sm text-sky-300">{completed ? "学習完了済み" : "未完了"}</p>}<h2 className="break-words text-xl font-semibold">{video.title}</h2>
      <p className="line-clamp-3 whitespace-pre-line break-words text-sm leading-6 text-slate-300">{video.description || "説明はありません。"}</p>
      {video.published_at && <p className="text-xs text-slate-400">公開：<time dateTime={video.published_at}>{new Date(video.published_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}</time></p>}
    </div>
  </Link>;
}
