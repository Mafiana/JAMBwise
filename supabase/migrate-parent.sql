-- Parent access: a student's parent code, the parent's read-only report, and the admin log. Safe to run more than once.
-- Run it after migrate-notify.sql.
-- ───────────── parent access ─────────────
-- A student creates a short-lived "parent code". A parent types the student's ID + that code on the home page, passes a CAPTCHA,
-- and gets a read-only report for 60 minutes. Parents never log in as the student. Every attempt is logged for the admin.
create table if not exists public.parent_codes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table if not exists public.parent_sessions (
  token text primary key,
  student_id uuid not null references public.profiles(id) on delete cascade,
  parent_name text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists parent_sessions_student_idx on public.parent_sessions (student_id);
create table if not exists public.parent_log (
  id bigint generated always as identity primary key,
  student_id uuid references public.profiles(id) on delete set null,
  reg_number text,
  parent_name text,
  relationship text,
  outcome text not null check (outcome in ('ok','bad_code','locked','expired','off')),
  device text,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists parent_log_reg_idx on public.parent_log (reg_number, created_at desc);
create index if not exists parent_log_ip_idx on public.parent_log (ip_hash, created_at desc);
create index if not exists parent_log_time_idx on public.parent_log (created_at desc);
alter table public.parent_codes enable row level security;
alter table public.parent_sessions enable row level security;   -- no policies: only the server functions touch it
alter table public.parent_log enable row level security;        -- no policies: read through the functions below
drop policy if exists pcode_read on public.parent_codes;
create policy pcode_read on public.parent_codes for select to authenticated using (user_id = auth.uid());

-- A student's exam result, hiding ExamHall scores until an admin releases them (used by the student and by the parent report).
create or replace function public.exam_result_for(p_user uuid, p_kind text) returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare head public.attempts; rel boolean; subs jsonb;
begin
  if p_kind not in ('mock','hall') then return null; end if;
  select * into head from public.attempts where user_id = p_user and kind = p_kind and mock_score is not null order by created_at desc limit 1;
  if not found then return null; end if;
  select coalesce((select results_released from public.exam_settings where kind = p_kind), false) into rel;
  if p_kind = 'hall' and not rel then return jsonb_build_object('date', head.created_at, 'released', false); end if;
  select jsonb_agg(jsonb_build_object('subject', a.subject, 'correct', a.correct, 'total', a.total) order by a.id) into subs
    from public.attempts a
   where a.user_id = p_user and a.kind = p_kind
     and (a.id = head.id or (a.mock_score is null and abs(extract(epoch from (a.created_at - head.created_at))) <= 60));
  return jsonb_build_object('date', head.created_at, 'released', true, 'total', head.mock_score, 'subjects', subs);
end $$;
create or replace function public.my_exam_result(p_kind text) returns jsonb
language plpgsql security definer stable set search_path = public as $$
begin
  return public.exam_result_for(auth.uid(), p_kind);
end $$;

-- Student: make (or renew) the parent code. Valid for 7 days. Any parent who is signed in on the old code is signed out.
create or replace function public.parent_code_create() returns table (code text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare al constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; raw bytea := uuid_send(gen_random_uuid()); v text := ''; i int;
begin
  if auth.uid() is null or public.is_staff() then raise exception 'not allowed'; end if;
  for i in 0..7 loop
    v := v || substr(al, (get_byte(raw, i) % 32) + 1, 1);
    if i = 3 then v := v || '-'; end if;
  end loop;
  delete from public.parent_sessions where student_id = auth.uid();
  insert into public.parent_codes (user_id, code, expires_at) values (auth.uid(), v, now() + interval '7 days')
    on conflict (user_id) do update set code = excluded.code, expires_at = excluded.expires_at, created_at = now();
  return query select v, now() + interval '7 days';
end $$;

-- Student: switch parent access off. Signs out any parent who is looking right now.
create or replace function public.parent_code_revoke() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  delete from public.parent_sessions where student_id = auth.uid();
  delete from public.parent_codes where user_id = auth.uid();
end $$;

-- Student: my code and who has looked at my progress.
create or replace function public.my_parent_access() returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare c public.parent_codes;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  select * into c from public.parent_codes where user_id = auth.uid();
  return jsonb_build_object(
    'code', case when found and c.expires_at > now() then c.code end,
    'expires_at', case when found then c.expires_at end,
    'expired', found and c.expires_at <= now(),
    'views', coalesce((select jsonb_agg(jsonb_build_object('parent_name', l.parent_name, 'relationship', l.relationship, 'device', l.device, 'created_at', l.created_at) order by l.created_at desc)
                         from (select * from public.parent_log where student_id = auth.uid() and outcome = 'ok' order by created_at desc limit 20) l), '[]'::jsonb));
end $$;

-- Server only (Edge Function, service role): check the ID + code, apply the limits, log the try, open a 60 minute read-only session.
-- Limits: 5 wrong tries per student ID per 15 minutes, 20 per device per hour. They count whether or not the ID exists, so nothing is revealed.
create or replace function public.parent_login(p_reg text, p_code text, p_name text, p_rel text, p_device text, p_ip text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare reg text := left(upper(trim(coalesce(p_reg, ''))), 30); nm text := left(trim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g')), 80);
        rel text := case when p_rel in ('Mother','Father','Guardian') then p_rel else 'Other' end;
        dev text := left(coalesce(p_device, ''), 120); sid uuid; c public.parent_codes; tok text; fails int; ipfails int; why text;
begin
  if nm = '' then return jsonb_build_object('ok', false, 'reason', 'name'); end if;
  select count(*) into fails from public.parent_log where reg_number = reg and outcome <> 'ok' and created_at > now() - interval '15 minutes';
  select count(*) into ipfails from public.parent_log where p_ip is not null and ip_hash = p_ip and outcome <> 'ok' and created_at > now() - interval '1 hour';
  select id into sid from public.profiles where reg_number = reg and not is_admin and not is_teacher;
  if fails >= 5 or ipfails >= 20 then
    insert into public.parent_log (student_id, reg_number, parent_name, relationship, outcome, device, ip_hash) values (sid, reg, nm, rel, 'locked', dev, p_ip);
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;
  if sid is null then why := 'bad_code';
  else
    select * into c from public.parent_codes where user_id = sid;
    if not found then why := 'off';
    elsif c.expires_at <= now() then why := 'expired';
    elsif c.code <> upper(trim(coalesce(p_code, ''))) then why := 'bad_code';
    end if;
  end if;
  if why is not null then
    insert into public.parent_log (student_id, reg_number, parent_name, relationship, outcome, device, ip_hash) values (sid, reg, nm, rel, why, dev, p_ip);
    return jsonb_build_object('ok', false, 'reason', 'mismatch');
  end if;
  delete from public.parent_sessions where expires_at < now();
  tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.parent_sessions (token, student_id, parent_name, expires_at) values (tok, sid, nm, now() + interval '60 minutes');
  insert into public.parent_log (student_id, reg_number, parent_name, relationship, outcome, device, ip_hash) values (sid, reg, nm, rel, 'ok', dev, p_ip);
  perform public.notify_user(sid, 'parent', 'A parent viewed your progress', nm || ' (' || rel || ') signed in with your parent code.', '/app/settings');
  return jsonb_build_object('ok', true, 'token', tok, 'expires_at', now() + interval '60 minutes');
end $$;

-- Server only: the read-only report for a live parent session (null when the session is missing or over).
create or replace function public.parent_report(p_token text) returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare s public.parent_sessions; pr public.profiles;
begin
  select * into s from public.parent_sessions where token = p_token and expires_at > now();
  if not found then return null; end if;
  select * into pr from public.profiles where id = s.student_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'student', jsonb_build_object('name', pr.full_name, 'reg_number', pr.reg_number, 'plan', pr.plan, 'plan_expires', pr.plan_expires,
                                  'course', pr.course, 'school', pr.school, 'exam_date', pr.exam_date, 'joined', pr.created_at, 'suspended', pr.suspended),
    'parent', s.parent_name,
    'expires_at', s.expires_at,
    'subjects', coalesce((select jsonb_agg(to_jsonb(t) order by t.pct, t.subject) from (
        select a.subject, count(*)::int as sessions, sum(a.total)::int as total, sum(a.correct)::int as correct, round(100.0 * sum(a.correct) / nullif(sum(a.total), 0))::int as pct
          from public.attempts a where a.user_id = pr.id and a.kind <> 'hall' group by a.subject) t), '[]'::jsonb),
    'mocks', coalesce((select jsonb_agg(jsonb_build_object('date', a.created_at, 'score', a.mock_score) order by a.created_at desc)
                         from public.attempts a where a.user_id = pr.id and a.kind = 'mock' and a.mock_score is not null), '[]'::jsonb),
    'hall', public.exam_result_for(pr.id, 'hall'),
    'recent', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from (
        select a.created_at, a.kind, a.subject, a.correct, a.total from public.attempts a where a.user_id = pr.id and a.kind <> 'hall' order by a.created_at desc limit 12) r), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(d order by d desc) from (
        select distinct (a.created_at at time zone 'Africa/Lagos')::date as d from public.attempts a where a.user_id = pr.id and a.created_at > now() - interval '60 days') x), '[]'::jsonb));
end $$;

-- Server only: end a parent session early ("Log out").
create or replace function public.parent_end(p_token text) returns void
language sql security definer set search_path = public as $$
  delete from public.parent_sessions where token = p_token;
$$;

-- Admin: who tried to see which student, and when.
create or replace function public.admin_parent_log() returns table (id bigint, student_id uuid, student_name text, reg_number text, parent_name text, relationship text, outcome text, device text, created_at timestamptz, active boolean)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query
    select l.id, l.student_id, p.full_name, coalesce(p.reg_number, l.reg_number), l.parent_name, l.relationship, l.outcome, l.device, l.created_at,
           exists (select 1 from public.parent_codes c where c.user_id = l.student_id and c.expires_at > now())
      from public.parent_log l left join public.profiles p on p.id = l.student_id
     order by l.created_at desc limit 2000;
end $$;

-- Admin: switch a student's parent access off (the parent is signed out; the student can make a new code).
create or replace function public.admin_parent_revoke(p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  delete from public.parent_sessions where student_id = p_student;
  delete from public.parent_codes where user_id = p_student;
  perform public.admin_log('parent.revoke', (select reg_number from public.profiles where id = p_student));
  perform public.notify_user(p_student, 'parent', 'Parent access was switched off', 'An admin switched off your parent code. You can make a new one in Settings.', '/app/settings');
end $$;

revoke execute on function public.exam_result_for(uuid, text), public.parent_login(text, text, text, text, text, text), public.parent_report(text), public.parent_end(text),
  public.parent_code_create(), public.parent_code_revoke(), public.my_parent_access(), public.admin_parent_log(), public.admin_parent_revoke(uuid), public.my_exam_result(text) from public, anon, authenticated;
grant execute on function public.parent_login(text, text, text, text, text, text), public.parent_report(text), public.parent_end(text) to service_role;
grant execute on function public.parent_code_create(), public.parent_code_revoke(), public.my_parent_access(), public.admin_parent_log(), public.admin_parent_revoke(uuid), public.my_exam_result(text) to authenticated;
revoke all on public.parent_codes, public.parent_sessions, public.parent_log from anon, authenticated;
grant select on public.parent_codes to authenticated;
