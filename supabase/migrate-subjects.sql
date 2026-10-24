-- JAMBwise: five new subjects - Accounts (acc), Marketing (mkt), Literature in English (lit), Islamic Religious Knowledge (irk)
-- and Christian Religious Knowledge (crk). Safe to run more than once.
-- Supabase > SQL Editor > New query > paste all of this > Run. THEN run supabase/seed-questions.sql once to add the questions.

alter table public.profiles drop constraint if exists profiles_subjects_check;
alter table public.profiles add constraint profiles_subjects_check
  check (cardinality(subjects) <= 3 and subjects <@ array['mat','phy','chm','bio','gov','eco','com','agr','acc','mkt','lit','irk','crk']);
alter table public.attempts drop constraint if exists attempts_subject_check;
alter table public.attempts add constraint attempts_subject_check check (subject in ('eng','mat','phy','chm','bio','gov','eco','com','agr','acc','mkt','lit','irk','crk'));
alter table public.questions drop constraint if exists questions_subject_check;
alter table public.questions add constraint questions_subject_check check (subject in ('eng','mat','phy','chm','bio','gov','eco','com','agr','acc','mkt','lit','irk','crk'));

create or replace function public.admin_import_questions(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; ins int := 0; dup int := 0; bad int := 0; n int; ok boolean;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 500 then
    raise exception 'send between 1 and 500 questions at a time';
  end if;
  perform set_config('jw.bulk', '1', true);   -- tells the audit trigger not to log every single row
  for r in select value from jsonb_array_elements(p_rows) loop
    ok := jsonb_typeof(r) = 'object'
      and (r->>'subject') in ('eng','mat','phy','chm','bio','gov','eco','com','agr','acc','mkt','lit','irk','crk')
      and char_length(btrim(coalesce(r->>'body', ''))) between 1 and 1000
      and jsonb_typeof(r->'options') = 'array' and jsonb_array_length(r->'options') = 4
      and (r->>'answer') ~ '^[0-3]$'
      and char_length(coalesce(r->>'explanation', '')) <= 1000;
    if ok then
      ok := not exists (select 1 from jsonb_array_elements(r->'options') o
                         where jsonb_typeof(o) <> 'string' or char_length(btrim(o #>> '{}')) not between 1 and 300);
    end if;
    if not ok then bad := bad + 1; continue; end if;
    insert into public.questions (subject, body, options, answer, explanation)
    values (r->>'subject', btrim(r->>'body'),
            (select jsonb_agg(btrim(o.v #>> '{}') order by o.i) from jsonb_array_elements(r->'options') with ordinality as o(v, i)),
            (r->>'answer')::int, nullif(btrim(coalesce(r->>'explanation', '')), ''))
    on conflict (subject, body) do nothing;
    get diagnostics n = row_count;
    if n = 1 then ins := ins + 1; else dup := dup + 1; end if;
  end loop;
  perform set_config('jw.bulk', '', true);
  perform public.admin_log('question.import', ins || ' added, ' || dup || ' duplicates skipped, ' || bad || ' invalid');
  return jsonb_build_object('inserted', ins, 'duplicates', dup, 'invalid', bad);
end $$;
