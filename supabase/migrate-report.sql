-- Run once in the Supabase SQL Editor, after migrate-institutions.sql. Safe to run again.
-- "Report this question" now goes to whoever uploaded the question: the teacher or admin who added it. Questions with no recorded
-- uploader (the built-in set) go to the admins. The uploader gets a bell notification and sees the ticket under Support tickets.

alter table public.questions add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.questions alter column created_by set default auth.uid();
alter table public.messages add column if not exists question_id bigint references public.questions(id) on delete set null;
alter table public.messages add column if not exists assigned_to uuid references public.profiles(id) on delete set null;
create index if not exists messages_assigned_idx on public.messages (assigned_to);

-- make sure a "question" ticket is an allowed topic (older databases may not have it)
alter table public.messages drop constraint if exists messages_topic_check;
alter table public.messages add constraint messages_topic_check check (topic in ('general','payment','pin','bug','question','suspended','other'));

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
