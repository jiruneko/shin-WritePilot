-- Requires the deployed lesson access schema (private.can_view_lesson).
begin;

create table private.video_quizzes (
  video_id uuid primary key references public.videos(id) on delete cascade,
  questions jsonb not null
);

alter table private.video_quizzes enable row level security;
revoke all on private.video_quizzes from public, anon, authenticated;

-- Bind to the existing Japanese launch video. Skip absent or ambiguous matches.
with target as (
  select id, count(*) over () as matches
  from public.videos
  where (title like '[第1回] コンピュータとは？%'
      or title like '【第1回】 コンピュータとは？%')
    and storage_path is not null and is_published and not is_deleting
)
insert into private.video_quizzes (video_id, questions)
select id, '[
  {"prompt":"コンピュータが情報を処理する基本的な流れはどれですか？","options":["出力 → 処理 → 入力","入力 → 処理 → 出力","処理 → 出力 → 入力"],"correct":1},
  {"prompt":"文字を入力するとき、入力装置として使うものはどれですか？","options":["ディスプレイ","スピーカー","キーボード"],"correct":2},
  {"prompt":"コンピュータが処理した結果を紙に出す装置はどれですか？","options":["プリンター","マウス","マイク"],"correct":0}
]'::jsonb
from target where matches = 1;

-- NULL requests the public question fields. Submissions return only correctness.
create function public.video_quiz(lesson_id uuid, answers integer[] default null)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  quiz jsonb;
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null then
    return null;
  end if;

  select q.questions into quiz
  from private.video_quizzes q
  join public.videos v on v.id = q.video_id
  where q.video_id = lesson_id and v.is_published and not v.is_deleting
    and private.can_view_lesson(v.id);

  if quiz is null then
    return null;
  end if;

  if answers is null then
    return (
      select jsonb_agg(jsonb_build_object(
        'prompt', question->'prompt', 'options', question->'options'
      ) order by position)
      from jsonb_array_elements(quiz) with ordinality as items(question, position)
    );
  end if;

  if array_ndims(answers) is distinct from 1
    or array_lower(answers, 1) is distinct from 1
    or cardinality(answers) <> jsonb_array_length(quiz)
    or exists (
      select 1
      from jsonb_array_elements(quiz) with ordinality as items(question, position)
      where answers[position] is null or answers[position] < 0
        or answers[position] >= jsonb_array_length(question->'options')
    ) then
    raise exception 'Invalid quiz answers' using errcode = '22023';
  end if;

  return (
    select jsonb_agg(answers[position] = (question->>'correct')::integer order by position)
    from jsonb_array_elements(quiz) with ordinality as items(question, position)
  );
end;
$$;

revoke all on function public.video_quiz(uuid, integer[]) from public, anon, authenticated;
grant execute on function public.video_quiz(uuid, integer[]) to authenticated;

commit;
