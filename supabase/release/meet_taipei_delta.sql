-- Reviewed delta for jcgxpvfqgwpoppaqgoar, observed 2026-11-16.
-- OPERATOR GATE: verify project ref, a recoverable backup, and real Preview E2E first.
-- Run once, as a single transaction. This is NOT a full migration-chain replay.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
lock table public.videos in share mode;
lock table private.video_quizzes in access exclusive mode;
do $$
begin
 if to_regclass('public.video_quiz_attempts') is not null
    or to_regprocedure('public.submit_video_quiz(uuid,integer[],uuid)') is not null
    or exists (select 1 from information_schema.columns where table_schema='private' and table_name='video_quizzes' and column_name='id') then
   raise exception 'History schema already present or partially applied; inspect instead of replaying';
 end if;
 if to_regprocedure('public.video_quiz(uuid,integer[])') is null
    or to_regprocedure('private.can_view_lesson(uuid)') is null then
   raise exception 'Required quiz/access functions missing';
 end if;
 if not (select relrowsecurity from pg_class where oid='private.video_quizzes'::regclass)
    or has_table_privilege('anon','private.video_quizzes','SELECT')
    or has_table_privilege('authenticated','private.video_quizzes','SELECT') then
   raise exception 'Private quiz access differs from reviewed schema';
 end if;
 if (select count(*) from public.videos where storage_path is not null and is_published and not is_deleting
     and (id='52fb387f-e7b5-4b74-9b7e-264cd644d86d'::uuid
       or title like '[第1回] コンピュータとは？%' or title like '【第1回】 コンピュータとは？%')) <> 1 then
   raise exception 'Expected exactly one eligible launch MP4';
 end if;
 if not exists (select 1 from public.videos where id='52fb387f-e7b5-4b74-9b7e-264cd644d86d'::uuid
    and storage_path is not null and is_published and not is_deleting and access_level='FREE') then
   raise exception 'Verified launch UUID must remain a published FREE MP4';
 end if;
 if exists (select 1 from private.video_quizzes where video_id='52fb387f-e7b5-4b74-9b7e-264cd644d86d'::uuid) then
   raise exception 'Launch quiz already exists; never overwrite existing question data';
 end if;
end $$;
-- The existing video_id identifies the one quiz per video; retain it and add a stable quiz UUID.
alter table private.video_quizzes add column id uuid not null default gen_random_uuid() unique;
create table public.video_quiz_attempts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 video_id uuid not null references public.videos(id) on delete cascade,
 quiz_id uuid not null,
 submission_id uuid not null,
 answers integer[] not null,
 correct boolean[] not null,
 correct_count integer not null,
 question_count integer not null check (question_count > 0),
 percentage integer generated always as (round(100.0 * correct_count / question_count)::integer) stored,
 -- Immutable public question snapshot supports later explanations even after quiz edits.
 questions jsonb not null,
 taken_at timestamptz not null default now(),
 unique(user_id, submission_id),
 check (correct_count between 0 and question_count),
 check (cardinality(answers)=question_count and cardinality(correct)=question_count)
);
create index video_quiz_attempts_history on public.video_quiz_attempts(user_id, video_id, taken_at desc);
alter table public.video_quiz_attempts enable row level security;
revoke all on public.video_quiz_attempts from public, anon, authenticated;
grant select on public.video_quiz_attempts to authenticated;
create policy own_quiz_history on public.video_quiz_attempts for select to authenticated
 using (user_id = (select auth.uid()));

create function public.submit_video_quiz(lesson_id uuid, answers integer[], request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
 previous public.video_quiz_attempts;
 result public.video_quiz_attempts;
 graded jsonb;
 public_questions jsonb;
 quiz_uuid uuid;
begin
 if auth.role() is distinct from 'authenticated' or auth.uid() is null then
   raise exception 'Authentication required' using errcode = '42501';
 end if;
 if request_id is null or answers is null then
   raise exception 'Invalid submission' using errcode = '22023';
 end if;
 -- Serialize retries for the same user/key, including concurrent requests.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || request_id::text, 0));
 select * into previous from public.video_quiz_attempts
 where user_id=auth.uid() and submission_id=request_id;
 if found then
   if previous.video_id is distinct from lesson_id or previous.answers is distinct from answers then
     raise exception 'Submission key reused with different answers' using errcode = '22023';
   end if;
   return to_jsonb(previous);
 end if;
 -- Reuse the existing authoritative validation, grading and current access checks.
 graded := public.video_quiz(lesson_id, answers);
 if graded is null then return null; end if;
 public_questions := public.video_quiz(lesson_id);
 select id into quiz_uuid from private.video_quizzes where video_id=lesson_id;
 insert into public.video_quiz_attempts(user_id,video_id,quiz_id,submission_id,answers,correct,correct_count,question_count,questions)
 values(auth.uid(),lesson_id,quiz_uuid,request_id,answers,
   array(select value::boolean from jsonb_array_elements_text(graded)),
   (select count(*) from jsonb_array_elements(graded) v where v='true'::jsonb),
   jsonb_array_length(graded),public_questions)
 returning * into result;
 return to_jsonb(result);
end;
$$;
revoke all on function public.submit_video_quiz(uuid, integer[], uuid) from public, anon, authenticated;
grant execute on function public.submit_video_quiz(uuid, integer[], uuid) to authenticated;
with candidates as (
  select id, id = '52fb387f-e7b5-4b74-9b7e-264cd644d86d'::uuid as exact_match
  from public.videos
  where storage_path is not null and is_published and not is_deleting
    and (id = '52fb387f-e7b5-4b74-9b7e-264cd644d86d'::uuid
      or title like '[第1回] コンピュータとは？%'
      or title like '【第1回】 コンピュータとは？%')
), target as (
  select id from candidates
  where exact_match or (select count(*) from candidates) = 1
)
insert into private.video_quizzes (video_id, questions)
select id, '[
  {"prompt":"コンピュータが情報を処理する基本的な流れはどれですか？","options":["出力 → 処理 → 入力","入力 → 処理 → 出力","処理 → 出力 → 入力"],"correct":1},
  {"prompt":"文字を入力するとき、入力装置として使うものはどれですか？","options":["ディスプレイ","スピーカー","キーボード"],"correct":2},
  {"prompt":"コンピュータが処理した結果を紙に出す装置はどれですか？","options":["プリンター","マウス","マイク"],"correct":0}
]'::jsonb
from target;


do $$
begin
 if (select count(*) from private.video_quizzes where video_id='52fb387f-e7b5-4b74-9b7e-264cd644d86d'::uuid and jsonb_array_length(questions)=3 and id is not null) <> 1 then
   raise exception 'Launch quiz postcondition failed';
 end if;
end $$;
commit;
