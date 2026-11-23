import { notFound } from "next/navigation";
import { currentUser, requireUser } from "./user";
import { createClient } from "@/src/lib/supabase/server";

async function loadProfile(user: Awaited<ReturnType<typeof requireUser>>) {
  const supabase = await createClient();
  const { data: profile, error } = await supabase.from("profiles").select("id,email,display_name,role").eq("id", user.id).single();
  if (error || !profile) throw new Error("プロフィールを取得できません。Supabaseのセットアップを確認してください。");
  return { user, profile, supabase };
}
export async function requireProfile() {
  return loadProfile(await requireUser());
}

export async function optionalProfile() {
  const user = await currentUser();
  if (user) return loadProfile(user);
  return { user: null, profile: null, supabase: await createClient() };
}

export async function requireAdmin() {
  const context = await requireProfile();
  if (context.profile.role !== "ADMIN") notFound();
  return context;
}
