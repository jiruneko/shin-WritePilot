-- Register the Traditional Chinese quiz for the Taiwan lesson.
insert into private.video_quizzes (video_id, questions)
select id, $questions$[
  {
    "prompt": "電腦處理資訊的基本流程是什麼？",
    "options": [
      "輸出 → 處理 → 輸入",
      "輸入 → 處理 → 輸出",
      "處理 → 輸出 → 輸入"
    ],
    "correct": 1
  },
  {
    "prompt": "要在電腦上輸入文字，應該使用哪一種裝置？",
    "options": [
      "螢幕",
      "喇叭",
      "鍵盤"
    ],
    "correct": 2
  },
  {
    "prompt": "哪一種裝置能把電腦處理的結果印在紙上？",
    "options": [
      "印表機",
      "滑鼠",
      "麥克風"
    ],
    "correct": 0
  }
]$questions$::jsonb
from public.videos
where id = '8d1f8419-8285-4808-b229-b2651720909e'
  and is_published
  and not is_deleting
  and access_level = 'FREE'
on conflict (video_id) do nothing
returning video_id, jsonb_array_length(questions) as question_count;
