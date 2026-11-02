-- Removes the Marketing subject (mkt) from your database. Run once in the Supabase SQL Editor. Safe to run again.
-- It deletes every Marketing question (with their pictures and weak-spot records), deletes any Marketing syllabus file, removes Marketing from any
-- student's chosen subjects, and deletes old Marketing practice results so no screen shows a subject that no longer exists.
do $$
declare q int; a int; p int; y int := 0;
begin
  delete from public.questions where subject = 'mkt';             get diagnostics q = row_count;
  delete from public.attempts where subject = 'mkt';              get diagnostics a = row_count;
  update public.profiles set subjects = array_remove(subjects, 'mkt') where 'mkt' = any(subjects);  get diagnostics p = row_count;
  if to_regclass('public.syllabi') is not null then delete from public.syllabi where lower(subject) like '%marketing%'; get diagnostics y = row_count; end if;
  raise notice 'Marketing removed: % questions, % results, % student profiles updated, % syllabus files.', q, a, p, y;
end $$;
