-- PIN expiry reminders: when a student who joined with an access PIN has less than 3 days left, the bell gets a message
-- (at most one every 12 hours) telling them to contact the Admin through Customer Support, or their tutor.
-- Safe to run more than once. Run it after migrate-notify.sql.

create or replace function public.pin_expiry_reminder() returns void
language plpgsql security definer set search_path = public as $$
declare p public.profiles; secs bigint; d int; h int; left_txt text;
begin
  if auth.uid() is null then return; end if;
  select * into p from public.profiles where id = auth.uid();
  if not found or p.is_admin or p.is_teacher or p.plan = 'free' or p.plan_expires is null then return; end if;
  if lower(coalesce(p.email, '')) not like '%@pin.jambwise.ng' then return; end if;
  if p.plan_expires <= now() or p.plan_expires > now() + interval '3 days' then return; end if;
  if exists (select 1 from public.notifications where user_id = p.id and kind = 'pin' and created_at > now() - interval '12 hours') then return; end if;
  secs := floor(extract(epoch from (p.plan_expires - now())));
  d := secs / 86400; h := (secs % 86400) / 3600;
  left_txt := case when d > 0 then d || (case when d = 1 then ' day ' else ' days ' end) || h || (case when h = 1 then ' hour' else ' hours' end)
                   when h > 0 then h || (case when h = 1 then ' hour' else ' hours' end) || ' ' || ((secs % 3600) / 60) || ' min'
                   else ((secs % 3600) / 60) || ' min' end;
  perform public.notify_user(p.id, 'pin', 'Your access PIN is about to expire',
    'Your access PIN ends in ' || left_txt || '. Please contact the Admin in the Customer Support section, or contact your tutor, to get a new PIN.',
    '/app/help');
end $$;
revoke execute on function public.pin_expiry_reminder() from public, anon, authenticated;

-- Opening the bell now also checks for the reminder (so it needs plpgsql and is no longer "stable").
create or replace function public.my_notifications() returns table (id bigint, kind text, title text, body text, link text, read_at timestamptz, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  perform public.pin_expiry_reminder();
  return query
    select n.id, n.kind, n.title, n.body, n.link, n.read_at, n.created_at
      from public.notifications n where n.user_id = auth.uid() order by n.created_at desc limit 30;
end $$;
revoke execute on function public.my_notifications() from public, anon;
grant execute on function public.my_notifications() to authenticated;
notify pgrst, 'reload schema';
