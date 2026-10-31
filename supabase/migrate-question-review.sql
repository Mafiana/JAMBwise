-- Run once in the Supabase SQL Editor. Safe to run again. No Edge Function needs deploying.
-- Questions added by a teacher now wait for an admin to Accept or Decline them:
--   * a teacher's "Add question" sends it for review (the admins' bell rings, and Questions shows a Review box)
--   * Accept puts the question live (the teacher is named as its uploader) and tells the teacher
--   * Decline tells the teacher too, with the admin's reason if one was typed
-- Admins still add questions directly.

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
