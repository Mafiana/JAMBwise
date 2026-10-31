-- Run once in the Supabase SQL Editor (safe to run again).
-- Admins now get a bell notification when a signed-in student sends a support ticket.
-- every admin's bell rings when new mail arrives, and when a signed-in student opens a support ticket (migrate-ticket-notify.sql)
alter table public.messages add column if not exists via_contact boolean not null default false;   -- true when a signed-in person used the Contact page (shows in Mail; they still see replies on their Help page)
grant insert (via_contact) on public.messages to authenticated;
create or replace function public.notify_mail() returns trigger language plpgsql security definer set search_path = public as $$
declare adm record; txt text; is_ticket boolean;
begin
  if new.question_id is not null then return new; end if;   -- a reported question notifies its own owner in report_question()
  is_ticket := new.user_id is not null and new.topic <> 'suspended' and not new.via_contact;   -- via_contact: sent from the Contact page, so it is mail even when the sender is signed in
  txt := coalesce(nullif(new.name, ''), 'Someone') || ': ' || left(coalesce(nullif(new.subject, ''), new.body), 160);
  begin   -- a problem with the bell must never lose the message itself
    for adm in select id from public.profiles where is_admin loop
      if is_ticket then
        perform public.notify_user(adm.id, 'ticket', 'New support ticket', txt, '/app/admin/messages');
      else
        perform public.notify_user(adm.id, 'mail', case when new.topic = 'suspended' then 'Message from a suspended account' else 'New mail' end, txt, '/app/admin/mail');
      end if;
    end loop;
  exception when others then
    raise warning 'notify_mail skipped: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists notify_mail on public.messages;
create trigger notify_mail after insert on public.messages for each row execute function public.notify_mail();
