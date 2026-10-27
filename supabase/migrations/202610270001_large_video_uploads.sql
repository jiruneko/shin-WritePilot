-- Apply only after upgrading Supabase from Free to Pro or higher.
-- The project's global Storage file size limit must be >= 524288000 bytes.
-- This preserves private access and the existing ADMIN-only Storage RLS policies.
update storage.buckets
set file_size_limit = 524288000,
    allowed_mime_types = array['video/mp4']
where id = 'videos';
