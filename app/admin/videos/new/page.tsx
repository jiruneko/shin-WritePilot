import { requireAdmin } from "@/src/lib/auth/profile";
import { LmsShell } from "@/app/components/lms-shell";
import { AdminVideoForm } from "@/app/components/admin-video-form";
export const dynamic = "force-dynamic";
export default async function NewVideoPage() {
  await requireAdmin();
  return <LmsShell title="動画をアップロード" admin><AdminVideoForm /></LmsShell>;
}
