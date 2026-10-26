-- Run once in the Supabase SQL Editor, after migrate-institutions.sql. Safe to run again.
-- Makes Admin > Activity a real log: every admin, teacher and student sign-in is recorded (once per 30 minutes for the same person,
-- so refreshing the page does not flood it). Parent sign-ins are already in their own log and are shown in Activity too.

create or replace function public.log_sign_in() returns void
language plpgsql security definer set search_path = public as $$
declare me public.profiles; act text; inst text; det text;
begin
  select * into me from public.profiles where id = auth.uid();
  if not found then return; end if;
  act := case when me.is_admin then 'login.admin' when me.is_teacher then 'login.teacher' else 'login.student' end;
  if exists (select 1 from public.audit_log where actor = auth.uid() and action = act and created_at > now() - interval '30 minutes') then return; end if;
  select name into inst from public.institutions where id = me.institution_id;
  det := coalesce(nullif(trim(me.full_name), ''), 'Unnamed') || ' (' || me.reg_number || ')'
         || case when inst is not null then ', ' || inst || case when me.is_teacher and me.inst_title is not null then ' ' || me.inst_title else '' end else '' end;
  insert into public.audit_log (actor, actor_email, action, detail) values (auth.uid(), me.email, act, left(det, 500));
end $$;
revoke execute on function public.log_sign_in() from public, anon;
grant execute on function public.log_sign_in() to authenticated;
