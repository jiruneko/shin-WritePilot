export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/app/components/auth-shell";
import { AuthForm } from "@/app/components/auth-form";
import { currentUser } from "@/src/lib/auth/user";

export default async function SignupPage() {
  if (await currentUser()) redirect("/dashboard");
  return <AuthShell title="学びの一歩を、ここから" description="メールアドレスでWritePilotのアカウントを作成します。">
    <AuthForm mode="signup" />
    <p className="mt-6 text-sm text-slate-300">登録済みの方は <Link className="text-sky-300 underline underline-offset-4" href="/login">ログイン</Link></p>
  </AuthShell>;
}
