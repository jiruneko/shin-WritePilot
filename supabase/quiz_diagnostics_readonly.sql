-- Run ONLY in local Studio http://127.0.0.1:54323 SQL Editor.
-- Read-only catalog checks: no seed, updates, reset or migration application.
begin read only;
select current_database() as database_name,
  to_regclass('public.videos') as videos_table,
  to_regclass('private.video_quizzes') as quizzes_table,
  to_regclass('public.video_quiz_attempts') as history_table;
select n.nspname as schema_name, p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute,
  has_function_privilege('anon',p.oid,'execute') as anonymous_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname in ('video_quiz','submit_video_quiz'))
   or (n.nspname='private' and p.proname='can_view_lesson');
select schemaname, tablename, policyname, roles, cmd, qual
from pg_policies where tablename in ('video_quizzes','video_quiz_attempts');
rollback;

-- Run the following block ONLY if videos_table and quizzes_table exist above.
-- Counts and linkage only: no correct answer data is printed.
begin read only;
select v.id, v.title, v.is_published, v.is_deleting,
  (v.storage_path is not null) as has_mp4,
  (q.video_id is not null) as quiz_exists,
  jsonb_array_length(q.questions) as question_count,
  to_jsonb(q)->>'id' as quiz_uuid
from public.videos v left join private.video_quizzes q on q.video_id=v.id
where v.id='52fb387f-e7b5-4b74-9b7e-264cd644d86d'::uuid
  or v.title like '[第1回] コンピュータとは？%'
  or v.title like '【第1回】 コンピュータとは？%'
order by v.id;
select video_id, jsonb_array_length(questions) as question_count
from private.video_quizzes order by video_id limit 20;
rollback;
