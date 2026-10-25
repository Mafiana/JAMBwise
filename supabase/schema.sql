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
    check (cardinality(subjects) <= 3 and subjects <@ array['mat','phy','chm','bio','gov','eco','com','agr','acc','mkt','lit','irk','crk']),
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
  subject text not null check (subject in ('eng','mat','phy','chm','bio','gov','eco','com','agr','acc','mkt','lit','irk','crk')),
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
  subject text not null check (subject in ('eng','mat','phy','chm','bio','gov','eco','com','agr','acc','mkt','lit','irk','crk')),
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
create function public.guard_pin_domain() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if lower(new.email) like '%@pin.jambwise.ng' and coalesce(new.raw_app_meta_data->>'pin','') <> 'true' then
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

create or replace function public.my_notifications() returns table (id bigint, kind text, title text, body text, link text, read_at timestamptz, created_at timestamptz)
language sql security definer stable set search_path = public as $$
  select n.id, n.kind, n.title, n.body, n.link, n.read_at, n.created_at
    from public.notifications n where n.user_id = auth.uid() order by n.created_at desc limit 30
$$;

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
create policy q_admin_ins on public.questions for insert to authenticated with check (public.is_staff());
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
