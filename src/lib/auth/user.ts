import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";

export function isAuthConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export async function currentUser() {
  if (!isAuthConfigured()) return null;
  const supabase = await createClient();
  // Ask Auth for the current record; deleted accounts must not pass on a valid JWT alone.
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
