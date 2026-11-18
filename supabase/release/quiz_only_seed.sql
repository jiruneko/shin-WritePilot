insert into private.video_quizzes (video_id, questions)
select id, '[
  {"prompt":"コンピュータが情報を処理する基本的な流れはどれですか？","options":["出力 → 処理 → 入力","入力 → 処理 → 出力","処理 → 出力 → 入力"],"correct":1},
  {"prompt":"文字を入力するとき、入力装置として使うものはどれですか？","options":["ディスプレイ","スピーカー","キーボード"],"correct":2},
  {"prompt":"コンピュータが処理した結果を紙に出す装置はどれですか？","options":["プリンター","マウス","マイク"],"correct":0}
]'::jsonb
from public.videos
where id = '52fb387f-e7b5-4b74-9b7e-264cd644d86d'
  and is_published and not is_deleting and access_level = 'FREE'
  and storage_path is not null
returning video_id;
