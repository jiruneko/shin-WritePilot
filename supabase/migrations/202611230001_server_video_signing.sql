begin;

-- Storage SELECT also authorizes signed URL minting. Block every client
-- SELECT on the private MP4 bucket, including direct Storage API requests.
-- Server signing and authenticated admin deletion use server credentials.
alter policy writepilot_storage_read_guard on storage.objects
  using (bucket_id <> 'videos');

commit;
