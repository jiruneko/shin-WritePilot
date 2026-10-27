-- Allow learners to undo only their own learning completion records.
-- Keep all other completion policies and permissions unchanged.
begin;
grant delete on public.video_completions to authenticated;
drop policy if exists completions_delete_self on public.video_completions;
create policy completions_delete_self
on public.video_completions for delete to authenticated
using (user_id = (select auth.uid()) and (select private.is_member()));
commit;
