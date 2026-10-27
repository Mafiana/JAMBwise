-- Run once in the Supabase SQL Editor, after migrate-institutions.sql. Safe to run again.
-- ExamHall scores (and the "left the exam screen" log) are visible to the admins AND to the teachers in charge of the student:
-- a teacher assigned to an institution sees the students of that institution; a teacher with no institution sees every student.
-- Students still never see their own ExamHall score until an admin releases results.
-- (Some older files, such as migrate-mock-lock.sql, made the scores admin-only. This puts the right rule back.)

drop policy if exists att_read on public.attempts;
create policy att_read on public.attempts for select to authenticated
  using ((public.is_staff() and public.staff_sees(user_id)) or (user_id = auth.uid() and kind in ('practice','mock')));

create or replace function public.admin_exam_events(p_kind text, p_user uuid default null) returns table (user_id uuid, type text, occurred_at timestamptz, detail text)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'not allowed'; end if;
  return query select e.user_id, e.type, e.occurred_at, e.detail from public.exam_events e
    where e.kind = p_kind and (p_user is null or e.user_id = p_user) and public.staff_sees(e.user_id) order by e.occurred_at;
end $$;
revoke execute on function public.admin_exam_events(text, uuid) from public, anon;
grant execute on function public.admin_exam_events(text, uuid) to authenticated;
grant select on public.attempts to authenticated;
