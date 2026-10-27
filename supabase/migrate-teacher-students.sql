-- Run once in the Supabase SQL Editor (it is safe to run again). Run it LAST, after every other migrate file.
-- A teacher's Students list shows students only: never an admin, never another teacher, never themselves.
-- Admins still see everyone. Teachers assigned to an institution see only that institution's students.
-- (If migrate-teacher-scope.sql or an older file was run after migrate-institutions.sql, it put an older list back; this restores the right one.)

drop function if exists public.admin_students();
create function public.admin_students() returns table (
  id uuid, reg_number text, email text, full_name text, course text, school text, plan text,
  plan_expires timestamptz, suspended boolean, created_at timestamptz, questions bigint, correct bigint, mocks bigint,
  is_admin boolean, last_active timestamptz, is_teacher boolean, institution_id uuid, institution text, inst_title text)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'not allowed'; end if;
  return query
    select p.id, p.reg_number, p.email, p.full_name, p.course, p.school, p.plan, p.plan_expires, p.suspended, p.created_at,
           coalesce(sum(a.total), 0)::bigint, coalesce(sum(a.correct), 0)::bigint,
           count(a.id) filter (where a.mock_score is not null)::bigint,
           p.is_admin, max(a.created_at), p.is_teacher, p.institution_id, i.name, p.inst_title
      from public.profiles p
      left join public.attempts a on a.user_id = p.id
      left join public.institutions i on i.id = p.institution_id
     where public.is_admin() or (not p.is_admin and not p.is_teacher and public.staff_sees(p.id))
     group by p.id, i.name order by p.created_at desc limit 2000;
end $$;
revoke execute on function public.admin_students() from public, anon;
grant execute on function public.admin_students() to authenticated;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or (public.is_staff() and not is_admin and not is_teacher and public.staff_sees(id)));
