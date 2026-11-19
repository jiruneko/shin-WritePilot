import Link from "next/link";
import { LogoutButton } from "./logout-button";
export function LmsShell({ title, admin = false, children, taiwan = false }: { title: string; admin?: boolean; taiwan?: boolean; children: React.ReactNode }) {
  const t = (ja: string, zh: string) => taiwan ? zh : ja;
  return <main lang={taiwan ? "zh-TW" : undefined} className="min-h-screen bg-slate-950 px-5 py-8 text-white sm:px-8 sm:py-12"><div className="mx-auto max-w-5xl">
    <header className="mb-10 flex flex-wrap items-center justify-between gap-5">
      <Link href="/" className="text-sm font-semibold tracking-[0.25em] text-sky-400">WRITEPILOT</Link>
      <nav aria-label={t("学習メニュー", "學習選單")} className="flex flex-wrap items-center gap-4 text-sm">
        <Link href="/dashboard">{t("ホーム", "首頁")}</Link><Link href="/videos">{t("動画教材", "影片教材")}</Link><Link href="/account">{t("アカウント", "帳號")}</Link>
        {admin && <Link href="/admin">{t("管理画面", "管理後台")}</Link>}<LogoutButton taiwan={taiwan} />
      </nav>
    </header>
    <h1 className="mb-8 text-3xl font-bold">{title}</h1>{children}
  </div></main>;
}
