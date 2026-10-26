-- Run once in the Supabase SQL Editor, after migrate-institutions.sql. Safe to run again.
-- Admin > Online: who is using JAMBwise right now. Every signed-in browser tab says "I'm here" once a minute;
-- someone counts as online when they were heard from in the last 3 minutes. Parents count while their 60-minute session is open.

alter table public.profiles add column if not exists last_seen timestamptz;

create or replace function public.touch_presence() returns void
language sql security definer set search_path = public as
$$ update public.profiles set last_seen = now() where id = auth.uid() and (last_seen is null or last_seen < now() - interval '30 seconds') $$;
revoke execute on function public.touch_presence() from public, anon;
grant execute on function public.touch_presence() to authenticated;

-- Admins see everyone; a teacher sees only the students of their own institution.
create or replace function public.admin_online() returns table (
  id text, role text, full_name text, email text, reg_number text, institution text, inst_title text, last_seen timestamptz, online boolean)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'not allowed'; end if;
  return query
    select p.id::text,
           case when p.is_admin then 'admin' when p.is_teacher then 'teacher' else 'student' end,
           p.full_name, p.email, p.reg_number, i.name, p.inst_title, p.last_seen, p.last_seen > now() - interval '3 minutes'
      from public.profiles p left join public.institutions i on i.id = p.institution_id
     where p.last_seen > now() - interval '24 hours'
       and (public.is_admin() or (not p.is_admin and not p.is_teacher and public.staff_sees(p.id)))
    union all
    select 'ps-' || s.token, 'parent', s.parent_name, null::text, st.reg_number, i.name, null, s.created_at, true
      from public.parent_sessions s join public.profiles st on st.id = s.student_id left join public.institutions i on i.id = st.institution_id
     where s.expires_at > now() and (public.is_admin() or public.staff_sees(st.id))
    order by 8 desc nulls last limit 500;
end $$;
revoke execute on function public.admin_online() from public, anon;
grant execute on function public.admin_online() to authenticated;
