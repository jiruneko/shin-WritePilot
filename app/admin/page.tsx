import Link from "next/link";
import { requireAdmin } from "@/src/lib/auth/profile";
import { LmsShell } from "@/app/components/lms-shell";
export const dynamic = "force-dynamic";
export default async function AdminPage() {
  await requireAdmin();
  return <LmsShell title="管理画面" admin><section className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900 p-8"><h2 className="text-xl font-semibold">動画教材の管理</h2><p className="text-slate-300">教材のアップロード・編集・公開設定・削除を行えます。</p><div className="flex flex-wrap gap-4"><Link className="button-primary" href="/admin/videos/new">動画をアップロード</Link><Link className="button-secondary" href="/admin/videos">動画を管理する</Link></div></section></LmsShell>;
}
