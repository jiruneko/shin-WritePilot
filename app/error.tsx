"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="min-h-screen bg-slate-950 px-6 py-16 text-white"><div className="mx-auto max-w-xl space-y-6"><h1 className="text-2xl font-bold">読み込みに失敗しました</h1><p role="alert" className="leading-7 text-slate-300">通信状態を確認して再試行してください。改善しない場合は、管理者にSupabaseの接続・DB設定をご確認ください。</p><div className="flex gap-4"><button className="button-primary" onClick={reset}>再試行</button><Link className="button-secondary" href="/dashboard">ホームへ</Link></div></div></main>;
}
