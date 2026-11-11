-- Local Studio ONLY: http://127.0.0.1:54323. No writes and no correct answers printed.
begin read only;
select to_regclass('private.video_quizzes') as quiz_table,
  to_regclass('public.video_quiz_attempts') as history_table,
  to_regprocedure('public.video_quiz(uuid,integer[])') as quiz_rpc,
  to_regprocedure('public.submit_video_quiz(uuid,integer[],uuid)') as save_rpc;
select exists (
  select 1 from pg_attribute where attrelid=to_regclass('private.video_quizzes')
  and attname='id' and not attisdropped
) as quiz_has_stable_id;
select v.id as video_id, v.title, v.is_published, v.is_deleting,
  q.video_id as quiz_video_id, jsonb_array_length(q.questions) as question_count
from public.videos v left join private.video_quizzes q on q.video_id=v.id
where v.title like '%コンピュータとは%';
select c.relrowsecurity as history_rls_enabled
from pg_class c where c.oid=to_regclass('public.video_quiz_attempts');
select schemaname, tablename, policyname, roles, cmd, qual
from pg_policies where schemaname='public' and tablename='video_quiz_attempts';
select p.proname,
  has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute,
  has_function_privilege('anon',p.oid,'execute') as anonymous_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('video_quiz','submit_video_quiz');
rollback;
