-- ───────────── XP and CBT Mock retakes (migrate-xp.sql) ─────────────
-- Run once in the Supabase SQL Editor. Safe to run again.
-- * A student earns XP for every practice question answered correctly (1 XP each, at most 100 XP a day).
-- * A student can write the CBT Mock 2 times for free. From the 3rd time each sitting costs 2000 XP.
-- * ExamHall is unchanged (once only). An admin can still reset a student's mock with "allow retake".
-- * "Reset progress" in Settings now clears practice history safely (XP and exam results are kept).
-- All numbers are in xp_cfg() below; change them there and run this file again.

create table if not exists public.xp_ledger (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  delta int not null,
  reason text not null check (reason in ('practice','mock_retake')),
  created_at timestamptz not null default now()
);
create index if not exists xp_ledger_user_idx on public.xp_ledger (user_id, created_at desc);
alter table public.xp_ledger enable row level security;      -- no policies: only the functions below reach it
revoke all on public.xp_ledger from anon, authenticated;
grant all on public.xp_ledger to service_role;

-- a paid-for retake waiting to be used (one is used up by the next CBT Mock that is submitted)
create table if not exists public.mock_retakes (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  bought_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists mock_retakes_user_idx on public.mock_retakes (user_id);
alter table public.mock_retakes enable row level security;
revoke all on public.mock_retakes from anon, authenticated;
grant all on public.mock_retakes to service_role;

create or replace function public.xp_cfg() returns jsonb language sql immutable as
$$ select jsonb_build_object('free', 2, 'cost', 2000, 'daily_cap', 100) $$;

-- practice: XP for the correct answers, capped per Lagos day (the database decides, never the browser)
create or replace function public.award_practice_xp() returns trigger
language plpgsql security definer set search_path = public as $$
declare cap int := (public.xp_cfg()->>'daily_cap')::int; got int; give int;
begin
  if new.kind <> 'practice' then return new; end if;
  perform pg_advisory_xact_lock(hashtext('xp:' || new.user_id::text));
  select coalesce(sum(delta), 0) into got from public.xp_ledger
   where user_id = new.user_id and reason = 'practice'
     and (created_at at time zone 'Africa/Lagos')::date = (now() at time zone 'Africa/Lagos')::date;
  give := least(new.correct, cap - got);
  if give > 0 then insert into public.xp_ledger (user_id, delta, reason) values (new.user_id, give, 'practice'); end if;
  return new;
end $$;
drop trigger if exists attempts_xp on public.attempts;
create trigger attempts_xp after insert on public.attempts for each row execute function public.award_practice_xp();

-- XP for practice done before this update (same daily cap), once
insert into public.xp_ledger (user_id, delta, reason, created_at)
select a.user_id, least(sum(a.correct), (public.xp_cfg()->>'daily_cap')::int), 'practice', max(a.created_at)
  from public.attempts a
 where a.kind = 'practice' and not exists (select 1 from public.xp_ledger)
 group by a.user_id, (a.created_at at time zone 'Africa/Lagos')::date
having sum(a.correct) > 0;

-- CBT Mock: 2 free sittings, then one paid retake per sitting. ExamHall: once.
create or replace function public.one_exam_per_student() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; tok bigint;
begin
  if new.kind in ('mock','hall') and new.mock_score is not null then
    if exists (select 1 from public.exam_settings where kind = new.kind and opens_at is not null and now() < opens_at) then
      raise exception 'exam_not_open: This exam has not opened yet.';
    end if;
    perform pg_advisory_xact_lock(hashtext(new.kind || ':' || new.user_id::text));
    -- the profile must be 100% complete: photo, course, target university and 3 subjects
    if not exists (select 1 from public.profiles pr where pr.id = new.user_id
                   and coalesce(pr.avatar, '') <> '' and btrim(coalesce(pr.course, '')) <> '' and btrim(coalesce(pr.school, '')) <> ''
                   and btrim(coalesce(pr.full_name, '')) <> '' and cardinality(coalesce(pr.subjects, '{}')) >= 3) then
      raise exception 'profile_incomplete: Complete your profile to 100%% before you write this exam.';
    end if;
    if new.kind = 'hall' then
      if exists (select 1 from public.attempts where user_id = new.user_id and kind = 'hall' and mock_score is not null) then
        raise exception 'mock_already_taken: You have already submitted this exam.';
      end if;
    else
      select count(*) into n from public.attempts where user_id = new.user_id and kind = 'mock' and mock_score is not null;
      if n >= (public.xp_cfg()->>'free')::int then
        select id into tok from public.mock_retakes where user_id = new.user_id and used_at is null order by id limit 1 for update;
        if tok is null then
          raise exception 'mock_limit: You have already used your free CBT mocks. Spend XP on the CBT Mock page to write again.';
        end if;
        update public.mock_retakes set used_at = now() where id = tok;
      end if;
    end if;
  end if;
  return new;
end $$;

-- the student's XP page: balance, today, the price, and how many mocks are left
create or replace function public.my_xp() returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare uid uuid := auth.uid(); cfg jsonb := public.xp_cfg(); bal int; earned int; today int; sit int; tok int; recent jsonb;
begin
  if uid is null then raise exception 'not allowed'; end if;
  select coalesce(sum(delta), 0), coalesce(sum(delta) filter (where delta > 0), 0) into bal, earned from public.xp_ledger where user_id = uid;
  select coalesce(sum(delta), 0) into today from public.xp_ledger
   where user_id = uid and reason = 'practice' and (created_at at time zone 'Africa/Lagos')::date = (now() at time zone 'Africa/Lagos')::date;
  select count(*) into sit from public.attempts where user_id = uid and kind = 'mock' and mock_score is not null;
  select count(*) into tok from public.mock_retakes where user_id = uid and used_at is null;
  select coalesce(jsonb_agg(r), '[]') into recent from (
    select delta, reason, created_at from public.xp_ledger where user_id = uid order by created_at desc, id desc limit 12) r;
  return jsonb_build_object('balance', bal, 'earned', earned, 'today', today, 'daily_cap', (cfg->>'daily_cap')::int,
    'cost', (cfg->>'cost')::int, 'free', (cfg->>'free')::int, 'sittings', sit, 'paid_retakes', tok, 'recent', recent);
end $$;
revoke execute on function public.my_xp() from public, anon;
grant execute on function public.my_xp() to authenticated;

-- spend XP on one more CBT Mock sitting
create or replace function public.buy_mock_retake() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); cfg jsonb := public.xp_cfg(); bal int; sit int; tok int;
begin
  if uid is null then raise exception 'not allowed'; end if;
  if not public.is_paid() then raise exception 'not allowed'; end if;
  perform pg_advisory_xact_lock(hashtext('xp:' || uid::text));
  select count(*) into sit from public.attempts where user_id = uid and kind = 'mock' and mock_score is not null;
  if sit < (cfg->>'free')::int then raise exception 'not_needed: You still have a free CBT mock.'; end if;
  select count(*) into tok from public.mock_retakes where user_id = uid and used_at is null;
  if tok > 0 then raise exception 'not_needed: You have already paid for your next CBT mock.'; end if;
  select coalesce(sum(delta), 0) into bal from public.xp_ledger where user_id = uid;
  if bal < (cfg->>'cost')::int then
    raise exception 'not_enough_xp: You need % XP to write the CBT mock again and you have % XP.', cfg->>'cost', bal;
  end if;
  insert into public.xp_ledger (user_id, delta, reason) values (uid, -((cfg->>'cost')::int), 'mock_retake');
  insert into public.mock_retakes (user_id) values (uid);
  return public.my_xp();
end $$;
revoke execute on function public.buy_mock_retake() from public, anon;
grant execute on function public.buy_mock_retake() to authenticated;

-- Settings → Reset progress: clears practice history and weak spots. XP and submitted exams stay.
create or replace function public.reset_my_progress() returns int
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'not allowed'; end if;
  delete from public.attempts where user_id = uid and kind = 'practice';
  get diagnostics n = row_count;
  if to_regclass('public.question_misses') is not null then delete from public.question_misses where user_id = uid; end if;
  return n;
end $$;
revoke execute on function public.reset_my_progress() from public, anon;
grant execute on function public.reset_my_progress() to authenticated;

notify pgrst, 'reload schema';
