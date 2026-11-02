-- Two small additions. Safe to run more than once.
--  1) Admin > Access PINs: a Deactivate button for a PIN that is in use, to end that student's access straight away.
--  2) The home page shows the real number of questions.

alter table public.access_pins add column if not exists deactivated_at timestamptz;

-- admin: end the access a used PIN gave (the student's paid time stops now)
create or replace function public.admin_deactivate_pin(p_pin text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.access_pins; p public.profiles;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  select * into r from public.access_pins where pin = p_pin for update;
  if not found then raise exception 'That PIN does not exist.'; end if;
  if r.used_by is null then raise exception 'This PIN has not been used yet. Delete it instead.'; end if;
  if r.deactivated_at is not null then raise exception 'This PIN is already deactivated.'; end if;
  select * into p from public.profiles where id = r.used_by;
  if not found then raise exception 'The student of this PIN no longer exists.'; end if;
  if p.plan = 'free' then raise exception 'This PIN did not give paid access.'; end if;
  if p.plan_expires is not null and p.plan_expires <= now() then raise exception 'This PIN has already expired.'; end if;
  update public.profiles set plan_expires = now() where id = r.used_by;
  update public.access_pins set deactivated_at = now() where pin = p_pin;
  perform public.admin_log('pin.deactivate', p_pin || ' (' || coalesce(p.full_name, 'student') || ')');
end $$;
revoke execute on function public.admin_deactivate_pin(text) from public, anon;
grant execute on function public.admin_deactivate_pin(text) to authenticated;

-- public: how many questions there are (a number only, nothing else), for the home page
create or replace function public.public_question_count() returns integer
language sql security definer stable set search_path = public as $$
  select count(*)::int from public.questions;
$$;
revoke execute on function public.public_question_count() from public;
grant execute on function public.public_question_count() to anon, authenticated;

notify pgrst, 'reload schema';
