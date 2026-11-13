-- Teachers (and other school staff) can release ExamHall results for THEIR OWN school's students.
-- The administrator's switch still releases (or hides) results for every school at once.
-- Run once in the Supabase SQL Editor. Safe to run again.

-- 1. which schools have released which exam (a row = released; no row = not released)
create table if not exists public.exam_release_by_school (
  kind text not null check (kind in ('mock','hall')),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  released_by uuid references auth.users(id) on delete set null,
  released_at timestamptz not null default now(),
  primary key (kind, institution_id)
);
alter table public.exam_release_by_school enable row level security;
revoke all on public.exam_release_by_school from anon, authenticated;

-- 2. "may this school's students see the result?": released for everyone, or released by their school
create or replace function public.results_visible(p_kind text, p_inst uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce((select s.results_released from public.exam_settings s where s.kind = p_kind), false)
      or (p_inst is not null and exists (select 1 from public.exam_release_by_school r where r.kind = p_kind and r.institution_id = p_inst));
$$;
revoke execute on function public.results_visible(text, uuid) from public, anon, authenticated;

-- 3. a student's own result (and the parent report) now follows that rule
create or replace function public.exam_result_for(p_user uuid, p_kind text) returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare head public.attempts; rel boolean; subs jsonb;
begin
  if p_kind not in ('mock','hall') then return null; end if;
  select * into head from public.attempts where user_id = p_user and kind = p_kind and mock_score is not null order by created_at desc limit 1;
  if not found then return null; end if;
  rel := public.results_visible(p_kind, (select p.institution_id from public.profiles p where p.id = p_user));
  if p_kind = 'hall' and not rel then return jsonb_build_object('date', head.created_at, 'released', false); end if;
  select jsonb_agg(jsonb_build_object('subject', a.subject, 'correct', a.correct, 'total', a.total) order by a.id) into subs
    from public.attempts a
   where a.user_id = p_user and a.kind = p_kind
     and (a.id = head.id or (a.mock_score is null and abs(extract(epoch from (a.created_at - head.created_at))) <= 60));
  return jsonb_build_object('date', head.created_at, 'released', true, 'total', head.mock_score, 'subjects', subs);
end $$;

-- 4. the exam window now says whether results are out for the person asking (their school, or everyone) and whether it is for everyone
create or replace function public.exam_window(p_kind text) returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object('opens_at', s.opens_at, 'closes_at', s.closes_at, 'max_violations', coalesce(s.max_violations, 3),
                            'results_released', public.results_visible(p_kind, public.my_institution()),
                            'results_released_all', coalesce(s.results_released, false),
                            'server_now', now())
  from (select 1) x left join public.exam_settings s on s.kind = p_kind $$;

-- 5. school staff: release or hide the results for your own school
create or replace function public.staff_set_results_released(p_kind text, p_released boolean) returns void
language plpgsql security definer set search_path = public as $$
declare inst uuid := public.my_institution(); everyone boolean; added int := 0;
begin
  if not public.is_staff() or public.is_admin() then raise exception 'not allowed'; end if;
  if p_kind not in ('mock','hall') then raise exception 'unknown exam'; end if;
  if inst is null then raise exception 'Ask the administrator to link your account to your school first.'; end if;
  select coalesce((select s.results_released from public.exam_settings s where s.kind = p_kind), false) into everyone;
  if coalesce(p_released, false) then
    if everyone then return; end if;   -- already out for every school
    insert into public.exam_release_by_school (kind, institution_id, released_by) values (p_kind, inst, auth.uid()) on conflict do nothing;
    get diagnostics added = row_count;
    if added > 0 then
      insert into public.notifications (user_id, kind, title, body, link)
      select p.id, 'result', case p_kind when 'hall' then 'ExamHall results are out' else 'CBT Mock results are out' end,
             'Your school has released the results. Tap to see your score.',
             case p_kind when 'hall' then '/app/examhall' else '/app/mock' end
        from public.profiles p
       where p.institution_id = inst and not p.is_admin and not p.is_teacher and not p.suspended;
    end if;
    perform public.admin_log(p_kind || '.release.school', 'results shown to this school''s students');
  else
    if everyone then raise exception 'The administrator has released these results for every school, so only the administrator can hide them.'; end if;
    delete from public.exam_release_by_school where kind = p_kind and institution_id = inst;
    perform public.admin_log(p_kind || '.unrelease.school', 'results hidden from this school''s students');
  end if;
end $$;
revoke execute on function public.staff_set_results_released(text, boolean) from public, anon;
grant execute on function public.staff_set_results_released(text, boolean) to authenticated;

-- 6. the administrator's switch: hiding the results hides them everywhere, including schools that released them
create or replace function public.admin_set_results_released(p_kind text, p_released boolean) returns void
language plpgsql security definer set search_path = public as $$
declare was boolean;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_kind not in ('mock','hall') then raise exception 'unknown exam'; end if;
  select results_released into was from public.exam_settings where kind = p_kind;
  insert into public.exam_settings (kind, results_released, updated_at) values (p_kind, coalesce(p_released, false), now())
    on conflict (kind) do update set results_released = excluded.results_released, updated_at = now();
  if not coalesce(p_released, false) then delete from public.exam_release_by_school where kind = p_kind; end if;
  perform public.admin_log(p_kind || case when p_released then '.release' else '.unrelease' end, case when p_released then 'results shown to students' else 'results hidden from students' end);
  if coalesce(p_released, false) and not coalesce(was, false) then
    insert into public.notifications (user_id, kind, title, body, link)
    select p.id, 'result',
           case p_kind when 'hall' then 'ExamHall results are out' else 'CBT Mock results are out' end,
           'The administrator has released the results. Tap to see your score.',
           case p_kind when 'hall' then '/app/examhall' else '/app/mock' end
      from public.profiles p
     where not p.is_admin and not p.is_teacher and not p.suspended;
  end if;
end $$;

notify pgrst, 'reload schema';
