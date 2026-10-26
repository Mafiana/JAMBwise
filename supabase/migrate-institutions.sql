-- Run once in the Supabase SQL Editor, AFTER migrate-teacher-scope.sql. Safe to run again.
-- Institutions (schools): a list people choose from on the home page, a login page for each, students and teachers /
-- proprietors / officials assigned to one, and a panel that shows an institution's staff only THEIR students' results.
--
--   * Admins add, rename and delete institutions, and assign any student or staff member to one (Admin > Institutions).
--   * A teacher, proprietor, proprietress or official (all use the teacher panel) who is assigned to an institution sees only
--     that institution's students, scores, exam logs and support tickets. Staff with NO institution keep seeing everyone.
--   * Admins always see everything.

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

-- ───────────── first assignments ─────────────
-- teacher mpatience@gmail.com and the student Samuel Admin go to JAMBwise. (If either account does not exist yet, nothing happens:
-- create it, then assign it from Admin > Institutions, or run this block again.)
do $$
declare j uuid; t int; s int;
begin
  select id into j from public.institutions where slug = 'jambwise';
  update public.profiles set institution_id = j, inst_title = case when is_teacher then 'Teacher' else null end where lower(email) = 'mpatience@gmail.com';
  get diagnostics t = row_count;
  update public.profiles set institution_id = j where full_name ilike '%samuel%admin%' and not is_teacher;
  get diagnostics s = row_count;
  raise notice 'Assigned to JAMBwise: % teacher account(s) for mpatience@gmail.com, % account(s) named Samuel Admin.', t, s;
end $$;
