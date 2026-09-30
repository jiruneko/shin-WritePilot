export const dynamic = "force-dynamic";

import Link from "next/link";
import { currentUser } from "@/src/lib/auth/user";
import { LogoutButton } from "@/app/components/logout-button";

export default async function Home() {
  const user = await currentUser();
  return <main className="min-h-screen bg-slate-950 px-6 py-12 text-white sm:py-16">
    <div className="mx-auto max-w-4xl">
      <header className="mb-20 flex flex-wrap items-center justify-between gap-5">
        <p className="text-sm font-semibold tracking-[0.25em] text-sky-400">WRITEPILOT</p>
        <nav aria-label="アカウント" className="flex flex-wrap items-center gap-4">
          {user ? <><Link className="text-sm text-sky-300 underline underline-offset-4" href="/account">マイページ</Link><LogoutButton /></> : <><Link className="text-sm text-slate-200" href="/login">ログイン</Link><Link className="button-primary" href="/signup">新規登録</Link></>}
        </nav>
      </header>
      <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-6xl">自分のペースで、<br />学びを進めよう。</h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">WritePilotは、となりのきょうしつのためのオンライン学習プラットフォームです。</p>
      <section className="mt-12 rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <h2 className="text-xl font-semibold">{user ? "おかえりなさい" : "あなたの学びの場所をつくろう"}</h2>
        <p className="mt-3 leading-7 text-slate-300">{user ? "アカウントの確認・ログアウト・退会はマイページから行えます。" : "メールアドレスで登録して、WritePilotをはじめましょう。"}</p>
        <Link className="button-primary mt-6" href={user ? "/account" : "/signup"}>{user ? "マイページへ" : "アカウントを作成"}</Link>
      </section>
    </div>
  </main>;
}
