import Link from "next/link";
import { createClient } from "@/src/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TerakoyaPage() {
  const supabase = await createClient();
  const { data: lessons, error } = await supabase.from("videos")
    .select("id,title,description,thumbnail_url,youtube_id,category,published_at")
    .eq("brand", "TERAKOYA").eq("access_level", "FREE")
    .eq("is_published", true).eq("is_deleting", false)
    .order("published_at", { ascending: false });
  if (error) throw new Error("無料教材を読み込めませんでした。");
  return <main className="min-h-screen bg-slate-950 px-6 py-12 text-white">
    <div className="mx-auto max-w-5xl">
      <header className="mb-12 flex flex-wrap items-center justify-between gap-4">
        <Link href="/" className="text-sm text-sky-300">← 学習ポータル</Link>
        <span className="text-sm font-semibold tracking-wider text-emerald-300">IT&apos;s てらこや</span>
      </header>
      <p className="mb-3 text-sm font-semibold text-emerald-300">登録不要・完全無料</p>
      <h1 className="text-4xl font-bold">IT&apos;s てらこや</h1>
      <p className="mt-5 max-w-2xl leading-8 text-slate-300">ITと生成AIの基礎を、自分のペースで。無料動画はアカウントなしで視聴できます。</p>
      {(["IT_BASIC", "GENERATIVE_AI"] as const).map(category => {
        const items = (lessons ?? []).filter(v => v.category === category && v.youtube_id);
        return <section key={category} className="mt-12">
          <h2 className="mb-5 text-2xl font-bold">{category === "IT_BASIC" ? "IT基礎" : "生成AI"}</h2>
          {items.length ? <div className="grid gap-6 sm:grid-cols-2">
            {items.map(video => <article key={video.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h3 className="mb-3 text-xl font-semibold">{video.title}</h3>
              <p className="mb-4 line-clamp-3 whitespace-pre-wrap text-sm text-slate-300">{video.description}</p>
              <a className="text-sky-300 underline underline-offset-4" href={`https://www.youtube.com/watch?v=${video.youtube_id}`} target="_blank" rel="noopener noreferrer">YouTubeで無料視聴</a>
            </article>)}
          </div> : <p className="rounded-2xl border border-slate-800 p-6 text-slate-400">教材を準備中です。</p>}
        </section>;
      })}
      <div className="mt-16 rounded-2xl border border-slate-800 bg-slate-900 p-7">
        <h2 className="text-xl font-semibold">実践的なスキルを学びたい方へ</h2>
        <p className="my-3 text-slate-300">WritePilotでは、演習や学習進捗の管理に取り組めます。</p>
        <Link href="/videos" className="text-sky-300 underline">WritePilotの講座へ</Link>
      </div>
    </div>
  </main>;
}
