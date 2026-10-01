export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/app/components/auth-shell";
import { AuthForm } from "@/app/components/auth-form";
import { currentUser } from "@/src/lib/auth/user";

const messages: Record<string, string> = {
  "logged-out": "ログアウトしました。",
  deleted: "退会が完了し、アカウントを削除しました。ご利用ありがとうございました。",
  "confirmation-error": "確認リンクが無効か、有効期限が切れています。登録済みの場合はログインしてください。未確認の場合は新規登録を再度お試しください。",
};
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  if (await currentUser()) redirect("/dashboard");
  const { status } = await searchParams;
  return <AuthShell title="おかえりなさい" description="ログインして、自分のペースで学びを進めましょう。">
    {status && messages[status] && <p role="status" className="mb-6 rounded-xl bg-slate-800 p-4 text-sm leading-6 text-slate-200">{messages[status]}</p>}
    <AuthForm mode="login" />
    <p className="mt-6 text-sm text-slate-300">はじめての方は <Link className="text-sky-300 underline underline-offset-4" href="/signup">新規登録</Link></p>
  </AuthShell>;
}
