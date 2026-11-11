begin;
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
commit;
