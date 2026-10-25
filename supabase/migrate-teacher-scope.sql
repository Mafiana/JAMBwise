-- Run once in the Supabase SQL Editor, after migrate-roles.sql and migrate-notify.sql. Safe to run again.
-- 1. A teacher sees only students: admins and other teachers are hidden from their Students list (and from direct reads).
-- 2. Every admin's bell rings when a teacher signs in.

create or replace function public.admin_students() returns table (
  id uuid, reg_number text, email text, full_name text, course text, school text, plan text,
  plan_expires timestamptz, suspended boolean, created_at timestamptz, questions bigint, correct bigint, mocks bigint,
  is_admin boolean, last_active timestamptz, is_teacher boolean)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'not allowed'; end if;
  return query
    select p.id, p.reg_number, p.email, p.full_name, p.course, p.school, p.plan, p.plan_expires, p.suspended, p.created_at,
           coalesce(sum(a.total), 0)::bigint, coalesce(sum(a.correct), 0)::bigint,
           count(a.id) filter (where a.mock_score is not null)::bigint,
           p.is_admin, max(a.created_at), p.is_teacher
      from public.profiles p left join public.attempts a on a.user_id = p.id
     where public.is_admin() or (not p.is_admin and not p.is_teacher)   -- a teacher sees students only, never admins or other teachers
     group by p.id order by p.created_at desc limit 2000;
end $$;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or (public.is_staff() and not is_admin and not is_teacher));

-- A teacher signing in rings every admin's bell (not more than once every 30 minutes for the same teacher).
create or replace function public.teacher_signed_in() returns void
language plpgsql security definer set search_path = public as $$
declare me public.profiles; adm record; msg text;
begin
  select * into me from public.profiles where id = auth.uid();
  if not found or not me.is_teacher or me.is_admin then return; end if;
  msg := coalesce(nullif(trim(me.full_name), ''), 'A teacher') || ' signed in to the teacher panel.';
  for adm in select id from public.profiles where is_admin loop
    if not exists (select 1 from public.notifications n where n.user_id = adm.id and n.kind = 'teacher' and n.body = msg and n.created_at > now() - interval '30 minutes') then
      perform public.notify_user(adm.id, 'teacher', 'Teacher signed in', msg, '/app/admin/teachers');
    end if;
  end loop;
end $$;
revoke execute on function public.teacher_signed_in() from public, anon;
grant execute on function public.teacher_signed_in() to authenticated;
