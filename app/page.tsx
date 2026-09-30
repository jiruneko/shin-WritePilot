import { createClient } from "@/src/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  const isConnected = !error;

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
      <div className="mx-auto max-w-4xl">
        <header className="mb-16">
          <p className="mb-3 text-sm font-semibold tracking-[0.25em] text-sky-400">
            WRITEPILOT
          </p>

          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            自分のペースで、
            <br />
            学びを進めよう。
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            WritePilotは、となりのきょうしつのための
            オンライン学習プラットフォームです。
          </p>
        </header>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
          <h2 className="text-xl font-semibold">
            Supabase接続状態
          </h2>

          <div className="mt-6 flex items-center gap-3">
            <span
              className={`h-3 w-3 rounded-full ${
                isConnected ? "bg-emerald-400" : "bg-red-400"
              }`}
            />

            <p
              className={
                isConnected
                  ? "font-medium text-emerald-300"
                  : "font-medium text-red-300"
              }
            >
              {isConnected
                ? "Supabaseに接続できました"
                : "Supabaseへの接続に失敗しました"}
            </p>
          </div>

          {error && (
            <pre className="mt-6 overflow-x-auto rounded-xl bg-slate-950 p-4 text-sm text-red-300">
              {error.message}
            </pre>
          )}

          <div className="mt-8 rounded-2xl bg-slate-950 p-5">
            <p className="text-sm text-slate-400">
              ログイン状態
            </p>

            <p className="mt-2 font-medium text-slate-100">
              {session
                ? "ログイン済み"
                : "未ログイン（現在はこれで正常です）"}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}