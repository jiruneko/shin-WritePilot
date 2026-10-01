import Link from "next/link";
import { requireProfile } from "@/src/lib/auth/profile";
import { LmsShell } from "@/app/components/lms-shell";
export const dynamic = "force-dynamic";
export default async function DashboardPage() {
  const { user, profile } = await requireProfile();
  return <LmsShell title="学習ホーム" admin={profile.role === "ADMIN"}>
    <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 sm:p-8"><h2 className="text-xl font-semibold">おかえりなさい{profile.display_name ? `、${profile.display_name}さん` : ""}</h2>
      <p className="my-4 leading-7 text-slate-300">動画教材を選んで、自分のペースで学びましょう。</p><Link className="button-primary" href="/videos">動画教材を見る</Link></section>
    <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-900 p-6 sm:p-8"><h2 className="text-xl font-semibold">アカウント情報</h2>
      <p className="my-4 break-all text-slate-300">{user.email}</p><p className="mb-4 text-sm text-slate-400">{profile.role === "ADMIN" ? "管理者" : "一般ユーザー"}</p>
      <div className="flex flex-wrap gap-4"><Link className="button-secondary" href="/account">アカウント設定・退会</Link>{profile.role === "ADMIN" && <Link className="button-secondary" href="/admin">管理画面を開く</Link>}</div></section>
  </LmsShell>;
}
