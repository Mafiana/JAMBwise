-- Run once in the Supabase SQL Editor. Safe to run again.
-- THEN deploy the payment function:   supabase functions deploy paystack-init
-- Discount codes: the admin creates a code (a percentage off, for one plan or all, with an optional end date and use limit).
-- A student types it on the Plans page, sees the new price, and Paystack charges the discounted amount.
-- The price is always worked out here in the database, never in the browser.

create table if not exists public.coupons (
  id bigserial primary key,
  code text not null check (code ~ '^[A-Z0-9_-]{3,20}$'),
  percent int not null check (percent between 1 and 90),
  plan text not null default 'all' check (plan in ('all','student','pro')),
  expires_at timestamptz,
  max_uses int check (max_uses is null or max_uses >= 1),
  used_count int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists coupons_code_uq on public.coupons (code);
alter table public.coupons enable row level security;     -- no policies: only the functions below reach it
revoke all on public.coupons from anon, authenticated;

alter table public.payments add column if not exists coupon_id bigint references public.coupons(id) on delete set null;
alter table public.payments add column if not exists discount_kobo int not null default 0;

-- the price for a plan with a code. Used for the preview on the Plans page and by paystack-init for the real charge.
drop function if exists public.coupon_quote(text, text);
create function public.coupon_quote(p_code text, p_plan text) returns table (valid boolean, message text, coupon_id bigint, code text, percent int, list_kobo int, discount_kobo int, final_kobo int)
language plpgsql security definer stable set search_path = public as $$
declare c public.coupons; lp int; disc int; fin int; cd text := upper(btrim(coalesce(p_code, '')));
begin
  select price_kobo into lp from public.plans where id = p_plan;
  if lp is null or lp <= 0 then return query select false, 'Unknown plan.', null::bigint, cd, 0, 0, 0, 0; return; end if;
  select * into c from public.coupons x where x.code = cd;
  if not found or not c.active then return query select false, 'That code is not valid.', null::bigint, cd, 0, lp, 0, lp; return; end if;
  if c.expires_at is not null and c.expires_at <= now() then return query select false, 'That code has expired.', null::bigint, cd, 0, lp, 0, lp; return; end if;
  if c.max_uses is not null and c.used_count >= c.max_uses then return query select false, 'That code has been fully used.', null::bigint, cd, 0, lp, 0, lp; return; end if;
  if c.plan <> 'all' and c.plan <> p_plan then return query select false, 'That code is for the ' || initcap(c.plan) || ' plan only.', null::bigint, cd, 0, lp, 0, lp; return; end if;
  fin := greatest(10000, (round(lp * (100 - c.percent) / 100.0 / 100.0) * 100)::int);   -- whole naira, never below N100
  disc := lp - fin;
  return query select true, c.percent || '% off applied.', c.id, c.code, c.percent, lp, disc, fin;
end $$;
revoke execute on function public.coupon_quote(text, text) from public, anon;
grant execute on function public.coupon_quote(text, text) to authenticated, service_role;

-- a paid payment counts as one use of its code
create or replace function public.fulfil_payment(p_ref text, p_amount int) returns boolean
language plpgsql security definer set search_path = public as $$
declare pay public.payments; base timestamptz;
begin
  select * into pay from public.payments where reference = p_ref and status = 'pending' for update;
  if not found or pay.amount_kobo <> p_amount or pay.user_id is null then return false; end if;
  update public.payments set status = 'paid', paid_at = now() where reference = p_ref;
  if pay.coupon_id is not null then update public.coupons set used_count = used_count + 1 where id = pay.coupon_id; end if;
  select greatest(coalesce(plan_expires, now()), now()) into base from public.profiles where id = pay.user_id;
  update public.profiles set plan = pay.plan, plan_expires = base + interval '30 days' where id = pay.user_id;
  return true;
end $$;

-- admin: list, create, switch on or off, delete
create or replace function public.admin_coupons() returns table (id bigint, code text, percent int, plan text, expires_at timestamptz, max_uses int, used_count int, active boolean, created_at timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query select c.id, c.code, c.percent, c.plan, c.expires_at, c.max_uses, c.used_count, c.active, c.created_at from public.coupons c order by c.created_at desc limit 500;
end $$;
revoke execute on function public.admin_coupons() from public, anon;
grant execute on function public.admin_coupons() to authenticated;

create or replace function public.admin_save_coupon(p_code text, p_percent int, p_plan text, p_expires timestamptz, p_max_uses int) returns bigint
language plpgsql security definer set search_path = public as $$
declare cd text := upper(btrim(coalesce(p_code, ''))); new_id bigint;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if cd !~ '^[A-Z0-9_-]{3,20}$' then raise exception 'The code must be 3 to 20 letters or numbers (no spaces).'; end if;
  if p_percent is null or p_percent not between 1 and 90 then raise exception 'The discount must be from 1%% to 90%%.'; end if;
  if p_plan not in ('all','student','pro') then raise exception 'Choose a plan.'; end if;
  if p_expires is not null and p_expires <= now() then raise exception 'The end date must be in the future.'; end if;
  if p_max_uses is not null and p_max_uses < 1 then raise exception 'The use limit must be at least 1.'; end if;
  if exists (select 1 from public.coupons where code = cd) then raise exception 'A code named % already exists.', cd; end if;
  insert into public.coupons (code, percent, plan, expires_at, max_uses) values (cd, p_percent, p_plan, p_expires, p_max_uses) returning id into new_id;
  perform public.admin_log('coupon.add', cd || ' ' || p_percent || '% ' || p_plan);
  return new_id;
end $$;
revoke execute on function public.admin_save_coupon(text, int, text, timestamptz, int) from public, anon;
grant execute on function public.admin_save_coupon(text, int, text, timestamptz, int) to authenticated;

create or replace function public.admin_set_coupon_active(p_id bigint, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  update public.coupons set active = p_active where id = p_id;
end $$;
revoke execute on function public.admin_set_coupon_active(bigint, boolean) from public, anon;
grant execute on function public.admin_set_coupon_active(bigint, boolean) to authenticated;

create or replace function public.admin_delete_coupon(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  delete from public.coupons where id = p_id;
end $$;
revoke execute on function public.admin_delete_coupon(bigint) from public, anon;
grant execute on function public.admin_delete_coupon(bigint) to authenticated;

notify pgrst, 'reload schema';
