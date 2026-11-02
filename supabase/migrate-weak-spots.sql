-- ───────────── Pro: "Fix my weak spots" (migrate-weak-spots.sql) ─────────────
-- Run once in the Supabase SQL Editor. Safe to run again.
-- For Pro students only: the questions they get wrong are remembered. They re-drill them until they get each one
-- right twice in a row, and then it is forgotten.
create table if not exists public.question_misses (
  user_id uuid not null references auth.users on delete cascade,
  question_id bigint not null references public.questions(id) on delete cascade,
  subject text not null,
  misses int not null default 1,
  streak int not null default 0,
  last_missed_at timestamptz not null default now(),
  primary key (user_id, question_id)
);
create index if not exists question_misses_sub_idx on public.question_misses (user_id, subject);
alter table public.question_misses enable row level security;     -- no policies: only the functions below reach it
revoke all on public.question_misses from anon, authenticated;

create or replace function public.is_pro() returns boolean
language sql security definer stable set search_path = public as
$$ select coalesce((select plan = 'pro' and (plan_expires is null or plan_expires > now()) and not suspended
                    from public.profiles where id = auth.uid()), false) $$;
revoke execute on function public.is_pro() from public, anon;
grant execute on function public.is_pro() to authenticated;

-- after a practice round or a mock: the ids answered wrong and right. Ignored (returns 0) unless the caller is Pro.
create or replace function public.record_misses(p_wrong bigint[], p_right bigint[]) returns int
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int := 0; room int;
begin
  if uid is null then raise exception 'not allowed'; end if;
  if not public.is_pro() then return 0; end if;
  p_wrong := coalesce(p_wrong, '{}'); p_right := coalesce(p_right, '{}');
  if cardinality(p_wrong) + cardinality(p_right) > 300 then raise exception 'too many'; end if;
  -- right answers: a question answered right twice in a row is fixed and forgotten
  update public.question_misses set streak = streak + 1 where user_id = uid and question_id = any(p_right);
  delete from public.question_misses where user_id = uid and streak >= 2;
  -- wrong answers: remember them (at most 500 open questions per student)
  select 500 - count(*) into room from public.question_misses where user_id = uid;
  update public.question_misses set misses = misses + 1, streak = 0, last_missed_at = now() where user_id = uid and question_id = any(p_wrong);
  get diagnostics n = row_count;
  insert into public.question_misses (user_id, question_id, subject)
    select uid, q.id, q.subject from public.questions q
     where q.id = any(p_wrong) and not exists (select 1 from public.question_misses m where m.user_id = uid and m.question_id = q.id)
     limit greatest(room, 0)
    on conflict do nothing;
  return n;
end $$;
revoke execute on function public.record_misses(bigint[], bigint[]) from public, anon;
grant execute on function public.record_misses(bigint[], bigint[]) to authenticated;

-- how many open weak questions per subject
create or replace function public.weak_spots() returns table (subject text, open_count int)
language sql security definer stable set search_path = public as $$
  select m.subject, count(*)::int from public.question_misses m
   where m.user_id = auth.uid() and public.is_pro() group by m.subject order by 2 desc;
$$;
revoke execute on function public.weak_spots() from public, anon;
grant execute on function public.weak_spots() to authenticated;

-- the questions to drill: the most-missed first
create or replace function public.weak_question_ids(p_subject text, p_limit int default 20) returns bigint[]
language sql security definer stable set search_path = public as $$
  select coalesce(array_agg(x.question_id), '{}') from (
    select m.question_id from public.question_misses m
     where m.user_id = auth.uid() and m.subject = p_subject and public.is_pro()
     order by m.misses desc, m.last_missed_at desc limit least(greatest(coalesce(p_limit, 20), 1), 40)
  ) x;
$$;
revoke execute on function public.weak_question_ids(text, int) from public, anon;
grant execute on function public.weak_question_ids(text, int) to authenticated;

notify pgrst, 'reload schema';
