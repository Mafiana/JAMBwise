-- ExamHall is for the Pro plan only. (The Student plan keeps the CBT Mock.)
-- Students who already submitted an ExamHall keep their result. Run once in the Supabase SQL Editor. Safe to run again.

-- true when the signed-in user has a live (unexpired, not suspended) Pro plan
create or replace function public.is_pro() returns boolean
language sql security definer stable set search_path = public as
$$ select coalesce((select plan = 'pro' and (plan_expires is null or plan_expires > now()) and not suspended
                    from public.profiles where id = auth.uid()), false) $$;
grant execute on function public.is_pro() to anon, authenticated;

-- an ExamHall can only be saved by a Pro student; the CBT Mock needs a paid plan; practice stays as it was
drop policy if exists att_insert on public.attempts;
create policy att_insert on public.attempts for insert to authenticated with check (
  user_id = auth.uid()
  and public.has_access(subject)
  and (kind = 'practice' or (kind = 'mock' and public.is_paid()) or (kind = 'hall' and public.is_pro()))
  and not coalesce((select suspended from public.profiles where id = auth.uid()), true)
);

notify pgrst, 'reload schema';
