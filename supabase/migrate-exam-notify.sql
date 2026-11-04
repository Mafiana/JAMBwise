-- ───────────── ExamHall bells (migrate-exam-notify.sql) ─────────────
-- Run once in the Supabase SQL Editor. Safe to run again.
-- 1. When an admin releases results, EVERY student gets a bell message (before, only students who had sat the exam).
-- 2. When a student starts ExamHall, every admin gets a bell message straight away.

create or replace function public.admin_set_results_released(p_kind text, p_released boolean) returns void
language plpgsql security definer set search_path = public as $$
declare was boolean;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_kind not in ('mock','hall') then raise exception 'unknown exam'; end if;
  select results_released into was from public.exam_settings where kind = p_kind;
  insert into public.exam_settings (kind, results_released, updated_at) values (p_kind, coalesce(p_released, false), now())
    on conflict (kind) do update set results_released = excluded.results_released, updated_at = now();
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

create or replace function public.log_exam_event(p_kind text, p_type text, p_at timestamptz, p_detail text) returns void
language plpgsql security definer set search_path = public as $$
declare me public.profiles; adm record;
begin
  if auth.uid() is null or p_kind not in ('mock','hall') or p_type not in ('started','resumed','left_tab','left_fullscreen','limit_reached','submitted') then return; end if;
  if (select count(*) from public.exam_events where user_id = auth.uid() and kind = p_kind) >= 300 then return; end if;
  insert into public.exam_events (user_id, kind, type, occurred_at, detail)
    values (auth.uid(), p_kind, p_type, least(coalesce(p_at, now()), now()), left(p_detail, 200));
  if p_kind = 'hall' and p_type = 'started' then
    select * into me from public.profiles where id = auth.uid();
    for adm in select id from public.profiles where is_admin loop
      perform public.notify_user(adm.id, 'exam', 'A student entered ExamHall',
        coalesce(me.full_name, 'A student') || ' (' || coalesce(me.reg_number, '') || ') has started ExamHall.', '/app/admin/scoresheet');
    end loop;
  end if;
end $$;

notify pgrst, 'reload schema';
