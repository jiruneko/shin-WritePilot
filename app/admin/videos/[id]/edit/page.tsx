import { notFound } from "next/navigation";
import { requireAdmin } from "@/src/lib/auth/profile";
import { LmsShell } from "@/app/components/lms-shell";
import { AdminVideoForm } from "@/app/components/admin-video-form";
import { UUID } from "@/src/lib/videos/validation";
export const dynamic = "force-dynamic";
export default async function EditVideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { data, error } = await supabase.from("videos").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("動画情報を取得できませんでした。");
  if (!data) notFound();
  return <LmsShell title="動画を編集" admin><p className="mb-6 text-slate-300">動画ファイルの差し替えは、新しい動画として登録してください。</p><AdminVideoForm video={data} /></LmsShell>;
}
