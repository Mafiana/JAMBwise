-- Lets an admin delete ANY PIN that is no longer in use: unused, deactivated or expired.
-- (The old rule only allowed deleting PINs that were never used.)
-- A PIN that is still active must be deactivated first. Run once in the Supabase SQL Editor.
create or replace function public.admin_delete_pin(p_pin text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.access_pins; p public.profiles;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  select * into r from public.access_pins where pin = p_pin for update;
  if not found then raise exception 'That PIN does not exist.'; end if;
  -- used and not deactivated: only allowed once the student's access has ended (or the account is gone)
  if (r.used_by is not null or r.used_at is not null) and r.deactivated_at is null and r.used_by is not null then
    select * into p from public.profiles where id = r.used_by;
    if found and (p.plan_expires is null or p.plan_expires > now()) then
      raise exception 'This PIN is still active. Deactivate it first, then delete it.';
    end if;
  end if;
  delete from public.access_pins where pin = p_pin;
  perform public.admin_log('pin.delete', p_pin);
end $$;
revoke execute on function public.admin_delete_pin(text) from public, anon;
grant execute on function public.admin_delete_pin(text) to authenticated;

notify pgrst, 'reload schema';
