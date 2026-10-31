-- Fixes "Database error creating new user" when a student activates an Access PIN.
-- The PIN function now registers the PIN's reserved email for a few seconds before creating the
-- account, and the guard trigger accepts that. (Run once in the Supabase SQL Editor.)
create table if not exists public.pin_reservations (
  email text primary key,
  created_at timestamptz not null default now()
);
alter table public.pin_reservations enable row level security;
revoke all on public.pin_reservations from anon, authenticated;
grant all on public.pin_reservations to service_role;

create or replace function public.guard_pin_domain() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if lower(new.email) like '%@pin.jambwise.ng'
     and coalesce(new.raw_app_meta_data->>'pin','') <> 'true'
     and not exists (select 1 from public.pin_reservations r
                      where r.email = lower(new.email) and r.created_at > now() - interval '2 minutes') then
    raise exception 'reserved email domain';
  end if;
  return new;
end $$;

notify pgrst, 'reload schema';
