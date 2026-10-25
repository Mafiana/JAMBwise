-- Run once in the Supabase SQL Editor, after migrate-parent.sql.
-- When a parent signs in, every admin now gets a notification on their bell (the student already did).
-- Safe to run again.

create or replace function public.parent_login(p_reg text, p_code text, p_name text, p_rel text, p_device text, p_ip text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare reg text := left(upper(trim(coalesce(p_reg, ''))), 30); nm text := left(trim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g')), 80);
        rel text := case when p_rel in ('Mother','Father','Guardian') then p_rel else 'Other' end;
        dev text := left(coalesce(p_device, ''), 120); sid uuid; c public.parent_codes; tok text; fails int; ipfails int; why text; adm record; msg text;
begin
  if nm = '' then return jsonb_build_object('ok', false, 'reason', 'name'); end if;
  select count(*) into fails from public.parent_log where reg_number = reg and outcome <> 'ok' and created_at > now() - interval '15 minutes';
  select count(*) into ipfails from public.parent_log where p_ip is not null and ip_hash = p_ip and outcome <> 'ok' and created_at > now() - interval '1 hour';
  select id into sid from public.profiles where reg_number = reg and not is_admin and not is_teacher;
  if fails >= 5 or ipfails >= 20 then
    insert into public.parent_log (student_id, reg_number, parent_name, relationship, outcome, device, ip_hash) values (sid, reg, nm, rel, 'locked', dev, p_ip);
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;
  if sid is null then why := 'bad_code';
  else
    select * into c from public.parent_codes where user_id = sid;
    if not found then why := 'off';
    elsif c.expires_at <= now() then why := 'expired';
    elsif c.code <> upper(trim(coalesce(p_code, ''))) then why := 'bad_code';
    end if;
  end if;
  if why is not null then
    insert into public.parent_log (student_id, reg_number, parent_name, relationship, outcome, device, ip_hash) values (sid, reg, nm, rel, why, dev, p_ip);
    return jsonb_build_object('ok', false, 'reason', 'mismatch');
  end if;
  delete from public.parent_sessions where expires_at < now();
  tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.parent_sessions (token, student_id, parent_name, expires_at) values (tok, sid, nm, now() + interval '60 minutes');
  insert into public.parent_log (student_id, reg_number, parent_name, relationship, outcome, device, ip_hash) values (sid, reg, nm, rel, 'ok', dev, p_ip);
  perform public.notify_user(sid, 'parent', 'A parent viewed your progress', nm || ' (' || rel || ') signed in with your parent code.', '/app/settings');
  -- every admin gets it on their bell too (once per parent and student every 30 minutes, so a page refresh does not pile up)
  msg := nm || ' (' || rel || ') viewed ' || coalesce((select full_name from public.profiles where id = sid), 'a student') || '''s progress (' || reg || ').';
  for adm in select id from public.profiles where is_admin loop
    if not exists (select 1 from public.notifications n where n.user_id = adm.id and n.kind = 'parent' and n.body = msg and n.created_at > now() - interval '30 minutes') then
      perform public.notify_user(adm.id, 'parent', 'A parent signed in', msg, '/app/admin/parents');
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'token', tok, 'expires_at', now() + interval '60 minutes');
end $$;
