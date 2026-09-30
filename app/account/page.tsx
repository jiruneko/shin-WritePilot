export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireUser } from "@/src/lib/auth/user";
import { AuthForm } from "@/app/components/auth-form";
import { LogoutButton } from "@/app/components/logout-button";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireUser();
  const { status } = await searchParams;
  return <main className="min-h-screen bg-slate-950 px-6 py-12 text-white">
    <div className="mx-auto max-w-2xl">
      <Link className="text-sm font-bold tracking-[0.25em] text-sky-400" href="/">WRITEPILOT</Link>
      <h1 className="mt-10 text-3xl font-bold">マイページ</h1>
      <p className="mt-3 text-slate-300">アカウントの確認と設定ができます。</p>
      <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
        <h2 className="text-xl font-semibold">アカウント情報</h2>
        <dl className="my-6"><dt className="text-sm text-slate-400">メールアドレス</dt><dd className="mt-2 break-all">{user.email}</dd></dl>
        <LogoutButton />
        {status === "logout-error" && <p role="alert" className="mt-4 text-red-200">ログアウトできませんでした。時間をおいてもう一度お試しください。</p>}
      </section>
      <section className="mt-8 rounded-3xl border border-red-400/25 bg-slate-900 p-6 sm:p-8">
        <h2 className="text-xl font-semibold">退会</h2>
        <p className="mb-6 mt-3 text-sm leading-7 text-slate-300">退会するとアカウントが削除され、ログインできなくなります。この操作は取り消せません。本人確認のため、現在のパスワードを入力してください。</p>
        <AuthForm mode="delete" />
      </section>
    </div>
  </main>;
}
