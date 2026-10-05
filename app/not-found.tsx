import Link from "next/link";
export default function NotFound() { return <main className="min-h-screen bg-slate-950 p-12 text-white"><div className="mx-auto max-w-xl space-y-6"><h1 className="text-2xl font-bold">ページを表示できません</h1><p>ページが存在しないか、アクセス権限がありません。</p><Link className="button-primary" href="/dashboard">学習ホームへ</Link></div></main>; }
