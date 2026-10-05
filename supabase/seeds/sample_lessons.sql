-- Optional, repeatable sample data. Run AFTER both migrations.
-- Fixed IDs: reruns neither duplicate lessons nor overwrite admin edits.
insert into public.videos (id, title, description, youtube_id, is_sample, is_published)
values
 ('51000000-0000-4000-8000-000000000001', '【サンプル】教材を開いてみよう',
  '操作体験用のサンプル教材です。動画は共通のデモ映像（Big Buck Bunny）で、正式な講義ではありません。一覧から教材を開き、動画の再生を試しましょう。', 'aqz-KE-bpKQ', true, true),
 ('51000000-0000-4000-8000-000000000002', '【サンプル】自分のペースで視聴しよう',
  '操作体験用のサンプル教材です。動画は共通のデモ映像（Big Buck Bunny）です。一時停止や再生を試し、自分のペースで進めましょう。', 'aqz-KE-bpKQ', true, true),
 ('51000000-0000-4000-8000-000000000003', '【サンプル】学習完了を記録しよう',
  '操作体験用のサンプル教材です。動画は共通のデモ映像（Big Buck Bunny）です。「学習を完了する」を押して一覧へ戻り、進捗の変化を確認しましょう。完了は自己申告で記録します。', 'aqz-KE-bpKQ', true, true)
on conflict (id) do nothing;
