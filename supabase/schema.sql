-- JAMBwise schema (v2, hardened). Run once on a NEW Supabase project: SQL Editor > New query > paste > Run.
-- Then run seed-questions.sql.

create extension if not exists pgcrypto with schema extensions;

-- ───────────────────────────── tables ─────────────────────────────

create table public.plans (
  id text primary key,
  name text not null,
  price_kobo int not null default 0 check (price_kobo >= 0)
);
insert into public.plans values ('free','Free',0),('student','Student',150000),('pro','Pro',300000);

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  reg_number text unique not null,
  email text,
  full_name text check (char_length(full_name) <= 100),
  course text check (char_length(course) <= 100),
  school text check (char_length(school) <= 100),
  avatar text check (char_length(avatar) <= 100000),
  plan text not null default 'free' references public.plans(id),
  plan_expires timestamptz,
  subjects text[] not null default '{mat,phy,chm}'
    check (cardinality(subjects) <= 3 and subjects <@ array['mat','phy','chm','bio','gov','eco','com','agr','acc','mkt','lit','irk','crk','hec','cst','geo']),
  exam_date date,
  study_hours int not null default 3 check (study_hours between 1 and 10),
  is_admin boolean not null default false,
  is_teacher boolean not null default false,   -- staff with limited rights: view scores, add and edit questions, answer tickets
  suspended boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.access_pins (
  pin text primary key check (pin ~ '^[A-Z2-9]{4}-[A-Z2-9]{4}$'),
  plan text not null references public.plans(id),
  student_name text check (char_length(student_name) <= 100),
  days int not null default 365 check (days between 1 and 3650),
  used_by uuid references auth.users on delete set null,
  used_at timestamptz,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

create table public.payments (
  reference text primary key,
  user_id uuid references auth.users on delete set null,   -- keep payment records if the account is deleted
  plan text not null references public.plans(id),
  amount_kobo int not null,
  status text not null default 'pending' check (status in ('pending','paid','failed')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.attempts (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  subject text not null check (subject in ('eng','mat','phy','chm','bio','gov','eco','com','agr','acc','mkt','lit','irk','crk','hec','cst','geo')),
  correct int not null check (correct >= 0),
  total int not null check (total between 1 and 200),
  kind text not null check (kind in ('practice','mock','hall')),
  mock_score int check (mock_score between 0 and 400),
  -- a mock or ExamHall writes one row per subject; the score (out of 400) is stored in mock_score on one row only, so count exams with mock_score is not null
  created_at timestamptz not null default now(),
  check (correct <= total)
);
create index attempts_user_idx on public.attempts (user_id, created_at desc);

create table public.questions (
  id bigserial primary key,
  subject text not null check (subject in ('eng','mat','phy','chm','bio','gov','eco','com','agr','acc','mkt','lit','irk','crk','hec','cst','geo')),
  body text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  answer int not null check (answer between 0 and 3),
  explanation text,
  unique (subject, body)
);

-- contact-form messages (anyone can send, only admins can read)
create table public.messages (
  id bigserial primary key,
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 200 and email ~ '^[^@\s]+@[^@\s]+$'),
  topic text not null default 'general' check (topic in ('general','payment','pin','bug','question','other')),
  subject text check (char_length(subject) <= 120),
  body text not null check (char_length(body) between 5 and 2000),
  user_id uuid references auth.users on delete set null,   -- set when a signed-in student opens a ticket; they can then follow it
  status text not null default 'new' check (status in ('new','read','answered','resolved')),
  abuse_key text,   -- one-way hash of the sender's network address, used only to rate-limit spam
  created_at timestamptz not null default now()
);
create index messages_user_idx on public.messages (user_id, created_at desc);
create index messages_abuse_idx on public.messages (abuse_key, created_at desc);

-- the conversation on a ticket: replies from the student and from admins
create table public.message_replies (
  id bigserial primary key,
  message_id bigint not null references public.messages on delete cascade,
  author uuid references auth.users on delete set null,
  is_staff boolean not null default false,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index message_replies_msg_idx on public.message_replies (message_id, created_at);

-- everything an admin does is written here by the server-side functions
create table public.audit_log (
  id bigserial primary key,
  actor uuid references auth.users on delete set null,
  actor_email text,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

-- ───────────────────────────── helpers ─────────────────────────────

create function public.is_admin() returns boolean
language sql security definer stable set search_path = public as
$$ select coalesce((select is_admin from public.profiles where id = auth.uid()), false) $$;

-- admin OR teacher. Teachers can read students and scores and add/edit questions and answer tickets, but cannot touch money,
-- plans, PINs, prices, roles, schedules or deletions: those checks stay on is_admin().
create function public.is_staff() returns boolean
language sql security definer stable set search_path = public as
$$ select coalesce((select is_admin or is_teacher from public.profiles where id = auth.uid()), false) $$;

-- true when the signed-in user has a live (unexpired, not suspended) paid plan
create function public.is_paid() returns boolean
language sql security definer stable set search_path = public as
$$ select coalesce((select plan in ('student','pro') and (plan_expires is null or plan_expires > now()) and not suspended
                    from public.profiles where id = auth.uid()), false) $$;

create function public.has_access(subj text) returns boolean
language sql security definer stable set search_path = public as
$$ select subj in ('eng','mat') or public.is_paid() $$;

create function public.gen_reg() returns text language plpgsql as $$
declare r text;
begin
  loop
    r := 'JW-' || to_char(now(),'YYYY') || '-' || lpad((floor(random()*1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.profiles where reg_number = r);
  end loop;
  return r;
end $$;

-- Only the PIN Edge Function (which marks its users with app_metadata.pin = true; clients cannot set app_metadata)
-- may create accounts on the reserved PIN email domain. Stops people squatting a PIN's account.
create table public.pin_reservations (
  email text primary key,
  created_at timestamptz not null default now()
);
alter table public.pin_reservations enable row level security;
revoke all on public.pin_reservations from anon, authenticated;
grant all on public.pin_reservations to service_role;
create function public.guard_pin_domain() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if lower(new.email) like '%@pin.jambwise.ng'
     and coalesce(new.raw_app_meta_data->>'pin','') <> 'true'
     and not exists (select 1 from public.pin_reservations r
                      where r.email = lower(new.email) and r.created_at > now() - interval '2 minutes') then
    raise exception 'reserved email domain';
  end if;
  return new;
end $$;
create trigger guard_pin_domain before insert or update of email on auth.users
  for each row execute function public.guard_pin_domain();

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, reg_number, email, full_name)
  values (new.id, public.gen_reg(), new.email,
          left(coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), 'Student'), 100));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- keep profiles.email in step if the user changes their email
create function public.sync_profile_email() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;
create trigger on_auth_user_email after update of email on auth.users
  for each row when (old.email is distinct from new.email) execute function public.sync_profile_email();

-- ───────────── server-side actions (every one checks who is calling) ─────────────

-- Atomically redeems a PIN for a freshly created user. Called only by the pin-activate Edge Function (service role).
create function public.redeem_pin(p_pin text, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.access_pins;
begin
  select * into r from public.access_pins where pin = p_pin and used_by is null and used_at is null for update;
  if not found then raise exception 'pin unavailable'; end if;
  update public.access_pins set used_by = p_user, used_at = now() where pin = p_pin;
  update public.profiles
     set plan = r.plan,
         plan_expires = case when r.plan = 'free' then null else now() + make_interval(days => r.days) end,
         full_name = coalesce(nullif(r.student_name, ''), full_name)
   where id = p_user;
end $$;

-- Atomically completes a verified payment. Called only by the paystack-webhook Edge Function (service role).
-- Returns false if the payment was already processed, so a repeated webhook can never grant time twice.
create function public.fulfil_payment(p_ref text, p_amount int) returns boolean
language plpgsql security definer set search_path = public as $$
declare pay public.payments; base timestamptz;
begin
  select * into pay from public.payments where reference = p_ref and status = 'pending' for update;
  if not found or pay.amount_kobo <> p_amount or pay.user_id is null then return false; end if;
  update public.payments set status = 'paid', paid_at = now() where reference = p_ref;
  if pay.coupon_id is not null then update public.coupons set used_count = used_count + 1 where id = pay.coupon_id; end if;
  select greatest(coalesce(plan_expires, now()), now()) into base from public.profiles where id = pay.user_id;
  update public.profiles set plan = pay.plan, plan_expires = base + interval '30 days' where id = pay.user_id;
  return true;
end $$;

create function public.admin_log(p_action text, p_detail text) returns void
language sql security definer set search_path = public as
$$ insert into public.audit_log (actor, actor_email, action, detail)
   values (auth.uid(), (select email from public.profiles where id = auth.uid()), p_action, left(p_detail, 500)) $$;

create function public.new_pin_code() returns text
language plpgsql security definer set search_path = public as $$
declare al text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; s text; p text; i int;
begin
  loop
    s := '';
    for i in 1..8 loop s := s || substr(al, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1); end loop;
    p := substr(s,1,4) || '-' || substr(s,5,4);
    exit when not exists (select 1 from public.access_pins where pin = p);
  end loop;
  return p;
end $$;

create function public.admin_make_pin(p_plan text, p_name text, p_days int default 365) returns text
language plpgsql security definer set search_path = public as $$
declare p text;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  p := public.new_pin_code();
  insert into public.access_pins (pin, plan, student_name, days, created_by)
  values (p, p_plan, left(nullif(trim(p_name), ''), 100), p_days, auth.uid());
  perform public.admin_log('pin.create', p || ' (' || p_plan || ', ' || p_days || ' days)');
  return p;
end $$;

-- bulk PIN creation (1-100 at a time) for tutors handing out many keys
create function public.admin_make_pins(p_plan text, p_days int, p_count int) returns text[]
language plpgsql security definer set search_path = public as $$
declare out text[] := '{}'; p text; i int;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_count is null or p_count < 1 or p_count > 100 then raise exception 'count must be 1-100'; end if;
  for i in 1..p_count loop
    p := public.new_pin_code();
    insert into public.access_pins (pin, plan, days, created_by) values (p, p_plan, p_days, auth.uid());
    out := out || p;
  end loop;
  perform public.admin_log('pin.bulk', p_count || ' x ' || p_plan || ' (' || p_days || ' days)');
  return out;
end $$;

create function public.admin_set_student(target uuid, p_name text, p_course text, p_school text, p_suspended boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  update public.profiles
     set full_name = left(nullif(trim(p_name), ''), 100), course = left(p_course, 100),
         school = left(p_school, 100), suspended = coalesce(p_suspended, false)
   where id = target;
  perform public.admin_log(case when coalesce(p_suspended, false) then 'student.suspend' else 'student.edit' end,
                           (select reg_number from public.profiles where id = target));
end $$;

create function public.admin_set_plan(target uuid, p_plan text, p_days int default 30) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  update public.profiles
     set plan = p_plan,
         plan_expires = case when p_plan = 'free' then null else now() + make_interval(days => greatest(1, least(coalesce(p_days, 30), 3650))) end
   where id = target;
  perform public.admin_log('student.plan', (select reg_number from public.profiles where id = target) || ' -> ' || p_plan);
end $$;

-- promote / demote an admin (you cannot change your own role, so the last admin cannot lock everyone out)
create function public.admin_set_role(target uuid, p_admin boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if target = auth.uid() then raise exception 'you cannot change your own role'; end if;
  update public.profiles set is_admin = coalesce(p_admin, false), is_teacher = false where id = target;
  perform public.admin_log(case when p_admin then 'admin.grant' else 'admin.revoke' end,
                           (select reg_number from public.profiles where id = target));
end $$;

-- Set a person's role: 'student' (no staff rights), 'teacher' or 'admin'. Admins only; you cannot change your own role.
create function public.admin_set_staff_role(target uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_role not in ('student','teacher','admin') then raise exception 'unknown role'; end if;
  if target = auth.uid() then raise exception 'you cannot change your own role'; end if;
  update public.profiles set is_admin = (p_role = 'admin'), is_teacher = (p_role = 'teacher') where id = target;
  perform public.admin_log('role.' || p_role, (select reg_number from public.profiles where id = target));
end $$;

create function public.admin_reset_progress(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  delete from public.attempts where user_id = target;
  perform public.admin_log('student.reset', (select reg_number from public.profiles where id = target));
end $$;

-- Two timed exams, both saved in `attempts`: kind 'mock' (CBT Mock, the student can see the score) and kind 'hall' (ExamHall,
-- scores are visible to admins only). Each is written ONCE per student: a second scored one is refused (the advisory lock makes
-- two taps at the same moment safe). Only an admin can allow a retake.
create function public.one_exam_per_student() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind in ('mock','hall') and new.mock_score is not null then
    -- a scheduled ExamHall cannot be submitted before it opens (the clock is the server's)
    if exists (select 1 from public.exam_settings where kind = new.kind and opens_at is not null and now() < opens_at) then
      raise exception 'exam_not_open: This exam has not opened yet.';
    end if;
    perform pg_advisory_xact_lock(hashtext(new.kind || ':' || new.user_id::text));
    if exists (select 1 from public.attempts where user_id = new.user_id and kind = new.kind and mock_score is not null) then
      raise exception 'mock_already_taken: You have already submitted this exam.';
    end if;
  end if;
  return new;
end $$;
create trigger attempts_one_exam before insert on public.attempts
  for each row execute function public.one_exam_per_student();

-- The student's own view of an exam: only WHEN they submitted (null = not yet), never the score. This is how ExamHall is checked,
-- because ExamHall rows are hidden from students; for CBT Mock the student may also read the rows themselves.
create function public.my_exam_status(p_kind text) returns timestamptz
language sql security definer stable set search_path = public as $$
  select max(created_at) from public.attempts where user_id = auth.uid() and kind = p_kind and kind in ('mock','hall') and mock_score is not null $$;

-- Admin: let one student write an exam again (removes only that exam's results; practice history stays).
create function public.admin_allow_retake(target uuid, p_kind text default 'mock') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_kind not in ('mock','hall') then raise exception 'unknown exam'; end if;
  delete from public.attempts where user_id = target and kind = p_kind;
  delete from public.exam_events where user_id = target and kind = p_kind;   -- a retake starts with a clean record
  perform public.admin_log(p_kind || '.retake', (select reg_number from public.profiles where id = target));
end $$;

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
     where public.is_admin() or (not p.is_admin and not p.is_teacher)   -- a teacher sees students only, never admins or other teachers
     group by p.id order by p.created_at desc limit 2000;
end $$;

create function public.admin_stats() returns table (students bigint, paying bigint, revenue_kobo bigint, mocks bigint)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query select
    (select count(*) from public.profiles),
    (select count(*) from public.profiles where plan <> 'free' and (plan_expires is null or plan_expires > now())),
    (select coalesce(sum(amount_kobo), 0) from public.payments where status = 'paid'),
    (select count(*) from public.attempts where mock_score is not null);
end $$;

-- Ticket replies go through these two functions so the status always follows the conversation:
-- a staff reply marks the ticket 'answered'; a student reply puts it back to 'new' (needs attention).
create function public.ticket_reply(p_id bigint, p_body text) returns void
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

create function public.ticket_close(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare m public.messages;
begin
  select * into m from public.messages where id = p_id;
  if not found or (not public.is_staff() and m.user_id is distinct from auth.uid()) then raise exception 'not allowed'; end if;
  update public.messages set status = 'resolved' where id = p_id;
  if public.is_staff() then perform public.admin_log('ticket.resolve', '#' || p_id); end if;
end $$;

-- Spam protection for tickets and contact messages. Runs before every insert, whoever sends it.
--   students: 5 tickets an hour (10 question reports an hour), 25 a day
--   guests (sent through the contact-submit Edge Function): 3 an hour per email, 10 an hour per network address,
--           and 120 an hour across the whole site, so a flood cannot bury real tickets
--   nobody may send the same text twice in a day. Admins are never limited.
create function public.limit_ticket_rate() returns trigger language plpgsql security definer set search_path = public as $$
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
create trigger limit_ticket_rate before insert on public.messages
  for each row execute function public.limit_ticket_rate();

-- Bulk question import (the admin Questions tab sends up to 500 rows at a time). Rows that are invalid are skipped,
-- questions that already exist in that subject are skipped, and the whole import is one line in the activity log.
create function public.admin_import_questions(p_rows jsonb) returns jsonb
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
      and (r->>'subject') in ('eng','mat','phy','chm','bio','gov','eco','com','agr','acc','mkt','lit','irk','crk','hec','cst','geo')
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

-- Price and question edits are made straight from the admin screens, so a trigger writes them to the log.
create function public.log_content_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;   -- seeding / SQL editor: not an admin action
  if current_setting('jw.bulk', true) = '1' then return coalesce(new, old); end if;   -- bulk import logs one summary line instead
  if tg_table_name = 'plans' then
    perform public.admin_log('plan.price', new.id || ' -> ' || new.price_kobo);
  else
    perform public.admin_log('question.' || case tg_op when 'INSERT' then 'add' when 'UPDATE' then 'edit' else 'delete' end,
                             coalesce(new.id, old.id)::text);
  end if;
  return coalesce(new, old);
end $$;
create trigger log_plans after update on public.plans for each row execute function public.log_content_change();
create trigger log_questions after insert or update or delete on public.questions for each row execute function public.log_content_change();

-- ExamHall controls: an optional sitting window (students can only start between opens_at and closes_at), the number of warnings
-- before an automatic submit, and a log of "left the exam screen" events that admins see on the Scoresheet.
create table if not exists public.exam_settings (
  kind text primary key check (kind in ('mock','hall')),
  opens_at timestamptz,
  closes_at timestamptz,
  max_violations int not null default 3 check (max_violations between 0 and 20),   -- 0 = warn only, never auto-submit
  results_released boolean not null default false,   -- ExamHall: when true, students can see their own score
  updated_at timestamptz not null default now(),
  check (opens_at is null or closes_at is null or closes_at > opens_at)
);
create table if not exists public.exam_events (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('mock','hall')),
  type text not null check (type in ('started','resumed','left_tab','left_fullscreen','limit_reached','submitted')),
  occurred_at timestamptz not null default now(),
  detail text check (char_length(detail) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists exam_events_idx on public.exam_events (kind, user_id, occurred_at);
alter table public.exam_settings enable row level security;
alter table public.exam_events enable row level security;   -- no policies: everything goes through the functions below

-- What a student needs to know before starting: the window, the warning limit and the SERVER's clock (so a wrong phone clock cannot open the exam).
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

-- Admin: show or hide ExamHall scores to the students who wrote it. Hidden by default.
create or replace function public.admin_set_results_released(p_kind text, p_released boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_kind not in ('mock','hall') then raise exception 'unknown exam'; end if;
  insert into public.exam_settings (kind, results_released, updated_at) values (p_kind, coalesce(p_released, false), now())
    on conflict (kind) do update set results_released = excluded.results_released, updated_at = now();
  perform public.admin_log(p_kind || case when p_released then '.release' else '.unrelease' end, case when p_released then 'results shown to students' else 'results hidden from students' end);
end $$;

-- A student's own result for an exam. ExamHall returns only the date until the admin releases results; then it returns the score too.
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

-- A student's browser reports each time they leave the exam screen. Capped so it cannot be used to flood the table.
create or replace function public.log_exam_event(p_kind text, p_type text, p_at timestamptz, p_detail text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_kind not in ('mock','hall') or p_type not in ('started','resumed','left_tab','left_fullscreen','limit_reached','submitted') then return; end if;
  if (select count(*) from public.exam_events where user_id = auth.uid() and kind = p_kind) >= 300 then return; end if;
  insert into public.exam_events (user_id, kind, type, occurred_at, detail)
    values (auth.uid(), p_kind, p_type, least(coalesce(p_at, now()), now()), left(p_detail, 200));
end $$;

drop function if exists public.admin_exam_events(text);   -- replaced by the version with an optional student filter
create or replace function public.admin_exam_events(p_kind text, p_user uuid default null) returns table (user_id uuid, type text, occurred_at timestamptz, detail text)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'not allowed'; end if;
  return query select e.user_id, e.type, e.occurred_at, e.detail from public.exam_events e
    where e.kind = p_kind and (p_user is null or e.user_id = p_user) order by e.occurred_at;
end $$;

-- ───────────── notifications (the bell) and the admin ↔ teacher chat ─────────────
create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null check (char_length(title) <= 200),
  body text check (char_length(body) <= 500),
  link text check (char_length(link) <= 200),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists notif_read on public.notifications;
create policy notif_read on public.notifications for select to authenticated using (user_id = auth.uid());

create table if not exists public.staff_chat (
  id bigint generated always as identity primary key,
  teacher_id uuid not null references public.profiles(id) on delete cascade,   -- the thread belongs to one teacher; every admin can read and write it
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists staff_chat_idx on public.staff_chat (teacher_id, id);
alter table public.staff_chat enable row level security;
drop policy if exists chat_read on public.staff_chat;
create policy chat_read on public.staff_chat for select to authenticated using (
  public.is_admin() or (teacher_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_teacher)));

-- Internal helper: adds a notification. Repeated chat pings collapse into the one unread notification.
create or replace function public.notify_user(p_user uuid, p_kind text, p_title text, p_body text, p_link text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_kind = 'chat' then
    update public.notifications set title = left(p_title, 200), body = left(p_body, 500), created_at = now()
     where user_id = p_user and kind = 'chat' and link = p_link and read_at is null;
    if found then return; end if;
  end if;
  insert into public.notifications (user_id, kind, title, body, link) values (p_user, p_kind, left(p_title, 200), left(p_body, 500), p_link);
end $$;

create or replace function public.pin_expiry_reminder() returns void
language plpgsql security definer set search_path = public as $$
declare p public.profiles; secs bigint; d int; h int; left_txt text;
begin
  if auth.uid() is null then return; end if;
  select * into p from public.profiles where id = auth.uid();
  if not found or p.is_admin or p.is_teacher or p.plan = 'free' or p.plan_expires is null then return; end if;
  if lower(coalesce(p.email, '')) not like '%@pin.jambwise.ng' then return; end if;
  if p.plan_expires <= now() or p.plan_expires > now() + interval '3 days' then return; end if;
  if exists (select 1 from public.notifications where user_id = p.id and kind = 'pin' and created_at > now() - interval '12 hours') then return; end if;
  secs := floor(extract(epoch from (p.plan_expires - now())));
  d := secs / 86400; h := (secs % 86400) / 3600;
  left_txt := case when d > 0 then d || (case when d = 1 then ' day ' else ' days ' end) || h || (case when h = 1 then ' hour' else ' hours' end)
                   when h > 0 then h || (case when h = 1 then ' hour' else ' hours' end) || ' ' || ((secs % 3600) / 60) || ' min'
                   else ((secs % 3600) / 60) || ' min' end;
  perform public.notify_user(p.id, 'pin', 'Your access PIN is about to expire',
    'Your access PIN ends in ' || left_txt || '. Please contact the Admin in the Customer Support section, or contact your tutor, to get a new PIN.',
    '/app/help');
end $$;
revoke execute on function public.pin_expiry_reminder() from public, anon, authenticated;

-- Opening the bell now also checks for the reminder (so it needs plpgsql and is no longer "stable").
create or replace function public.my_notifications() returns table (id bigint, kind text, title text, body text, link text, read_at timestamptz, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  perform public.pin_expiry_reminder();
  return query
    select n.id, n.kind, n.title, n.body, n.link, n.read_at, n.created_at
      from public.notifications n where n.user_id = auth.uid() order by n.created_at desc limit 30;
end $$;
revoke execute on function public.my_notifications() from public, anon;
grant execute on function public.my_notifications() to authenticated;


-- Marks your own notifications read: one (p_id), those with a link (p_link), or all of them (no arguments).
create or replace function public.mark_notifications_read(p_id bigint default null, p_link text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_id is null or id = p_id) and (p_link is null or link = p_link);
end $$;

-- Admin: show or hide results to the students who wrote the exam. Hidden by default. Showing them also rings every such student's bell.
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
    select distinct a.user_id, 'result',
           case p_kind when 'hall' then 'Your ExamHall result is out' else 'Your CBT Mock result is out' end,
           'Your result has been released. Tap to see your score.',
           case p_kind when 'hall' then '/app/examhall' else '/app/mock' end
      from public.attempts a where a.kind = p_kind and a.mock_score is not null;
  end if;
end $$;

-- Admin ↔ teacher chat. One thread per teacher; all admins share it.
create or replace function public.staff_chat_send(p_teacher uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); nm text; b text := trim(coalesce(p_body, '')); a record;
begin
  if not public.is_staff() then raise exception 'not allowed'; end if;
  if char_length(b) not between 1 and 2000 then raise exception 'message must be 1-2000 characters'; end if;
  if public.is_admin() then
    if not exists (select 1 from public.profiles where id = p_teacher and is_teacher) then raise exception 'not a teacher'; end if;
  elsif p_teacher is distinct from me then
    raise exception 'not allowed';
  end if;
  insert into public.staff_chat (teacher_id, sender_id, body) values (p_teacher, me, b);
  select full_name into nm from public.profiles where id = me;
  if public.is_admin() then
    perform public.notify_user(p_teacher, 'chat', 'Message from ' || coalesce(nm, 'admin'), b, '/app/admin/chat');
  else
    for a in select id from public.profiles where is_admin loop
      perform public.notify_user(a.id, 'chat', 'Message from ' || coalesce(nm, 'a teacher'), b, '/app/admin/teachers?chat=' || p_teacher);
    end loop;
  end if;
end $$;

create or replace function public.staff_chat_thread(p_teacher uuid) returns table (id bigint, sender_id uuid, sender_name text, body text, created_at timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  if not (public.is_admin() or (public.is_staff() and p_teacher = auth.uid())) then raise exception 'not allowed'; end if;
  return query
    select * from (
      select c.id, c.sender_id, p.full_name, c.body, c.created_at
        from public.staff_chat c join public.profiles p on p.id = c.sender_id
       where c.teacher_id = p_teacher order by c.id desc limit 200) t
    order by t.id;
end $$;

create or replace function public.staff_chat_inbox() returns table (teacher_id uuid, last_body text, last_at timestamptz, last_from uuid)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query select distinct on (c.teacher_id) c.teacher_id, c.body, c.created_at, c.sender_id from public.staff_chat c order by c.teacher_id, c.id desc;
end $$;

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
        dev text := left(coalesce(p_device, ''), 120); sid uuid; c public.parent_codes; tok text; fails int; ipfails int; why text; adm record; msg text;
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
  -- every admin gets it on their bell too (once per parent and student every 30 minutes, so a page refresh does not pile up)
  msg := nm || ' (' || rel || ') viewed ' || coalesce((select full_name from public.profiles where id = sid), 'a student') || '''s progress (' || reg || ').';
  for adm in select id from public.profiles where is_admin loop
    if not exists (select 1 from public.notifications n where n.user_id = adm.id and n.kind = 'parent' and n.body = msg and n.created_at > now() - interval '30 minutes') then
      perform public.notify_user(adm.id, 'parent', 'A parent signed in', msg, '/app/admin/parents');
    end if;
  end loop;
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

-- Lock the privileged functions down: only the roles that should call them can.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin(), public.is_staff(), public.is_paid(), public.has_access(text) to anon, authenticated;
grant execute on function public.admin_make_pin(text, text, int), public.admin_make_pins(text, int, int),
  public.admin_set_student(uuid, text, text, text, boolean), public.admin_set_plan(uuid, text, int),
  public.admin_set_role(uuid, boolean), public.admin_set_staff_role(uuid, text), public.admin_reset_progress(uuid), public.admin_allow_retake(uuid, text), public.my_exam_status(text),
  public.exam_window(text), public.admin_set_results_released(text, boolean), public.my_exam_result(text), public.admin_set_exam_window(text, timestamptz, timestamptz, int), public.log_exam_event(text, text, timestamptz, text), public.admin_exam_events(text, uuid),
  public.parent_code_create(), public.parent_code_revoke(), public.my_parent_access(), public.admin_parent_log(), public.admin_parent_revoke(uuid),
  public.my_notifications(), public.mark_notifications_read(bigint, text), public.staff_chat_send(uuid, text), public.staff_chat_thread(uuid), public.staff_chat_inbox(),
  public.admin_students(), public.admin_stats(), public.admin_import_questions(jsonb),
  public.ticket_reply(bigint, text), public.ticket_close(bigint) to authenticated;
-- admin_log and new_pin_code stay internal (revoked above): only the admin_* functions call them.
grant execute on function public.redeem_pin(text, uuid), public.fulfil_payment(text, int) to service_role;
grant execute on function public.parent_login(text, text, text, text, text, text), public.parent_report(text), public.parent_end(text) to service_role;

-- ───────────────────────── row level security ─────────────────────────

alter table public.plans enable row level security;
alter table public.profiles enable row level security;
alter table public.access_pins enable row level security;
alter table public.payments enable row level security;
alter table public.attempts enable row level security;
alter table public.questions enable row level security;
alter table public.messages enable row level security;
alter table public.audit_log enable row level security;
alter table public.message_replies enable row level security;

create policy plans_read on public.plans for select to anon, authenticated using (true);

create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or (public.is_staff() and not is_admin and not is_teacher));
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy pins_select on public.access_pins for select to authenticated using (public.is_admin());
create policy pins_delete on public.access_pins for delete to authenticated using (public.is_admin() and used_by is null);

create policy pay_read on public.payments for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- Students can read their own practice and CBT Mock results. ExamHall results are private to admins (the Scoresheet); a student can
-- only ask whether they have submitted (my_exam_status).
create policy att_read on public.attempts for select to authenticated using (public.is_staff() or (user_id = auth.uid() and kind in ('practice','mock')));
create policy att_insert on public.attempts for insert to authenticated with check (
  user_id = auth.uid()
  and public.has_access(subject)
  and (kind = 'practice' or public.is_paid())
  and not coalesce((select suspended from public.profiles where id = auth.uid()), true)
);
-- students may clear their practice history, but never a submitted exam (otherwise they could just delete it and write again)
create policy att_delete on public.attempts for delete to authenticated using (user_id = auth.uid() and kind = 'practice');

create policy q_read on public.questions for select to authenticated using (public.has_access(subject) or public.is_staff());
create policy q_admin_ins on public.questions for insert to authenticated with check (public.is_admin());   -- teachers send questions for review instead (see the end of this file)
create policy q_admin_upd on public.questions for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy q_admin_del on public.questions for delete to authenticated using (public.is_admin());

create policy plans_admin_upd on public.plans for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- tickets: only admins triage / delete; a student reads their own
-- Guests (not signed in) cannot write to this table at all: their messages go through the contact-submit Edge Function,
-- which checks a CAPTCHA first. Signed-in students may only open tickets as themselves, and the rate limit above applies.
create policy msg_send on public.messages for insert to authenticated
  with check (status = 'new' and user_id = auth.uid());
create policy msg_read on public.messages for select to authenticated using (public.is_staff() or user_id = auth.uid());
create policy reply_read on public.message_replies for select to authenticated using (
  public.is_staff() or exists (select 1 from public.messages m where m.id = message_id and m.user_id = auth.uid()));
create policy msg_upd on public.messages for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy msg_del on public.messages for delete to authenticated using (public.is_admin());

create policy audit_read on public.audit_log for select to authenticated using (public.is_admin());

-- Column-level privileges: students can edit only these profile columns. Plan, expiry, admin flag,
-- suspension and registration number are changeable only through the server-side functions above.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.plans to anon, authenticated;
grant select on public.profiles, public.access_pins, public.payments, public.attempts, public.questions to authenticated;
grant update (full_name, course, school, avatar, subjects, exam_date, study_hours) on public.profiles to authenticated;
grant insert, delete on public.attempts to authenticated;
grant delete on public.access_pins to authenticated;
grant usage on sequence public.attempts_id_seq to authenticated;

-- admin content tools (every policy above also checks is_admin())
grant insert, update, delete on public.questions to authenticated;
grant usage on sequence public.questions_id_seq to authenticated;
grant update (name, price_kobo) on public.plans to authenticated;
grant insert (name, email, topic, subject, body, user_id) on public.messages to authenticated;
grant usage on sequence public.messages_id_seq to authenticated;
grant select, delete on public.messages to authenticated;
grant update (status) on public.messages to authenticated;
grant select on public.audit_log to authenticated;
grant select on public.message_replies to authenticated;
grant select on public.notifications, public.staff_chat to authenticated;
grant select on public.parent_codes to authenticated;

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

-- ───────────────────────── institutions (schools) ─────────────────────────
-- Same as supabase/migrate-institutions.sql (which upgrades an existing project). Staff assigned to an institution see only its students.
-- ───────────── the institutions ─────────────
create table if not exists public.institutions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  name text not null unique check (char_length(name) between 2 and 120),
  location text check (char_length(location) <= 120),
  note text check (char_length(note) <= 200),
  logo text check (char_length(logo) <= 80000),   -- a small data:image picture, set from Admin > Institutions
  created_at timestamptz not null default now()
);
alter table public.institutions add column if not exists logo text check (char_length(logo) <= 80000);
alter table public.institutions enable row level security;
drop policy if exists inst_read on public.institutions;
create policy inst_read on public.institutions for select to anon, authenticated using (true);   -- school names are public: the home page lists them
revoke all on public.institutions from anon, authenticated;
grant select on public.institutions to anon, authenticated;

alter table public.profiles add column if not exists institution_id uuid references public.institutions(id) on delete set null;
alter table public.profiles add column if not exists inst_title text;
alter table public.profiles drop constraint if exists profiles_inst_title_check;
alter table public.profiles add constraint profiles_inst_title_check check (inst_title is null or inst_title in ('Teacher','Proprietor','Proprietress','Official'));
create index if not exists profiles_institution_idx on public.profiles (institution_id);
-- no new column is granted to students: institution_id and inst_title change only through admin_assign_institution below

insert into public.institutions (slug, name, location, note) values
  ('cms-grammar-school',      'CMS Grammar School',      'Bariga, Lagos State',        'Founded in 1859, the oldest secondary school in Nigeria'),
  ('kings-college',           'King''s College',         'Lagos Island, Lagos State',  null),
  ('jambwise',                'JAMBwise',                'Online',                     null),
  ('queens-college',          'Queen''s College',        'Yaba, Lagos State',          null),
  ('igbobi-college',          'Igbobi College',          'Yaba, Lagos State',          null),
  ('lagos-baptist-academy',   'Lagos Baptist Academy',   'Obanikoro, Lagos State',     null),
  ('grange-school',           'Grange School',           'Ikeja, Lagos State',         null),
  ('greensprings-school',     'Greensprings School',     'Anthony/Lekki, Lagos State', null),
  ('atlantic-hall',           'Atlantic Hall',           'Poka, Epe, Lagos State',     null)
on conflict (slug) do nothing;

-- ───────────── who may see whom ─────────────
create or replace function public.my_institution() returns uuid
language sql security definer stable set search_path = public as
$$ select institution_id from public.profiles where id = auth.uid() $$;

-- true when the signed-in person may look at this user's results: an admin, or staff whose institution matches (staff with none see all)
create or replace function public.staff_sees(p_user uuid) returns boolean
language sql security definer stable set search_path = public as
$$ select public.is_admin() or (public.is_staff() and (public.my_institution() is null or exists (
     select 1 from public.profiles s where s.id = p_user and s.institution_id = public.my_institution()))) $$;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or (public.is_staff() and not is_admin and not is_teacher and public.staff_sees(id)));

drop policy if exists att_read on public.attempts;
create policy att_read on public.attempts for select to authenticated
  using ((public.is_staff() and public.staff_sees(user_id)) or (user_id = auth.uid() and kind in ('practice','mock')));

drop policy if exists msg_read on public.messages;
create policy msg_read on public.messages for select to authenticated using ((public.is_staff() and public.staff_sees(user_id)) or user_id = auth.uid());
drop policy if exists msg_upd on public.messages;
create policy msg_upd on public.messages for update to authenticated using (public.is_staff() and public.staff_sees(user_id)) with check (public.is_staff());
drop policy if exists reply_read on public.message_replies;
create policy reply_read on public.message_replies for select to authenticated using (
  exists (select 1 from public.messages m where m.id = message_id and ((public.is_staff() and public.staff_sees(m.user_id)) or m.user_id = auth.uid())));

create or replace function public.ticket_reply(p_id bigint, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare m public.messages; staff boolean := public.is_staff();
begin
  select * into m from public.messages where id = p_id;
  if not found or (not staff and m.user_id is distinct from auth.uid()) or (staff and not public.staff_sees(m.user_id)) then raise exception 'not allowed'; end if;
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
  if not found or (not public.is_staff() and m.user_id is distinct from auth.uid()) or (public.is_staff() and not public.staff_sees(m.user_id)) then raise exception 'not allowed'; end if;
  update public.messages set status = 'resolved' where id = p_id;
  if public.is_staff() then perform public.admin_log('ticket.resolve', '#' || p_id); end if;
end $$;

create or replace function public.admin_exam_events(p_kind text, p_user uuid default null) returns table (user_id uuid, type text, occurred_at timestamptz, detail text)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'not allowed'; end if;
  return query select e.user_id, e.type, e.occurred_at, e.detail from public.exam_events e
    where e.kind = p_kind and (p_user is null or e.user_id = p_user) and public.staff_sees(e.user_id) order by e.occurred_at;
end $$;

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
     where public.is_admin() or (not p.is_admin and not p.is_teacher and public.staff_sees(p.id))   -- staff see students only, and only their own institution's
     group by p.id, i.name order by p.created_at desc limit 2000;
end $$;

-- ───────────── admin tools ─────────────
-- p_logo: null keeps the logo as it is, '' removes it, or a small data:image/... picture sets it
drop function if exists public.admin_save_institution(uuid, text, text, text);
create or replace function public.admin_save_institution(p_id uuid, p_name text, p_location text, p_note text, p_logo text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare nm text := btrim(coalesce(p_name, '')); sl text; out_id uuid; lg text;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if char_length(nm) not between 2 and 120 then raise exception 'Enter the institution name (2 to 120 characters).'; end if;
  if p_logo is not null and p_logo <> '' and (p_logo !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' or char_length(p_logo) > 80000) then
    raise exception 'The logo must be a small PNG, JPEG or WebP picture.';
  end if;
  lg := case when p_logo = '' then null else p_logo end;
  if p_id is null then
    sl := trim(both '-' from regexp_replace(lower(nm), '[^a-z0-9]+', '-', 'g'));
    if sl = '' then raise exception 'Enter a name with letters or numbers.'; end if;
    if exists (select 1 from public.institutions where slug = sl) then sl := left(sl, 50) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 5); end if;
    insert into public.institutions (slug, name, location, note, logo) values (left(sl, 60), nm, nullif(btrim(p_location), ''), nullif(btrim(p_note), ''), lg) returning id into out_id;
    perform public.admin_log('institution.add', nm);
  else
    update public.institutions set name = nm, location = nullif(btrim(p_location), ''), note = nullif(btrim(p_note), ''),
           logo = case when p_logo is null then logo else lg end
     where id = p_id returning id into out_id;
    if out_id is null then raise exception 'institution not found'; end if;
    perform public.admin_log('institution.edit', nm);
  end if;
  return out_id;
exception when unique_violation then raise exception 'An institution with this name already exists.';
end $$;

create or replace function public.admin_delete_institution(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare nm text;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  delete from public.institutions where id = p_id returning name into nm;   -- people in it are un-assigned (on delete set null)
  if nm is null then raise exception 'institution not found'; end if;
  perform public.admin_log('institution.delete', nm);
end $$;

-- Put a student or staff member in an institution (p_inst null takes them out). p_title is for staff: Teacher, Proprietor, Proprietress or Official.
create or replace function public.admin_assign_institution(p_user uuid, p_inst uuid, p_title text default null) returns void
language plpgsql security definer set search_path = public as $$
declare t public.profiles; inst text;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  select * into t from public.profiles where id = p_user;
  if not found then raise exception 'person not found'; end if;
  if p_inst is not null then
    select name into inst from public.institutions where id = p_inst;
    if inst is null then raise exception 'institution not found'; end if;
  end if;
  if p_title is not null and p_title not in ('Teacher','Proprietor','Proprietress','Official') then raise exception 'unknown title'; end if;
  update public.profiles
     set institution_id = p_inst,
         inst_title = case when p_inst is null or not is_teacher then null else coalesce(p_title, inst_title, 'Teacher') end
   where id = p_user;
  perform public.admin_log('institution.assign', t.reg_number || ' -> ' || coalesce(inst, 'none'));
  if p_inst is not null and t.is_teacher then
    perform public.notify_user(p_user, 'teacher', 'You were assigned to ' || inst, 'You now see the results of ' || inst || '''s students in your panel.', '/app/admin/students');
  end if;
end $$;

revoke execute on function public.my_institution(), public.staff_sees(uuid), public.admin_students(),
  public.admin_save_institution(uuid, text, text, text, text), public.admin_delete_institution(uuid), public.admin_assign_institution(uuid, uuid, text) from public, anon;
grant execute on function public.my_institution(), public.staff_sees(uuid), public.admin_students(),
  public.admin_save_institution(uuid, text, text, text, text), public.admin_delete_institution(uuid), public.admin_assign_institution(uuid, uuid, text) to authenticated;
grant execute on function public.ticket_reply(bigint, text), public.ticket_close(bigint), public.admin_exam_events(text, uuid) to authenticated;

-- ───────────────────────── sign-in log (Admin > Activity) ─────────────────────────
-- Same as supabase/migrate-logs.sql.
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

-- ───────────── who is online (migrate-presence.sql) ─────────────
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

-- ───────────── question reports go to the uploader (migrate-report.sql) ─────────────
alter table public.questions add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.questions alter column created_by set default auth.uid();
alter table public.messages add column if not exists question_id bigint references public.questions(id) on delete set null;
alter table public.messages add column if not exists assigned_to uuid references public.profiles(id) on delete set null;
create index if not exists messages_assigned_idx on public.messages (assigned_to);

-- make sure a "question" ticket is an allowed topic (older databases may not have it)
alter table public.messages drop constraint if exists messages_topic_check;
alter table public.messages add constraint messages_topic_check check (topic in ('general','payment','pin','bug','question','other'));

-- the uploader is always the real signed-in person: nobody can claim a question as someone else's
create or replace function public.stamp_question_owner() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
  else
    new.created_by := old.created_by;
  end if;
  return new;
end $$;
drop trigger if exists stamp_question_owner on public.questions;
create trigger stamp_question_owner before insert or update on public.questions for each row execute function public.stamp_question_owner();

-- the assigned teacher can read, answer and close the ticket even when the student belongs to another institution
drop policy if exists msg_read on public.messages;
create policy msg_read on public.messages for select to authenticated
  using ((public.is_staff() and (public.staff_sees(user_id) or assigned_to = auth.uid())) or user_id = auth.uid());
drop policy if exists msg_upd on public.messages;
create policy msg_upd on public.messages for update to authenticated
  using (public.is_staff() and (public.staff_sees(user_id) or assigned_to = auth.uid())) with check (public.is_staff());
drop policy if exists reply_read on public.message_replies;
create policy reply_read on public.message_replies for select to authenticated using (
  exists (select 1 from public.messages m where m.id = message_id
          and ((public.is_staff() and (public.staff_sees(m.user_id) or m.assigned_to = auth.uid())) or m.user_id = auth.uid())));

-- the name shown on a staff reply: a teacher's own name (admins stay "JAMBwise support")
alter table public.message_replies add column if not exists author_name text;
update public.message_replies r set author_name = trim(p.full_name) || ' (Teacher)'
  from public.profiles p where p.id = r.author and r.author_name is null and r.is_staff and p.is_teacher and not p.is_admin and nullif(trim(p.full_name), '') is not null;

create or replace function public.ticket_reply(p_id bigint, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare m public.messages; staff boolean := public.is_staff(); me public.profiles; nm text; adm record;
begin
  select * into m from public.messages where id = p_id;
  if not found or (not staff and m.user_id is distinct from auth.uid())
     or (staff and not (public.staff_sees(m.user_id) or m.assigned_to = auth.uid())) then raise exception 'not allowed'; end if;
  if auth.uid() is null or char_length(trim(coalesce(p_body, ''))) not between 1 and 2000 then raise exception 'message must be 1-2000 characters'; end if;
  select * into me from public.profiles where id = auth.uid();
  if staff and me.is_teacher and not me.is_admin and nullif(trim(me.full_name), '') is not null then nm := left(trim(me.full_name), 90) || ' (Teacher)'; end if;
  insert into public.message_replies (message_id, author, is_staff, body, author_name) values (p_id, auth.uid(), staff, trim(p_body), nm);
  update public.messages set status = case when staff then 'answered' else 'new' end where id = p_id;
  if staff then
    perform public.admin_log('ticket.reply', '#' || p_id);
    if m.user_id is not null then   -- the student's bell rings
      perform public.notify_user(m.user_id, 'ticket', 'New reply on your ticket', coalesce(nm, 'JAMBwise support') || ': ' || left(trim(p_body), 200), '/app/help');
    end if;
  elsif m.assigned_to is not null then   -- the student wrote back: tell the teacher the ticket was sent to
    perform public.notify_user(m.assigned_to, 'ticket', 'Student replied', coalesce(m.name, 'A student') || ' replied on ticket #' || p_id, '/app/admin/messages');
  end if;
end $$;

create or replace function public.ticket_close(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare m public.messages;
begin
  select * into m from public.messages where id = p_id;
  if not found or (not public.is_staff() and m.user_id is distinct from auth.uid())
     or (public.is_staff() and not (public.staff_sees(m.user_id) or m.assigned_to = auth.uid())) then raise exception 'not allowed'; end if;
  update public.messages set status = 'resolved' where id = p_id;
  if public.is_staff() then perform public.admin_log('ticket.resolve', '#' || p_id); end if;
end $$;

-- the student's "Report this question" button
create or replace function public.report_question(p_question bigint, p_subject text, p_body text) returns bigint
language plpgsql security definer set search_path = public as $$
declare me public.profiles; q public.questions; up public.profiles; target uuid; who text; mid bigint; adm record; nm text; txt text;
begin
  select * into me from public.profiles where id = auth.uid();
  if not found then raise exception 'not allowed'; end if;
  select * into q from public.questions where id = p_question;
  if found and q.created_by is not null then
    select * into up from public.profiles where id = q.created_by;
    if found and (up.is_admin or up.is_teacher) then target := up.id; end if;
  end if;
  who := case when target is null then 'the admins' else coalesce(nullif(trim(up.full_name), ''), 'the uploader') end;
  nm := coalesce(nullif(trim(me.full_name), ''), 'Student');
  insert into public.messages (name, email, topic, subject, body, user_id, question_id, assigned_to)
  values (left(nm, 100), coalesce(nullif(me.email, ''), (select email from auth.users where id = me.id)), 'question', left(p_subject, 120),
          left('Sent to: ' || who || E'\n' || coalesce(p_body, ''), 2000), me.id, p_question, target)
  returning id into mid;
  txt := nm || ' reported a question: ' || coalesce(left(p_subject, 120), 'question #' || p_question);
  if target is not null then
    perform public.notify_user(target, 'question', 'Question reported', txt, '/app/admin/messages');
  else
    for adm in select id from public.profiles where is_admin loop
      perform public.notify_user(adm.id, 'question', 'Question reported', txt, '/app/admin/messages');
    end loop;
  end if;
  return mid;
end $$;
revoke execute on function public.report_question(bigint, text, text) from public, anon;
grant execute on function public.report_question(bigint, text, text) to authenticated;

-- ───────────── Admin > Mail (migrate-mail.sql) ─────────────
alter table public.messages drop constraint if exists messages_topic_check;
alter table public.messages add constraint messages_topic_check check (topic in ('general','payment','pin','bug','question','suspended','other'));

-- every admin's bell rings when new mail arrives, and when a signed-in student opens a support ticket (migrate-ticket-notify.sql)
alter table public.messages add column if not exists via_contact boolean not null default false;   -- true when a signed-in person used the Contact page (shows in Mail; they still see replies on their Help page)
grant insert (via_contact) on public.messages to authenticated;
create or replace function public.notify_mail() returns trigger language plpgsql security definer set search_path = public as $$
declare adm record; txt text; is_ticket boolean;
begin
  if new.question_id is not null then return new; end if;   -- a reported question notifies its own owner in report_question()
  is_ticket := new.user_id is not null and new.topic <> 'suspended' and not new.via_contact;   -- via_contact: sent from the Contact page, so it is mail even when the sender is signed in
  txt := coalesce(nullif(new.name, ''), 'Someone') || ': ' || left(coalesce(nullif(new.subject, ''), new.body), 160);
  begin   -- a problem with the bell must never lose the message itself
    for adm in select id from public.profiles where is_admin loop
      if is_ticket then
        perform public.notify_user(adm.id, 'ticket', 'New support ticket', txt, '/app/admin/messages');
      else
        perform public.notify_user(adm.id, 'mail', case when new.topic = 'suspended' then 'Message from a suspended account' else 'New mail' end, txt, '/app/admin/mail');
      end if;
    end loop;
  exception when others then
    raise warning 'notify_mail skipped: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists notify_mail on public.messages;
create trigger notify_mail after insert on public.messages for each row execute function public.notify_mail();

-- ───────────── teachers in charge see ExamHall scores (migrate-hall-scores.sql) ─────────────
drop policy if exists att_read on public.attempts;
create policy att_read on public.attempts for select to authenticated
  using ((public.is_staff() and public.staff_sees(user_id)) or (user_id = auth.uid() and kind in ('practice','mock')));

create or replace function public.admin_exam_events(p_kind text, p_user uuid default null) returns table (user_id uuid, type text, occurred_at timestamptz, detail text)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'not allowed'; end if;
  return query select e.user_id, e.type, e.occurred_at, e.detail from public.exam_events e
    where e.kind = p_kind and (p_user is null or e.user_id = p_user) and public.staff_sees(e.user_id) order by e.occurred_at;
end $$;
revoke execute on function public.admin_exam_events(text, uuid) from public, anon;
grant execute on function public.admin_exam_events(text, uuid) to authenticated;
grant select on public.attempts to authenticated;

-- ───────────── teachers see students only (migrate-teacher-students.sql) ─────────────
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

-- ───────────── teacher questions wait for admin review (migrate-question-review.sql) ─────────────
create table if not exists public.question_submissions (
  id bigserial primary key,
  submitted_by uuid not null references public.profiles(id) on delete cascade,
  subject text not null check (char_length(subject) between 2 and 10),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  answer int not null check (answer between 0 and 3),
  explanation text check (char_length(explanation) <= 1000),
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  decline_reason text check (char_length(decline_reason) <= 300),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists question_submissions_status_idx on public.question_submissions (status, created_at);
create index if not exists question_submissions_user_idx on public.question_submissions (submitted_by, created_at desc);
alter table public.question_submissions enable row level security;   -- no policies: only the functions below can reach it
revoke all on public.question_submissions from anon, authenticated;

-- an approved question belongs to the teacher who wrote it (so reports about it go to that teacher)
create or replace function public.stamp_question_owner() returns trigger language plpgsql security definer set search_path = public as $$
declare owner text := nullif(current_setting('jw.owner', true), '');
begin
  if tg_op = 'INSERT' then
    if owner is not null then new.created_by := owner::uuid;
    elsif auth.uid() is not null then new.created_by := auth.uid(); end if;
  else
    new.created_by := old.created_by;
  end if;
  return new;
end $$;

-- teachers can no longer add live questions directly; they go through submit_question()
drop policy if exists q_admin_ins on public.questions;
create policy q_admin_ins on public.questions for insert to authenticated with check (public.is_admin());

-- teacher: send a question for review
create or replace function public.submit_question(p_subject text, p_body text, p_options jsonb, p_answer int, p_explanation text) returns bigint
language plpgsql security definer set search_path = public as $$
declare me record; new_id bigint; adm record; qbody text := btrim(coalesce(p_body, '')); opt jsonb;
begin
  if not public.is_staff() then raise exception 'not allowed'; end if;
  if public.is_admin() then raise exception 'Admins add questions directly.'; end if;
  select id, full_name into me from public.profiles where id = auth.uid();
  if qbody = '' or char_length(qbody) > 1000 then raise exception 'Write the question (up to 1000 characters).'; end if;
  if jsonb_typeof(p_options) is distinct from 'array' or jsonb_array_length(p_options) <> 4 then raise exception 'Fill in all four options.'; end if;
  for opt in select value from jsonb_array_elements(p_options) loop
    if jsonb_typeof(opt) <> 'string' or char_length(btrim(opt #>> '{}')) not between 1 and 300 then raise exception 'Fill in all four options.'; end if;
  end loop;
  if p_answer is null or p_answer not between 0 and 3 then raise exception 'Choose the correct option.'; end if;
  if exists (select 1 from public.questions where subject = p_subject and body = qbody) then raise exception 'That question already exists in this subject.'; end if;
  if exists (select 1 from public.question_submissions where status = 'pending' and subject = p_subject and body = qbody) then raise exception 'That question is already waiting for review.'; end if;
  if (select count(*) from public.question_submissions where submitted_by = me.id and status = 'pending') >= 100 then raise exception 'You have many questions waiting for review. Please wait for the admin to review them.'; end if;
  insert into public.question_submissions (submitted_by, subject, body, options, answer, explanation)
  values (me.id, p_subject, qbody, (select jsonb_agg(btrim(o #>> '{}')) from jsonb_array_elements(p_options) o), p_answer, nullif(btrim(coalesce(p_explanation, '')), ''))
  returning id into new_id;
  for adm in select id from public.profiles where is_admin loop
    perform public.notify_user(adm.id, 'review', 'Question to review', coalesce(nullif(me.full_name, ''), 'A teacher') || ' added a question in ' || upper(p_subject) || ' and it is waiting for your review.', '/app/admin/questions?review=1');
  end loop;
  return new_id;
end $$;
revoke execute on function public.submit_question(text, text, jsonb, int, text) from public, anon;
grant execute on function public.submit_question(text, text, jsonb, int, text) to authenticated;

-- teacher: my own submissions and what happened to them
create or replace function public.my_question_submissions() returns table (id bigint, subject text, body text, status text, decline_reason text, created_at timestamptz, reviewed_at timestamptz)
language sql security definer stable set search_path = public as $$
  select s.id, s.subject, s.body, s.status, s.decline_reason, s.created_at, s.reviewed_at
    from public.question_submissions s where s.submitted_by = auth.uid() order by s.created_at desc limit 100;
$$;
revoke execute on function public.my_question_submissions() from public, anon;
grant execute on function public.my_question_submissions() to authenticated;

-- admin: the questions waiting for review
create or replace function public.admin_pending_questions() returns table (id bigint, subject text, body text, options jsonb, answer int, explanation text, submitted_by uuid, teacher_name text, created_at timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query select s.id, s.subject, s.body, s.options, s.answer, s.explanation, s.submitted_by, p.full_name, s.created_at
    from public.question_submissions s left join public.profiles p on p.id = s.submitted_by
   where s.status = 'pending' order by s.created_at limit 500;
end $$;
revoke execute on function public.admin_pending_questions() from public, anon;
grant execute on function public.admin_pending_questions() to authenticated;

-- admin: Accept (puts the question live) or Decline (with an optional reason). The teacher is told either way.
create or replace function public.admin_review_question(p_id bigint, p_approve boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare s record; n int; why text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  select * into s from public.question_submissions where id = p_id and status = 'pending' for update;
  if not found then raise exception 'This question has already been reviewed.'; end if;
  if p_approve then
    perform set_config('jw.owner', s.submitted_by::text, true);
    insert into public.questions (subject, body, options, answer, explanation) values (s.subject, s.body, s.options, s.answer, s.explanation)
    on conflict (subject, body) do nothing;
    get diagnostics n = row_count;
    perform set_config('jw.owner', '', true);
    if n = 0 then raise exception 'That question already exists in this subject. Decline it instead.'; end if;
    update public.question_submissions set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
    perform public.notify_user(s.submitted_by, 'review', 'Question approved', 'Your question has been Approved and Added Successfully.', '/app/admin/questions');
  else
    update public.question_submissions set status = 'declined', decline_reason = left(why, 300), reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
    perform public.notify_user(s.submitted_by, 'review', 'Question not approved', 'Your question was not approved.' || coalesce(' Reason: ' || why, ''), '/app/admin/questions');
  end if;
end $$;
revoke execute on function public.admin_review_question(bigint, boolean, text) from public, anon;
grant execute on function public.admin_review_question(bigint, boolean, text) to authenticated;

notify pgrst, 'reload schema';

-- ───────────── Rate & suggest and announcements (migrate-feedback-announcements.sql) ─────────────
-- ───────────── Rate & suggest ─────────────
create table if not exists public.feedback (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating int check (rating between 1 and 5),
  kind text not null default 'feedback' check (kind in ('feedback','feature','bug')),
  message text check (char_length(message) <= 2000),
  status text not null default 'new' check (status in ('new','done')),
  created_at timestamptz not null default now(),
  check (rating is not null or char_length(btrim(coalesce(message, ''))) > 0)
);
create index if not exists feedback_created_idx on public.feedback (created_at desc);
create index if not exists feedback_user_idx on public.feedback (user_id, created_at desc);
alter table public.feedback enable row level security;     -- no policies: only the functions below reach it
revoke all on public.feedback from anon, authenticated;

create or replace function public.submit_feedback(p_rating int, p_kind text, p_message text) returns bigint
language plpgsql security definer set search_path = public as $$
declare me record; msg text := nullif(btrim(coalesce(p_message, '')), ''); new_id bigint; adm record; kind_label text;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  select id, full_name into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'not allowed'; end if;
  if p_kind not in ('feedback','feature','bug') then raise exception 'Choose Feedback, Feature idea or Bug.'; end if;
  if p_rating is not null and p_rating not between 1 and 5 then raise exception 'The rating must be from 1 to 5 stars.'; end if;
  if p_rating is null and msg is null then raise exception 'Please give a star rating or write a message.'; end if;
  if msg is not null and char_length(msg) > 2000 then raise exception 'Your message is too long (2000 characters at most).'; end if;
  if (select count(*) from public.feedback where user_id = me.id and created_at > now() - interval '1 day') >= 5 then
    raise exception 'You have sent several already today. Thank you! Please try again tomorrow.';
  end if;
  insert into public.feedback (user_id, rating, kind, message) values (me.id, p_rating, p_kind, msg) returning id into new_id;
  kind_label := case p_kind when 'feature' then 'a feature idea' when 'bug' then 'a bug report' else 'feedback' end;
  for adm in select id from public.profiles where is_admin loop
    perform public.notify_user(adm.id, 'feedback', 'New ' || case p_kind when 'feature' then 'feature idea' when 'bug' then 'bug report' else 'feedback' end,
      coalesce(nullif(me.full_name, ''), 'Someone') || ' sent ' || kind_label || coalesce(' (' || p_rating || ' stars)', '') || '.', '/app/admin/feedback');
  end loop;
  return new_id;
end $$;
revoke execute on function public.submit_feedback(int, text, text) from public, anon;
grant execute on function public.submit_feedback(int, text, text) to authenticated;

create or replace function public.admin_feedback() returns table (id bigint, user_id uuid, name text, email text, role text, rating int, kind text, message text, status text, created_at timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query select f.id, f.user_id, p.full_name, p.email, case when p.is_teacher then 'teacher' else 'student' end, f.rating, f.kind, f.message, f.status, f.created_at
    from public.feedback f left join public.profiles p on p.id = f.user_id order by f.created_at desc limit 2000;
end $$;
revoke execute on function public.admin_feedback() from public, anon;
grant execute on function public.admin_feedback() to authenticated;

create or replace function public.admin_set_feedback_status(p_id bigint, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_status not in ('new','done') then raise exception 'bad status'; end if;
  update public.feedback set status = p_status where id = p_id;
end $$;
revoke execute on function public.admin_set_feedback_status(bigint, text) from public, anon;
grant execute on function public.admin_set_feedback_status(bigint, text) to authenticated;

create or replace function public.admin_delete_feedback(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  delete from public.feedback where id = p_id;
end $$;
revoke execute on function public.admin_delete_feedback(bigint) from public, anon;
grant execute on function public.admin_delete_feedback(bigint) to authenticated;

-- ───────────── Announcements ─────────────
create table if not exists public.announcements (
  id bigserial primary key,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  audience text not null check (audience in ('all','private')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.announcement_recipients (
  announcement_id bigint not null references public.announcements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (announcement_id, user_id)
);
create index if not exists announcement_recipients_user_idx on public.announcement_recipients (user_id);
alter table public.announcements enable row level security;
alter table public.announcement_recipients enable row level security;
revoke all on public.announcements from anon, authenticated;
revoke all on public.announcement_recipients from anon, authenticated;

create or replace function public.admin_send_announcement(p_title text, p_body text, p_audience text, p_user_ids uuid[] default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare t text := btrim(coalesce(p_title, '')); b text := btrim(coalesce(p_body, '')); new_id bigint; n int;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if char_length(t) not between 1 and 120 then raise exception 'Write a title (up to 120 characters).'; end if;
  if char_length(b) not between 1 and 2000 then raise exception 'Write the message (up to 2000 characters).'; end if;
  if p_audience not in ('all','private') then raise exception 'Choose who should get it.'; end if;
  if p_audience = 'private' and coalesce(cardinality(p_user_ids), 0) = 0 then raise exception 'Choose at least one person.'; end if;
  insert into public.announcements (title, body, audience, created_by) values (t, b, p_audience, auth.uid()) returning id into new_id;
  if p_audience = 'all' then
    insert into public.notifications (user_id, kind, title, body, link)
    select p.id, 'announce', left(t, 200), left(b, 500), case when p.is_teacher then '/app/admin/announcements' else '/app/announcements' end
      from public.profiles p where not p.is_admin and not coalesce(p.suspended, false);
  else
    insert into public.announcement_recipients (announcement_id, user_id)
      select new_id, p.id from public.profiles p where p.id = any (p_user_ids) on conflict do nothing;
    get diagnostics n = row_count;
    if n = 0 then raise exception 'Choose at least one person.'; end if;
    insert into public.notifications (user_id, kind, title, body, link)
    select p.id, 'announce', left(t, 200), left(b, 500), case when p.is_teacher then '/app/admin/announcements' else '/app/announcements' end
      from public.profiles p join public.announcement_recipients r on r.user_id = p.id where r.announcement_id = new_id and not p.is_admin;
  end if;
  return new_id;
end $$;
revoke execute on function public.admin_send_announcement(text, text, text, uuid[]) from public, anon;
grant execute on function public.admin_send_announcement(text, text, text, uuid[]) to authenticated;

create or replace function public.admin_announcements() returns table (id bigint, title text, body text, audience text, recipients jsonb, created_at timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query select a.id, a.title, a.body, a.audience,
      case when a.audience = 'all' then null else (select jsonb_agg(coalesce(nullif(p.full_name, ''), p.email) order by p.full_name) from public.announcement_recipients r join public.profiles p on p.id = r.user_id where r.announcement_id = a.id) end,
      a.created_at
    from public.announcements a order by a.created_at desc limit 500;
end $$;
revoke execute on function public.admin_announcements() from public, anon;
grant execute on function public.admin_announcements() to authenticated;

create or replace function public.admin_delete_announcement(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  -- take back the bell notifications this announcement sent (matched by text and send time)
  delete from public.notifications n using public.announcements a
   where a.id = p_id and n.kind = 'announce' and n.title = left(a.title, 200) and n.body = left(a.body, 500)
     and n.created_at between a.created_at - interval '2 minutes' and a.created_at + interval '2 minutes';
  delete from public.announcements where id = p_id;
end $$;
revoke execute on function public.admin_delete_announcement(bigint) from public, anon;
grant execute on function public.admin_delete_announcement(bigint) to authenticated;

-- everyone: the public announcements plus the ones sent privately to me
create or replace function public.my_announcements() returns table (id bigint, title text, body text, audience text, created_at timestamptz)
language sql security definer stable set search_path = public as $$
  select a.id, a.title, a.body, a.audience, a.created_at
    from public.announcements a
   where auth.uid() is not null
     and (a.audience = 'all' or exists (select 1 from public.announcement_recipients r where r.announcement_id = a.id and r.user_id = auth.uid()))
   order by a.created_at desc limit 100;
$$;
revoke execute on function public.my_announcements() from public, anon;
grant execute on function public.my_announcements() to authenticated;

notify pgrst, 'reload schema';

-- ───────────── discount codes (migrate-coupons.sql) ─────────────
create table if not exists public.coupons (
  id bigserial primary key,
  code text not null check (code ~ '^[A-Z0-9_-]{3,20}$'),
  percent int not null check (percent between 1 and 90),
  plan text not null default 'all' check (plan in ('all','student','pro')),
  expires_at timestamptz,
  max_uses int check (max_uses is null or max_uses >= 1),
  used_count int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists coupons_code_uq on public.coupons (code);
alter table public.coupons enable row level security;     -- no policies: only the functions below reach it
revoke all on public.coupons from anon, authenticated;

alter table public.payments add column if not exists coupon_id bigint references public.coupons(id) on delete set null;
alter table public.payments add column if not exists discount_kobo int not null default 0;

-- the price for a plan with a code. Used for the preview on the Plans page and by paystack-init for the real charge.
drop function if exists public.coupon_quote(text, text);
create function public.coupon_quote(p_code text, p_plan text) returns table (valid boolean, message text, coupon_id bigint, code text, percent int, list_kobo int, discount_kobo int, final_kobo int)
language plpgsql security definer stable set search_path = public as $$
declare c public.coupons; lp int; disc int; fin int; cd text := upper(btrim(coalesce(p_code, '')));
begin
  select price_kobo into lp from public.plans where id = p_plan;
  if lp is null or lp <= 0 then return query select false, 'Unknown plan.', null::bigint, cd, 0, 0, 0, 0; return; end if;
  select * into c from public.coupons x where x.code = cd;
  if not found or not c.active then return query select false, 'That code is not valid.', null::bigint, cd, 0, lp, 0, lp; return; end if;
  if c.expires_at is not null and c.expires_at <= now() then return query select false, 'That code has expired.', null::bigint, cd, 0, lp, 0, lp; return; end if;
  if c.max_uses is not null and c.used_count >= c.max_uses then return query select false, 'That code has been fully used.', null::bigint, cd, 0, lp, 0, lp; return; end if;
  if c.plan <> 'all' and c.plan <> p_plan then return query select false, 'That code is for the ' || initcap(c.plan) || ' plan only.', null::bigint, cd, 0, lp, 0, lp; return; end if;
  fin := greatest(10000, (round(lp * (100 - c.percent) / 100.0 / 100.0) * 100)::int);   -- whole naira, never below N100
  disc := lp - fin;
  return query select true, c.percent || '% off applied.', c.id, c.code, c.percent, lp, disc, fin;
end $$;
revoke execute on function public.coupon_quote(text, text) from public, anon;
grant execute on function public.coupon_quote(text, text) to authenticated, service_role;

-- admin: list, create, switch on or off, delete
create or replace function public.admin_coupons() returns table (id bigint, code text, percent int, plan text, expires_at timestamptz, max_uses int, used_count int, active boolean, created_at timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query select c.id, c.code, c.percent, c.plan, c.expires_at, c.max_uses, c.used_count, c.active, c.created_at from public.coupons c order by c.created_at desc limit 500;
end $$;
revoke execute on function public.admin_coupons() from public, anon;
grant execute on function public.admin_coupons() to authenticated;

create or replace function public.admin_save_coupon(p_code text, p_percent int, p_plan text, p_expires timestamptz, p_max_uses int) returns bigint
language plpgsql security definer set search_path = public as $$
declare cd text := upper(btrim(coalesce(p_code, ''))); new_id bigint;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if cd !~ '^[A-Z0-9_-]{3,20}$' then raise exception 'The code must be 3 to 20 letters or numbers (no spaces).'; end if;
  if p_percent is null or p_percent not between 1 and 90 then raise exception 'The discount must be from 1%% to 90%%.'; end if;
  if p_plan not in ('all','student','pro') then raise exception 'Choose a plan.'; end if;
  if p_expires is not null and p_expires <= now() then raise exception 'The end date must be in the future.'; end if;
  if p_max_uses is not null and p_max_uses < 1 then raise exception 'The use limit must be at least 1.'; end if;
  if exists (select 1 from public.coupons where code = cd) then raise exception 'A code named % already exists.', cd; end if;
  insert into public.coupons (code, percent, plan, expires_at, max_uses) values (cd, p_percent, p_plan, p_expires, p_max_uses) returning id into new_id;
  perform public.admin_log('coupon.add', cd || ' ' || p_percent || '% ' || p_plan);
  return new_id;
end $$;
revoke execute on function public.admin_save_coupon(text, int, text, timestamptz, int) from public, anon;
grant execute on function public.admin_save_coupon(text, int, text, timestamptz, int) to authenticated;

create or replace function public.admin_set_coupon_active(p_id bigint, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  update public.coupons set active = p_active where id = p_id;
end $$;
revoke execute on function public.admin_set_coupon_active(bigint, boolean) from public, anon;
grant execute on function public.admin_set_coupon_active(bigint, boolean) to authenticated;

create or replace function public.admin_delete_coupon(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  delete from public.coupons where id = p_id;
end $$;
revoke execute on function public.admin_delete_coupon(bigint) from public, anon;
grant execute on function public.admin_delete_coupon(bigint) to authenticated;

notify pgrst, 'reload schema';

-- ───────────── novel (cover, PDF to read online, questions) ─────────────
create table if not exists public.novel (
  id int primary key default 1 check (id = 1),                      -- only one novel
  title text not null default 'Novel' check (char_length(title) between 1 and 120),
  cover text check (cover is null or (cover like 'data:image/%;base64,%' and char_length(cover) <= 400000)),
  file_name text check (char_length(file_name) <= 200),
  size_bytes integer check (size_bytes >= 0),
  data text check (data is null or (data like 'data:application/pdf;base64,%' and char_length(data) <= 11200000)),
  updated_at timestamptz not null default now()
);
insert into public.novel (id) values (1) on conflict do nothing;
alter table public.novel enable row level security;                  -- no policies: only reachable through the functions below
revoke all on public.novel from anon, authenticated;

create table if not exists public.novel_questions (
  id bigserial primary key,
  body text not null check (char_length(body) between 1 and 1000),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  answer int not null check (answer between 0 and 3),
  explanation text check (char_length(explanation) <= 1000),
  unique (body)
);
alter table public.novel_questions enable row level security;
revoke all on public.novel_questions from anon, authenticated;

-- the novel without the heavy PDF
create or replace function public.get_novel() returns table (title text, cover text, file_name text, size_bytes integer, has_file boolean, questions bigint, updated_at timestamptz)
language sql security definer stable set search_path = public as $$
  select n.title, n.cover, n.file_name, n.size_bytes, n.data is not null, (select count(*) from public.novel_questions), n.updated_at
    from public.novel n where n.id = 1 and auth.uid() is not null;
$$;
revoke execute on function public.get_novel() from public, anon;
grant execute on function public.get_novel() to authenticated;

-- the PDF, when someone presses Read novel
create or replace function public.get_novel_file() returns text
language sql security definer stable set search_path = public as $$
  select n.data from public.novel n where n.id = 1 and auth.uid() is not null;
$$;
revoke execute on function public.get_novel_file() from public, anon;
grant execute on function public.get_novel_file() to authenticated;

create or replace function public.get_novel_questions() returns table (id bigint, body text, options jsonb, answer int, explanation text)
language sql security definer stable set search_path = public as $$
  select q.id, q.body, q.options, q.answer, q.explanation from public.novel_questions q where auth.uid() is not null order by q.id limit 2000;
$$;
revoke execute on function public.get_novel_questions() from public, anon;
grant execute on function public.get_novel_questions() to authenticated;

-- admin: save the title, cover and PDF. A null cover or PDF means "leave it as it is".
create or replace function public.admin_save_novel(p_title text, p_cover text, p_file_name text, p_size integer, p_data text) returns void
language plpgsql security definer set search_path = public as $$
declare t text := btrim(coalesce(p_title, ''));
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if char_length(t) < 1 or char_length(t) > 120 then raise exception 'Enter the novel title (up to 120 characters).'; end if;
  if p_cover is not null and (p_cover not like 'data:image/%;base64,%' or char_length(p_cover) > 400000) then raise exception 'The cover picture is not valid or is too big.'; end if;
  if p_data is not null and p_data not like 'data:application/pdf;base64,%' then raise exception 'Please choose a PDF file.'; end if;
  if p_data is not null and char_length(p_data) > 11200000 then raise exception 'That PDF is too big. Choose one under 8 MB.'; end if;
  update public.novel set title = t,
         cover = coalesce(p_cover, cover),
         file_name = case when p_data is not null then left(p_file_name, 200) else file_name end,
         size_bytes = case when p_data is not null then p_size else size_bytes end,
         data = coalesce(p_data, data),
         updated_at = now()
   where id = 1;
  perform public.admin_log('novel.save', t || case when p_data is not null then ' (new PDF)' else '' end || case when p_cover is not null then ' (new cover)' else '' end);
end $$;
revoke execute on function public.admin_save_novel(text, text, text, integer, text) from public, anon;
grant execute on function public.admin_save_novel(text, text, text, integer, text) to authenticated;

-- admin: add questions (rows already checked in the browser; checked again here). Duplicates are skipped.
create or replace function public.admin_import_novel_questions(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; ins int := 0; dup int := 0; bad int := 0; n int; ok boolean;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 500 then
    raise exception 'send between 1 and 500 questions at a time';
  end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    ok := jsonb_typeof(r) = 'object'
      and char_length(btrim(coalesce(r->>'body', ''))) between 1 and 1000
      and jsonb_typeof(r->'options') = 'array' and jsonb_array_length(r->'options') = 4
      and (r->>'answer') ~ '^[0-3]$'
      and char_length(coalesce(r->>'explanation', '')) <= 1000;
    if ok then
      ok := not exists (select 1 from jsonb_array_elements(r->'options') o
                         where jsonb_typeof(o) <> 'string' or char_length(btrim(o #>> '{}')) not between 1 and 300);
    end if;
    if not ok then bad := bad + 1; continue; end if;
    insert into public.novel_questions (body, options, answer, explanation)
    values (btrim(r->>'body'),
            (select jsonb_agg(btrim(o.v #>> '{}') order by o.i) from jsonb_array_elements(r->'options') with ordinality as o(v, i)),
            (r->>'answer')::int, nullif(btrim(coalesce(r->>'explanation', '')), ''))
    on conflict (body) do nothing;
    get diagnostics n = row_count;
    if n = 1 then ins := ins + 1; else dup := dup + 1; end if;
  end loop;
  perform public.admin_log('novel.questions', ins || ' added, ' || dup || ' duplicates skipped, ' || bad || ' invalid');
  return jsonb_build_object('inserted', ins, 'duplicates', dup, 'invalid', bad);
end $$;
revoke execute on function public.admin_import_novel_questions(jsonb) from public, anon;
grant execute on function public.admin_import_novel_questions(jsonb) to authenticated;

-- admin: remove every novel question (to start the list again)
create or replace function public.admin_clear_novel_questions() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  delete from public.novel_questions;
  perform public.admin_log('novel.questions.clear', 'all removed');
end $$;
revoke execute on function public.admin_clear_novel_questions() from public, anon;
grant execute on function public.admin_clear_novel_questions() to authenticated;

notify pgrst, 'reload schema';
