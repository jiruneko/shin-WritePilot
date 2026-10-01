import { notFound } from "next/navigation";
import { requireUser } from "./user";
import { createClient } from "@/src/lib/supabase/server";

export async function requireProfile() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: profile, error } = await supabase.from("profiles").select("id,email,display_name,role").eq("id", user.id).single();
  if (error || !profile) throw new Error("プロフィールを取得できません。Supabaseのセットアップを確認してください。");
  return { user, profile, supabase };
}
export async function requireAdmin() {
  const context = await requireProfile();
  if (context.profile.role !== "ADMIN") notFound();
  return context;
}
