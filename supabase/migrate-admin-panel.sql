-- JAMBwise: admin panel, support tickets, question reports, spam protection and bulk import update for a database you ALREADY created with an older schema.sql.
-- Safe to run more than once. Supabase > SQL Editor > New query > paste all of this > Run.
-- (Starting a brand-new project? Skip this and run schema.sql instead.)

-- contact-form messages (anyone can send, only admins can read)
create table if not exists public.messages (
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

-- the conversation on a ticket: replies from the student and from admins
create table if not exists public.message_replies (
  id bigserial primary key,
  message_id bigint not null references public.messages on delete cascade,
  author uuid references auth.users on delete set null,
  is_staff boolean not null default false,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists message_replies_msg_idx on public.message_replies (message_id, created_at);

-- everything an admin does is written here by the server-side functions
create table if not exists public.audit_log (
  id bigserial primary key,
  actor uuid references auth.users on delete set null,
  actor_email text,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

-- bring an older messages table up to date (safe if already current)
alter table public.messages add column if not exists subject text check (char_length(subject) <= 120);
alter table public.messages drop constraint if exists messages_status_check;
alter table public.messages add constraint messages_status_check check (status in ('new','read','answered','resolved'));
alter table public.messages drop constraint if exists messages_topic_check;
alter table public.messages add constraint messages_topic_check check (topic in ('general','payment','pin','bug','question','other'));
alter table public.messages add column if not exists abuse_key text;
create index if not exists messages_user_idx on public.messages (user_id, created_at desc);
create index if not exists messages_abuse_idx on public.messages (abuse_key, created_at desc);


alter table public.messages enable row level security;
alter table public.audit_log enable row level security;
alter table public.message_replies enable row level security;

create or replace function public.admin_log(p_action text, p_detail text) returns void
language sql security definer set search_path = public as
$$ insert into public.audit_log (actor, actor_email, action, detail)
   values (auth.uid(), (select email from public.profiles where id = auth.uid()), p_action, left(p_detail, 500)) $$;

create or replace function public.new_pin_code() returns text
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

create or replace function public.admin_make_pin(p_plan text, p_name text, p_days int default 365) returns text
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
create or replace function public.admin_make_pins(p_plan text, p_days int, p_count int) returns text[]
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

create or replace function public.admin_set_student(target uuid, p_name text, p_course text, p_school text, p_suspended boolean) returns void
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

create or replace function public.admin_set_plan(target uuid, p_plan text, p_days int default 30) returns void
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
create or replace function public.admin_set_role(target uuid, p_admin boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if target = auth.uid() then raise exception 'you cannot change your own role'; end if;
  update public.profiles set is_admin = coalesce(p_admin, false) where id = target;
  perform public.admin_log(case when p_admin then 'admin.grant' else 'admin.revoke' end,
                           (select reg_number from public.profiles where id = target));
end $$;

create or replace function public.admin_reset_progress(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  delete from public.attempts where user_id = target;
  perform public.admin_log('student.reset', (select reg_number from public.profiles where id = target));
end $$;

drop function if exists public.admin_students();
create function public.admin_students() returns table (
  id uuid, reg_number text, email text, full_name text, course text, school text, plan text,
  plan_expires timestamptz, suspended boolean, created_at timestamptz, questions bigint, correct bigint, mocks bigint,
  is_admin boolean, last_active timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query
    select p.id, p.reg_number, p.email, p.full_name, p.course, p.school, p.plan, p.plan_expires, p.suspended, p.created_at,
           coalesce(sum(a.total), 0)::bigint, coalesce(sum(a.correct), 0)::bigint,
           count(a.id) filter (where a.mock_score is not null)::bigint,
           p.is_admin, max(a.created_at)
      from public.profiles p left join public.attempts a on a.user_id = p.id
     group by p.id order by p.created_at desc limit 2000;
end $$;

create or replace function public.admin_stats() returns table (students bigint, paying bigint, revenue_kobo bigint, mocks bigint)
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
create or replace function public.ticket_reply(p_id bigint, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare m public.messages; staff boolean := public.is_admin();
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
  if not found or (not public.is_admin() and m.user_id is distinct from auth.uid()) then raise exception 'not allowed'; end if;
  update public.messages set status = 'resolved' where id = p_id;
  if public.is_admin() then perform public.admin_log('ticket.resolve', '#' || p_id); end if;
end $$;

-- Spam protection for tickets and contact messages. Runs before every insert, whoever sends it.
--   students: 5 tickets an hour (10 question reports an hour), 25 a day
--   guests (sent through the contact-submit Edge Function): 3 an hour per email, 10 an hour per network address,
--           and 120 an hour across the whole site, so a flood cannot bury real tickets
--   nobody may send the same text twice in a day. Admins are never limited.
create or replace function public.limit_ticket_rate() returns trigger language plpgsql security definer set search_path = public as $$
declare ip text; n int; lim int;
begin
  if public.is_admin() then return new; end if;
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
drop trigger if exists limit_ticket_rate on public.messages;
create trigger limit_ticket_rate before insert on public.messages
  for each row execute function public.limit_ticket_rate();

-- Bulk question import (the admin Questions tab sends up to 500 rows at a time). Rows that are invalid are skipped,
-- questions that already exist in that subject are skipped, and the whole import is one line in the activity log.
create or replace function public.admin_import_questions(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; ins int := 0; dup int := 0; bad int := 0; n int; ok boolean;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 500 then
    raise exception 'send between 1 and 500 questions at a time';
  end if;
  perform set_config('jw.bulk', '1', true);   -- tells the audit trigger not to log every single row
  for r in select value from jsonb_array_elements(p_rows) loop
    ok := jsonb_typeof(r) = 'object'
      and (r->>'subject') in ('eng','mat','phy','chm','bio','gov','eco','com','agr')
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
create or replace function public.log_content_change() returns trigger language plpgsql security definer set search_path = public as $$
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
drop trigger if exists log_plans on public.plans;
create trigger log_plans after update on public.plans for each row execute function public.log_content_change();
drop trigger if exists log_questions on public.questions;
create trigger log_questions after insert or update or delete on public.questions for each row execute function public.log_content_change();


-- Lock the privileged functions down: only the roles that should call them can.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin(), public.is_paid(), public.has_access(text) to anon, authenticated;
grant execute on function public.admin_make_pin(text, text, int), public.admin_make_pins(text, int, int),
  public.admin_set_student(uuid, text, text, text, boolean), public.admin_set_plan(uuid, text, int),
  public.admin_set_role(uuid, boolean), public.admin_reset_progress(uuid),
  public.admin_students(), public.admin_stats(), public.admin_import_questions(jsonb),
  public.ticket_reply(bigint, text), public.ticket_close(bigint) to authenticated;
-- admin_log and new_pin_code stay internal (revoked above): only the admin_* functions call them.
grant execute on function public.redeem_pin(text, uuid), public.fulfil_payment(text, int) to service_role;


drop policy if exists q_read on public.questions;
drop policy if exists q_admin_ins on public.questions;
drop policy if exists q_admin_upd on public.questions;
drop policy if exists q_admin_del on public.questions;
drop policy if exists plans_admin_upd on public.plans;
drop policy if exists msg_send on public.messages;
drop policy if exists msg_read on public.messages;
drop policy if exists reply_read on public.message_replies;
drop policy if exists msg_upd on public.messages;
drop policy if exists msg_del on public.messages;
drop policy if exists audit_read on public.audit_log;

create policy q_read on public.questions for select to authenticated using (public.has_access(subject) or public.is_admin());
create policy q_admin_ins on public.questions for insert to authenticated with check (public.is_admin());
create policy q_admin_upd on public.questions for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy q_admin_del on public.questions for delete to authenticated using (public.is_admin());

create policy plans_admin_upd on public.plans for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- tickets: only admins triage / delete; a student reads their own
-- Guests (not signed in) cannot write to this table at all: their messages go through the contact-submit Edge Function,
-- which checks a CAPTCHA first. Signed-in students may only open tickets as themselves, and the rate limit above applies.
create policy msg_send on public.messages for insert to authenticated
  with check (status = 'new' and user_id = auth.uid());
create policy msg_read on public.messages for select to authenticated using (public.is_admin() or user_id = auth.uid());
create policy reply_read on public.message_replies for select to authenticated using (
  public.is_admin() or exists (select 1 from public.messages m where m.id = message_id and m.user_id = auth.uid()));
create policy msg_upd on public.messages for update to authenticated using (public.is_admin()) with check (public.is_admin());
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
