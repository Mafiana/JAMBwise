-- JAMBwise: CBT Mock and ExamHall (one attempt each, ExamHall scores visible to admins only) and the admin "allow retake" action.
-- For a database that already has the admin-panel schema. Safe to run more than once (also if you ran the earlier version of this file).
-- Supabase > SQL Editor > New query > paste all of this > Run.

alter table public.attempts drop constraint if exists attempts_kind_check;
alter table public.attempts add constraint attempts_kind_check check (kind in ('practice','mock','hall'));

drop trigger if exists attempts_one_mock on public.attempts;
drop function if exists public.one_mock_per_student();
create or replace function public.one_exam_per_student() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind in ('mock','hall') and new.mock_score is not null then
    perform pg_advisory_xact_lock(hashtext(new.kind || ':' || new.user_id::text));
    if exists (select 1 from public.attempts where user_id = new.user_id and kind = new.kind and mock_score is not null) then
      raise exception 'mock_already_taken: You have already submitted this exam.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists attempts_one_exam on public.attempts;
create trigger attempts_one_exam before insert on public.attempts
  for each row execute function public.one_exam_per_student();

drop function if exists public.admin_allow_retake(uuid);
create or replace function public.admin_allow_retake(target uuid, p_kind text default 'mock') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_kind not in ('mock','hall') then raise exception 'unknown exam'; end if;
  delete from public.attempts where user_id = target and kind = p_kind;
  perform public.admin_log(p_kind || '.retake', (select reg_number from public.profiles where id = target));
end $$;

drop function if exists public.my_mock_status();
create or replace function public.my_exam_status(p_kind text) returns timestamptz
language sql security definer stable set search_path = public as $$
  select max(created_at) from public.attempts where user_id = auth.uid() and kind = p_kind and kind in ('mock','hall') and mock_score is not null $$;

revoke execute on function public.one_exam_per_student(), public.admin_allow_retake(uuid, text), public.my_exam_status(text) from public, anon, authenticated;
grant execute on function public.admin_allow_retake(uuid, text), public.my_exam_status(text) to authenticated;

-- students read their own practice and CBT Mock results; ExamHall scores are admin-only
drop policy if exists att_read on public.attempts;
create policy att_read on public.attempts for select to authenticated using (public.is_admin() or (user_id = auth.uid() and kind in ('practice','mock')));

-- students can clear practice history, but not a submitted exam
drop policy if exists att_delete on public.attempts;
create policy att_delete on public.attempts for delete to authenticated using (user_id = auth.uid() and kind = 'practice');
