-- Run once in the Supabase SQL Editor. Safe to run again. No Edge Function needs deploying.
-- 1. Rate & suggest: students and teachers send a star rating, a feature idea, a bug report or feedback. Admins read them under Feedback.
-- 2. Announcements: an admin sends a message either to everyone (public) or privately to chosen people. It rings their bell,
--    shows as a banner and is kept on their Announcements page.

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
