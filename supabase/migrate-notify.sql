-- Notification bell, results-released alerts and the admin <-> teacher chat. Safe to run more than once.
-- Run it after migrate-roles.sql.
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

revoke execute on function public.notify_user(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.my_notifications(), public.mark_notifications_read(bigint, text), public.staff_chat_send(uuid, text),
  public.staff_chat_thread(uuid), public.staff_chat_inbox(), public.admin_set_results_released(text, boolean) from public, anon;
grant execute on function public.my_notifications(), public.mark_notifications_read(bigint, text), public.staff_chat_send(uuid, text),
  public.staff_chat_thread(uuid), public.staff_chat_inbox(), public.admin_set_results_released(text, boolean) to authenticated;
revoke all on public.notifications, public.staff_chat from anon, authenticated;
grant select on public.notifications, public.staff_chat to authenticated;
