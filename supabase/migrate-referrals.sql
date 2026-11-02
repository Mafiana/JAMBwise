-- ───────────── invite a friend, earn 15% off (migrate-referrals.sql) ─────────────
-- Run once in the Supabase SQL Editor. Needs migrate-coupons.sql to have been run first. Safe to run again.
-- A student shares a personal link. When the friend makes their FIRST payment, the student who invited them
-- gets a one-time 15% code for their next payment. (To also reward the friend later, change the claim/reward code below.)

alter table public.profiles add column if not exists referral_code text;
alter table public.profiles add column if not exists referred_by uuid references auth.users on delete set null;
alter table public.profiles add column if not exists referral_paid_at timestamptz;
create unique index if not exists profiles_referral_code_uq on public.profiles (referral_code) where referral_code is not null;
-- these columns are not in the "grant update (...)" list, so a student can never edit them directly.

alter table public.coupons add column if not exists owner_id uuid references auth.users on delete cascade;
alter table public.coupons add column if not exists source text;

-- price with a code. A personal code (owner_id set) only works for its owner.
-- p_user is only used when there is no logged-in caller (the paystack-init function, which runs as the service role).
drop function if exists public.coupon_quote(text, text);
drop function if exists public.coupon_quote(text, text, uuid);
create function public.coupon_quote(p_code text, p_plan text, p_user uuid default null) returns table (valid boolean, message text, coupon_id bigint, code text, percent int, list_kobo int, discount_kobo int, final_kobo int)
language plpgsql security definer stable set search_path = public as $$
declare c public.coupons; lp int; disc int; fin int; cd text := upper(btrim(coalesce(p_code, ''))); who uuid := coalesce(auth.uid(), p_user);
begin
  select price_kobo into lp from public.plans where id = p_plan;
  if lp is null or lp <= 0 then return query select false, 'Unknown plan.', null::bigint, cd, 0, 0, 0, 0; return; end if;
  select * into c from public.coupons x where x.code = cd;
  if not found or not c.active or (c.owner_id is not null and c.owner_id is distinct from who) then return query select false, 'That code is not valid.', null::bigint, cd, 0, lp, 0, lp; return; end if;
  if c.expires_at is not null and c.expires_at <= now() then return query select false, 'That code has expired.', null::bigint, cd, 0, lp, 0, lp; return; end if;
  if c.max_uses is not null and c.used_count >= c.max_uses then return query select false, 'That code has been fully used.', null::bigint, cd, 0, lp, 0, lp; return; end if;
  if c.plan <> 'all' and c.plan <> p_plan then return query select false, 'That code is for the ' || initcap(c.plan) || ' plan only.', null::bigint, cd, 0, lp, 0, lp; return; end if;
  fin := greatest(10000, (round(lp * (100 - c.percent) / 100.0 / 100.0) * 100)::int);
  disc := lp - fin;
  return query select true, c.percent || '% off applied.', c.id, c.code, c.percent, lp, disc, fin;
end $$;
revoke execute on function public.coupon_quote(text, text, uuid) from public, anon;
grant execute on function public.coupon_quote(text, text, uuid) to authenticated, service_role;

-- the admin's list shows only the admin's own codes, not students' personal reward codes
create or replace function public.admin_coupons() returns table (id bigint, code text, percent int, plan text, expires_at timestamptz, max_uses int, used_count int, active boolean, created_at timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query select c.id, c.code, c.percent, c.plan, c.expires_at, c.max_uses, c.used_count, c.active, c.created_at from public.coupons c where c.owner_id is null order by c.created_at desc limit 500;
end $$;
revoke execute on function public.admin_coupons() from public, anon;
grant execute on function public.admin_coupons() to authenticated;

-- a student's own link code, made the first time it is needed
create or replace function public.my_referral() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); rc text; al text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; s text; i int; n_in int; n_paid int; cs jsonb;
begin
  if uid is null then raise exception 'not allowed'; end if;
  select referral_code into rc from public.profiles where id = uid;
  if rc is null then
    loop
      s := '';
      for i in 1..7 loop s := s || substr(al, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1); end loop;
      exit when not exists (select 1 from public.profiles where referral_code = s);
    end loop;
    update public.profiles set referral_code = s where id = uid and referral_code is null;
    select referral_code into rc from public.profiles where id = uid;
  end if;
  select count(*), count(referral_paid_at) into n_in, n_paid from public.profiles where referred_by = uid;
  select coalesce(jsonb_agg(jsonb_build_object('code', c.code, 'percent', c.percent, 'expires_at', c.expires_at, 'used', c.used_count >= 1, 'expired', c.expires_at <= now()) order by c.created_at desc), '[]'::jsonb)
    into cs from public.coupons c where c.owner_id = uid and c.source = 'referral';
  return jsonb_build_object('code', rc, 'signed_up', n_in, 'paid', n_paid, 'coupons', cs);
