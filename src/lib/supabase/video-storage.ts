import "server-only";
import { createClient } from "@supabase/supabase-js";
import { VIDEO_BUCKET } from "@/src/lib/videos/validation";

export function serverVideoStorage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).storage.from(VIDEO_BUCKET);
}

// Call only with a path read through the request's RLS-scoped video query.
export async function signVideoPlayback(path: string) {
  const storage = serverVideoStorage();
  if (!storage) return { data: null, error: new Error("Video signing is unavailable") };
  return storage.createSignedUrl(path, 300);
}
