-- JAMBwise: ExamHall controls - scheduled sitting window, warning limit and the "left the exam screen" log.
-- Run AFTER migrate-mock-lock.sql. Safe to run more than once.
-- Supabase > SQL Editor > New query > paste all of this > Run.

-- ExamHall controls: an optional sitting window (students can only start between opens_at and closes_at), the number of warnings
-- before an automatic submit, and a log of "left the exam screen" events that admins see on the Scoresheet.
create table if not exists public.exam_settings (
  kind text primary key check (kind in ('mock','hall')),
  opens_at timestamptz,
  closes_at timestamptz,
  max_violations int not null default 3 check (max_violations between 0 and 20),   -- 0 = warn only, never auto-submit
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
alter table public.exam_events drop constraint if exists exam_events_type_check;   -- allows the new "started / resumed / submitted" entries
alter table public.exam_events add constraint exam_events_type_check check (type in ('started','resumed','left_tab','left_fullscreen','limit_reached','submitted'));
alter table public.exam_settings enable row level security;
alter table public.exam_events enable row level security;   -- no policies: everything goes through the functions below

-- What a student needs to know before starting: the window, the warning limit and the SERVER's clock (so a wrong phone clock cannot open the exam).
create or replace function public.exam_window(p_kind text) returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object('opens_at', s.opens_at, 'closes_at', s.closes_at, 'max_violations', coalesce(s.max_violations, 3), 'server_now', now())
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
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query select e.user_id, e.type, e.occurred_at, e.detail from public.exam_events e
    where e.kind = p_kind and (p_user is null or e.user_id = p_user) order by e.occurred_at;
end $$;

create or replace function public.one_exam_per_student() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind in ('mock','hall') and new.mock_score is not null then
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

create or replace function public.admin_allow_retake(target uuid, p_kind text default 'mock') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_kind not in ('mock','hall') then raise exception 'unknown exam'; end if;
  delete from public.attempts where user_id = target and kind = p_kind;
  delete from public.exam_events where user_id = target and kind = p_kind;
  perform public.admin_log(p_kind || '.retake', (select reg_number from public.profiles where id = target));
end $$;

revoke execute on function public.one_exam_per_student(), public.admin_allow_retake(uuid, text), public.exam_window(text),
  public.admin_set_exam_window(text, timestamptz, timestamptz, int), public.log_exam_event(text, text, timestamptz, text), public.admin_exam_events(text, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_allow_retake(uuid, text), public.exam_window(text),
  public.admin_set_exam_window(text, timestamptz, timestamptz, int), public.log_exam_event(text, text, timestamptz, text), public.admin_exam_events(text, uuid) to authenticated;
