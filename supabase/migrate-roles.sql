-- JAMBwise: (1) Teacher role and (2) ExamHall "release results". Safe to run more than once.
-- Run AFTER migrate-exam-controls.sql. Supabase > SQL Editor > New query > paste all of this > Run.
--
-- Teachers (Admin > Students > open a student > Role) can view students, scores and exam logs, add and edit questions, and answer
-- tickets. They cannot touch payments, plans, PINs, prices, roles, ExamHall schedule/release, retakes or deletions.

alter table public.profiles add column if not exists is_teacher boolean not null default false;
alter table public.exam_settings add column if not exists results_released boolean not null default false;

create or replace function public.is_staff() returns boolean
language sql security definer stable set search_path = public as
$$ select coalesce((select is_admin or is_teacher from public.profiles where id = auth.uid()), false) $$;

create or replace function public.admin_set_role(target uuid, p_admin boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if target = auth.uid() then raise exception 'you cannot change your own role'; end if;
  update public.profiles set is_admin = coalesce(p_admin, false), is_teacher = false where id = target;
  perform public.admin_log(case when p_admin then 'admin.grant' else 'admin.revoke' end,
                           (select reg_number from public.profiles where id = target));
end $$;

create or replace function public.admin_set_staff_role(target uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_role not in ('student','teacher','admin') then raise exception 'unknown role'; end if;
  if target = auth.uid() then raise exception 'you cannot change your own role'; end if;
  update public.profiles set is_admin = (p_role = 'admin'), is_teacher = (p_role = 'teacher') where id = target;
  perform public.admin_log('role.' || p_role, (select reg_number from public.profiles where id = target));
end $$;

create or replace function public.ticket_reply(p_id bigint, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare m public.messages; staff boolean := public.is_staff();
begin
  select * into m from public.messages where id = p_id;
  if not found or (not staff and m.user_id is distinct from auth.uid()) then raise exception 'not allowed'; end if;
  if auth.uid() is null or char_length(trim(coalesce(p_body, ''))) not between 1 and 2000 then raise exception 'message must be 1-2000 characters'; end if;
  insert into public.message_replies (message_id, author, is_staff, body) values (p_id, auth.uid(), staff, trim(p_body));
  update public.messages set status = case when staff then 'answered' else 'new' end where id = p_id;
  if staff then perform public.admin_log('ticket.reply', '#' || p_id); end if;
end $$;

create or replace function public.ticket_close(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare m public.messages;
begin
  select * into m from public.messages where id = p_id;
  if not found or (not public.is_staff() and m.user_id is distinct from auth.uid()) then raise exception 'not allowed'; end if;
  update public.messages set status = 'resolved' where id = p_id;
  if public.is_staff() then perform public.admin_log('ticket.resolve', '#' || p_id); end if;
end $$;

create or replace function public.limit_ticket_rate() returns trigger language plpgsql security definer set search_path = public as $$
declare ip text; n int; lim int;
begin
  if public.is_staff() then return new; end if;
  if new.abuse_key is null then
    begin
      ip := trim(split_part(coalesce((nullif(current_setting('request.headers', true), '')::json) ->> 'x-forwarded-for', ''), ',', 1));
    exception when others then ip := '';
    end;
    if ip <> '' then new.abuse_key := md5(ip); end if;
  end if;
  if exists (select 1 from public.messages where lower(email) = lower(new.email) and body = new.body and created_at > now() - interval '1 day') then
    raise exception 'rate_limited: You already sent this message. We will reply soon.';
  end if;
  if new.user_id is not null then
    select count(*) into n from public.messages where user_id = new.user_id and created_at > now() - interval '1 hour';
    lim := case when new.topic = 'question' then 10 else 5 end;
    if n >= lim then
      raise exception 'rate_limited: You are sending messages too quickly. Please try again in a little while.';
    end if;
    select count(*) into n from public.messages where user_id = new.user_id and created_at > now() - interval '1 day';
    if n >= 25 then raise exception 'rate_limited: Daily limit reached. Please try again tomorrow.'; end if;
  else
    select count(*) into n from public.messages where user_id is null and lower(email) = lower(new.email) and created_at > now() - interval '1 hour';
    if n >= 3 then raise exception 'rate_limited: Too many messages from this email address. Please try again later.'; end if;
    if new.abuse_key is not null then
      select count(*) into n from public.messages where abuse_key = new.abuse_key and created_at > now() - interval '1 hour';
      if n >= 10 then raise exception 'rate_limited: Too many messages from your network. Please try again later.'; end if;
    end if;
    select count(*) into n from public.messages where user_id is null and created_at > now() - interval '1 hour';
    if n >= 120 then raise exception 'rate_limited: Support is very busy right now. Please try again later.'; end if;
  end if;
  return new;
end $$;

create or replace function public.admin_import_questions(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; ins int := 0; dup int := 0; bad int := 0; n int; ok boolean;
begin
  if not public.is_staff() then raise exception 'not allowed'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 500 then
    raise exception 'send between 1 and 500 questions at a time';
  end if;
  perform set_config('jw.bulk', '1', true);   -- tells the audit trigger not to log every single row
  for r in select value from jsonb_array_elements(p_rows) loop
    ok := jsonb_typeof(r) = 'object'
      and (r->>'subject') in ('eng','mat','phy','chm','bio','gov','eco','com','agr','acc','mkt','lit','irk','crk')
      and char_length(btrim(coalesce(r->>'body', ''))) between 1 and 1000
      and jsonb_typeof(r->'options') = 'array' and jsonb_array_length(r->'options') = 4
      and (r->>'answer') ~ '^[0-3]$'
      and char_length(coalesce(r->>'explanation', '')) <= 1000;
    if ok then
      ok := not exists (select 1 from jsonb_array_elements(r->'options') o
                         where jsonb_typeof(o) <> 'string' or char_length(btrim(o #>> '{}')) not between 1 and 300);
    end if;
    if not ok then bad := bad + 1; continue; end if;
    insert into public.questions (subject, body, options, answer, explanation)
    values (r->>'subject', btrim(r->>'body'),
            (select jsonb_agg(btrim(o.v #>> '{}') order by o.i) from jsonb_array_elements(r->'options') with ordinality as o(v, i)),
            (r->>'answer')::int, nullif(btrim(coalesce(r->>'explanation', '')), ''))
    on conflict (subject, body) do nothing;
    get diagnostics n = row_count;
    if n = 1 then ins := ins + 1; else dup := dup + 1; end if;
  end loop;
  perform set_config('jw.bulk', '', true);
  perform public.admin_log('question.import', ins || ' added, ' || dup || ' duplicates skipped, ' || bad || ' invalid');
  return jsonb_build_object('inserted', ins, 'duplicates', dup, 'invalid', bad);
end $$;

create or replace function public.admin_exam_events(p_kind text, p_user uuid default null) returns table (user_id uuid, type text, occurred_at timestamptz, detail text)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'not allowed'; end if;
  return query select e.user_id, e.type, e.occurred_at, e.detail from public.exam_events e
    where e.kind = p_kind and (p_user is null or e.user_id = p_user) order by e.occurred_at;
end $$;

create or replace function public.exam_window(p_kind text) returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object('opens_at', s.opens_at, 'closes_at', s.closes_at, 'max_violations', coalesce(s.max_violations, 3), 'results_released', coalesce(s.results_released, false), 'server_now', now())
  from (select 1) x left join public.exam_settings s on s.kind = p_kind $$;

create or replace function public.admin_set_exam_window(p_kind text, p_opens timestamptz, p_closes timestamptz, p_max int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_kind not in ('mock','hall') then raise exception 'unknown exam'; end if;
  if p_opens is not null and p_closes is not null and p_closes <= p_opens then raise exception 'The closing time must be after the opening time.'; end if;
  insert into public.exam_settings (kind, opens_at, closes_at, max_violations, updated_at)
    values (p_kind, p_opens, p_closes, coalesce(p_max, 3), now())
    on conflict (kind) do update set opens_at = excluded.opens_at, closes_at = excluded.closes_at, max_violations = excluded.max_violations, updated_at = now();
  perform public.admin_log(p_kind || '.schedule',
    case when p_opens is null and p_closes is null then 'open any time' else coalesce(to_char(p_opens at time zone 'Africa/Lagos', 'DD Mon YYYY HH24:MI'), 'any time') || ' to ' || coalesce(to_char(p_closes at time zone 'Africa/Lagos', 'DD Mon YYYY HH24:MI'), 'no end') end
    || ', ' || coalesce(p_max, 3) || ' warnings');
end $$;

create or replace function public.admin_set_results_released(p_kind text, p_released boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_kind not in ('mock','hall') then raise exception 'unknown exam'; end if;
  insert into public.exam_settings (kind, results_released, updated_at) values (p_kind, coalesce(p_released, false), now())
    on conflict (kind) do update set results_released = excluded.results_released, updated_at = now();
  perform public.admin_log(p_kind || case when p_released then '.release' else '.unrelease' end, case when p_released then 'results shown to students' else 'results hidden from students' end);
end $$;

create or replace function public.my_exam_result(p_kind text) returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare head public.attempts; rel boolean; subs jsonb;
begin
  if p_kind not in ('mock','hall') then return null; end if;
  select * into head from public.attempts where user_id = auth.uid() and kind = p_kind and mock_score is not null order by created_at desc limit 1;
  if not found then return null; end if;
  select coalesce((select results_released from public.exam_settings where kind = p_kind), false) into rel;
  if p_kind = 'hall' and not rel then return jsonb_build_object('date', head.created_at, 'released', false); end if;
  select jsonb_agg(jsonb_build_object('subject', a.subject, 'correct', a.correct, 'total', a.total) order by a.id) into subs
    from public.attempts a
   where a.user_id = auth.uid() and a.kind = p_kind
     and (a.id = head.id or (a.mock_score is null and abs(extract(epoch from (a.created_at - head.created_at))) <= 60));
  return jsonb_build_object('date', head.created_at, 'released', true, 'total', head.mock_score, 'subjects', subs);
end $$;

drop function if exists public.admin_students();
create function public.admin_students() returns table (
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
     group by p.id order by p.created_at desc limit 2000;
end $$;

-- who may read what
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or public.is_staff());
drop policy if exists att_read on public.attempts;
create policy att_read on public.attempts for select to authenticated using (public.is_staff() or (user_id = auth.uid() and kind in ('practice','mock')));
drop policy if exists q_read on public.questions;
create policy q_read on public.questions for select to authenticated using (public.has_access(subject) or public.is_staff());
drop policy if exists q_admin_ins on public.questions;
create policy q_admin_ins on public.questions for insert to authenticated with check (public.is_staff());
drop policy if exists q_admin_upd on public.questions;
create policy q_admin_upd on public.questions for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists msg_read on public.messages;
create policy msg_read on public.messages for select to authenticated using (public.is_staff() or user_id = auth.uid());
drop policy if exists msg_upd on public.messages;
create policy msg_upd on public.messages for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists reply_read on public.message_replies;
create policy reply_read on public.message_replies for select to authenticated using (
  public.is_staff() or exists (select 1 from public.messages m where m.id = message_id and m.user_id = auth.uid()));

revoke execute on function public.is_staff(), public.admin_set_staff_role(uuid, text), public.admin_set_results_released(text, boolean), public.my_exam_result(text), public.admin_students() from public, anon, authenticated;
grant execute on function public.is_staff() to anon, authenticated;
grant execute on function public.admin_set_staff_role(uuid, text), public.admin_set_results_released(text, boolean), public.my_exam_result(text), public.admin_students() to authenticated;
