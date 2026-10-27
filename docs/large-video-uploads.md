# Large MP4 uploads (up to 500 MiB)

The admin upload form now accepts MP4 files up to 500 MiB (524,288,000 bytes). The uploader remains available only to users whose server-side profile role is `ADMIN`. The private `videos` bucket and row-level security rules are unchanged.

## Supabase configuration required

**Free projects cannot accept files larger than 50 MB**, even if the application limit has been raised. Upgrade to Pro or higher before applying the migration.

1. Open Supabase Dashboard → Storage → Settings.
2. Set the **global file size limit** to at least **500 MiB / 524,288,000 bytes** (use the UI-supported equivalent if it displays MB).
3. Apply `supabase/migrations/202610270001_large_video_uploads.sql` through your normal migration workflow / SQL Editor. The migration sets the private `videos` bucket limit to 500 MiB.
4. Deploy the application and log in as ADMIN to open `/admin/videos/new`.
5. Test an MP4 over 50 MB, then confirm it is visible in the admin video list and playable when published. Confirm a USER cannot access the admin form.

## Upload reliability

The application currently uses a **single-request standard Storage upload** rather than a resumable upload. Supabase recommends **TUS resumable uploads** for files over 6 MB. The 500 MiB size limit does not guarantee uploads will complete on a slow or unreliable connection; upgrading the upload transport to TUS is advised before routine uploads of hundreds of MB. Do not close the browser tab during uploads.

References:
- https://supabase.com/docs/guides/storage/uploads/file-limits
- https://supabase.com/docs/guides/storage/uploads/resumable-uploads
