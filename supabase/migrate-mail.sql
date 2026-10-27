-- Run once in the Supabase SQL Editor, after migrate-report.sql. Safe to run again.
-- Admin > Mail: everything sent to support@jambwise.ng reaches the admins inside JAMBwise. That is the Contact page and
-- Landing page contact form (people who are not signed in) and the message box on the suspended-account screen.
-- Signed-in students' tickets stay under Support tickets.

alter table public.messages drop constraint if exists messages_topic_check;
alter table public.messages add constraint messages_topic_check check (topic in ('general','payment','pin','bug','question','suspended','other'));

-- every admin's bell rings when new mail arrives
create or replace function public.notify_mail() returns trigger language plpgsql security definer set search_path = public as $$
declare adm record; txt text;
begin
  if new.user_id is not null and new.topic <> 'suspended' then return new; end if;   -- ordinary student tickets are not mail
  txt := coalesce(nullif(new.name, ''), 'Someone') || ': ' || left(coalesce(nullif(new.subject, ''), new.body), 160);
  begin   -- a problem with the bell must never lose the message itself
    for adm in select id from public.profiles where is_admin loop
      perform public.notify_user(adm.id, 'mail', case when new.topic = 'suspended' then 'Message from a suspended account' else 'New mail' end, txt, '/app/admin/mail');
    end loop;
  exception when others then
    raise warning 'notify_mail skipped: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists notify_mail on public.messages;
create trigger notify_mail after insert on public.messages for each row execute function public.notify_mail();