end $$;
revoke execute on function public.my_referral() from public, anon;
grant execute on function public.my_referral() to authenticated;

-- called once after a new person logs in with a link code. Returns 'ok' or a short reason; it never raises for a bad code.
create or replace function public.claim_referral(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); me public.profiles; inv uuid;
begin
  if uid is null then raise exception 'not allowed'; end if;
  select * into me from public.profiles where id = uid;
  if not found or me.referred_by is not null then return 'already'; end if;
  if me.is_admin or me.is_teacher then return 'staff'; end if;
  if me.created_at < now() - interval '7 days' then return 'too_late'; end if;
  if exists (select 1 from public.payments where user_id = uid and status = 'paid') then return 'too_late'; end if;
  select id into inv from public.profiles where referral_code = upper(btrim(coalesce(p_code, ''))) and not is_admin and not is_teacher;
  if inv is null then return 'unknown'; end if;
  if inv = uid then return 'self'; end if;
  update public.profiles set referred_by = inv where id = uid and referred_by is null;
  return 'ok';
end $$;
revoke execute on function public.claim_referral(text) from public, anon;
grant execute on function public.claim_referral(text) to authenticated;

-- paying: as before, plus the reward for the person who invited the payer (first paid payment only)
create or replace function public.fulfil_payment(p_ref text, p_amount int) returns boolean
language plpgsql security definer set search_path = public as $$
declare pay public.payments; base timestamptz; pr public.profiles; lp int; al text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; s text; i int;
begin
  select * into pay from public.payments where reference = p_ref and status = 'pending' for update;
  if not found or pay.amount_kobo <> p_amount or pay.user_id is null then return false; end if;
  update public.payments set status = 'paid', paid_at = now() where reference = p_ref;
  if pay.coupon_id is not null then update public.coupons set used_count = used_count + 1 where id = pay.coupon_id; end if;
  select greatest(coalesce(plan_expires, now()), now()) into base from public.profiles where id = pay.user_id;
  update public.profiles set plan = pay.plan, plan_expires = base + interval '30 days' where id = pay.user_id;

  select * into pr from public.profiles where id = pay.user_id;
  select price_kobo into lp from public.plans where id = pay.plan;
  if pr.referred_by is not null and pr.referral_paid_at is null
     and (select count(*) from public.payments where user_id = pay.user_id and status = 'paid') = 1
     and lp is not null and pay.amount_kobo * 2 >= lp                       -- not a heavily discounted payment
     and (select count(*) from public.coupons where owner_id = pr.referred_by and source = 'referral' and used_count = 0 and active and (expires_at is null or expires_at > now())) < 5
  then
    loop
      s := 'REF';
      for i in 1..8 loop s := s || substr(al, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1); end loop;
      exit when not exists (select 1 from public.coupons where code = s);
    end loop;
    insert into public.coupons (code, percent, plan, expires_at, max_uses, owner_id, source)
      values (s, 15, 'all', now() + interval '90 days', 1, pr.referred_by, 'referral');
    update public.profiles set referral_paid_at = now() where id = pay.user_id;
    insert into public.notifications (user_id, kind, title, body)
      values (pr.referred_by, 'referral', 'You earned 15% off', 'A friend you invited has paid. Your 15% discount is waiting on the Plans page.');
  end if;
  return true;
end $$;
revoke execute on function public.fulfil_payment(text, int) from public, anon, authenticated;
grant execute on function public.fulfil_payment(text, int) to service_role;

notify pgrst, 'reload schema';
