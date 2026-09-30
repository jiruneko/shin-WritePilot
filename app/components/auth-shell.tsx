import Link from "next/link";

export function AuthShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <main className="min-h-screen bg-slate-950 px-6 py-12 text-white sm:py-20">
    <div className="mx-auto max-w-md">
      <Link className="text-sm font-bold tracking-[0.25em] text-sky-400" href="/">WRITEPILOT</Link>
      <h1 className="mt-10 text-3xl font-bold">{title}</h1>
      <p className="mt-3 leading-7 text-slate-300">{description}</p>
      <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-900 p-6 sm:p-8">{children}</section>
      <Link className="mt-8 inline-block text-sm text-slate-400 underline underline-offset-4" href="/">トップページへ戻る</Link>
    </div>
  </main>;
}
