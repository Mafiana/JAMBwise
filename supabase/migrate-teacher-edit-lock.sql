-- Teachers can no longer edit questions: only the admin can. Run once in the Supabase SQL Editor. Safe to run again.
drop policy if exists q_admin_upd on public.questions;
create policy q_admin_upd on public.questions for update to authenticated using (public.is_admin()) with check (public.is_admin());
notify pgrst, 'reload schema';
