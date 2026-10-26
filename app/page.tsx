export const dynamic = "force-dynamic";
import Link from "next/link";
import { currentUser } from "@/src/lib/auth/user";
import { LogoutButton } from "@/app/components/logout-button";
export default async function Home() {
  const user = await currentUser();
  return <main className="min-h-screen bg-slate-950 px-6 py-12 text-white sm:py-16">
    <div className="mx-auto max-w-5xl">
      <header className="mb-20 flex flex-wrap items-center justify-between gap-5">
        <p className="text-sm font-semibold tracking-[0.25em] text-sky-400">WEBUILD LEARNING</p>
        <nav aria-label="アカウント" className="flex flex-wrap items-center gap-4">
          {user ? <><Link href="/dashboard" className="text-sky-300">マイページ</Link><LogoutButton /></> : <><Link href="/login">ログイン</Link><Link href="/signup" className="button-primary">新規登録</Link></>}
        </nav>
      </header>
      <h1 className="text-4xl font-bold leading-tight sm:text-6xl">学びたい気持ちから、<br />未来をつくる。</h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">ITと生成AIを、基礎から実践まで。あなたに合う学び方を選べます。</p>
      <div className="mt-12 grid gap-6 md:grid-cols-2">
        <section className="rounded-3xl border border-emerald-800 bg-slate-900 p-8">
          <p className="mb-3 text-sm font-semibold text-emerald-300">完全無料・登録不要</p>
          <h2 className="text-2xl font-bold">IT&apos;s てらこや</h2>
          <p className="my-5 leading-7 text-slate-300">ITと生成AIの基礎を、誰でも自分のペースで学べます。</p>
          <Link href="/terakoya" className="button-primary">無料講座を見る</Link>
        </section>
        <section className="rounded-3xl border border-sky-800 bg-slate-900 p-8">
          <p className="mb-3 text-sm font-semibold text-sky-300">実践的な学び</p>
          <h2 className="text-2xl font-bold">WritePilot</h2>
          <p className="my-5 leading-7 text-slate-300">動画教材と進捗管理で、仕事にもつながるスキルを磨きましょう。</p>
          <Link href={user ? "/videos" : "/signup"} className="button-primary">WritePilotを始める</Link>
        </section>
      </div>
    </div>
  </main>;
}
