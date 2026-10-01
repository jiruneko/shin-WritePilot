import Link from "next/link";
import { LogoutButton } from "./logout-button";
export function LmsShell({ title, admin = false, children }: { title: string; admin?: boolean; children: React.ReactNode }) {
  return <main className="min-h-screen bg-slate-950 px-5 py-8 text-white sm:px-8 sm:py-12"><div className="mx-auto max-w-5xl">
    <header className="mb-10 flex flex-wrap items-center justify-between gap-5">
      <Link href="/" className="text-sm font-semibold tracking-[0.25em] text-sky-400">WRITEPILOT</Link>
      <nav aria-label="学習メニュー" className="flex flex-wrap items-center gap-4 text-sm">
        <Link href="/dashboard">ホーム</Link><Link href="/videos">動画教材</Link><Link href="/account">アカウント</Link>
        {admin && <Link href="/admin">管理画面</Link>}<LogoutButton />
      </nav>
    </header>
    <h1 className="mb-8 text-3xl font-bold">{title}</h1>{children}
  </div></main>;
}
