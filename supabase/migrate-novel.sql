-- Novel: the admin sets one novel (a cover picture, a PDF to read online, and multiple-choice questions on it).
-- Students and teachers can read it on screen and answer the questions. Run once in the Supabase SQL Editor. Safe to run again.
-- No Edge Function needs deploying. The PDF is kept inside the database (up to 8 MB), so there is no storage bucket to set up.

create table if not exists public.novel (
  id int primary key default 1 check (id = 1),                      -- only one novel
  title text not null default 'Novel' check (char_length(title) between 1 and 120),
  cover text check (cover is null or (cover like 'data:image/%;base64,%' and char_length(cover) <= 400000)),
  file_name text check (char_length(file_name) <= 200),
  size_bytes integer check (size_bytes >= 0),
  data text check (data is null or (data like 'data:application/pdf;base64,%' and char_length(data) <= 11200000)),
  updated_at timestamptz not null default now()
);
insert into public.novel (id) values (1) on conflict do nothing;
alter table public.novel enable row level security;                  -- no policies: only reachable through the functions below
revoke all on public.novel from anon, authenticated;

create table if not exists public.novel_questions (
  id bigserial primary key,
  body text not null check (char_length(body) between 1 and 1000),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  answer int not null check (answer between 0 and 3),
  explanation text check (char_length(explanation) <= 1000),
  unique (body)
);
alter table public.novel_questions enable row level security;
revoke all on public.novel_questions from anon, authenticated;

-- the novel without the heavy PDF
create or replace function public.get_novel() returns table (title text, cover text, file_name text, size_bytes integer, has_file boolean, questions bigint, updated_at timestamptz)
language sql security definer stable set search_path = public as $$
  select n.title, n.cover, n.file_name, n.size_bytes, n.data is not null, (select count(*) from public.novel_questions), n.updated_at
    from public.novel n where n.id = 1 and auth.uid() is not null;
$$;
revoke execute on function public.get_novel() from public, anon;
grant execute on function public.get_novel() to authenticated;

-- the PDF, when someone presses Read novel
create or replace function public.get_novel_file() returns text
language sql security definer stable set search_path = public as $$
  select n.data from public.novel n where n.id = 1 and auth.uid() is not null;
$$;
revoke execute on function public.get_novel_file() from public, anon;
grant execute on function public.get_novel_file() to authenticated;

create or replace function public.get_novel_questions() returns table (id bigint, body text, options jsonb, answer int, explanation text)
language sql security definer stable set search_path = public as $$
  select q.id, q.body, q.options, q.answer, q.explanation from public.novel_questions q where auth.uid() is not null order by q.id limit 2000;
$$;
revoke execute on function public.get_novel_questions() from public, anon;
grant execute on function public.get_novel_questions() to authenticated;

-- admin: save the title, cover and PDF. A null cover or PDF means "leave it as it is".
create or replace function public.admin_save_novel(p_title text, p_cover text, p_file_name text, p_size integer, p_data text) returns void
language plpgsql security definer set search_path = public as $$
declare t text := btrim(coalesce(p_title, ''));
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if char_length(t) < 1 or char_length(t) > 120 then raise exception 'Enter the novel title (up to 120 characters).'; end if;
  if p_cover is not null and (p_cover not like 'data:image/%;base64,%' or char_length(p_cover) > 400000) then raise exception 'The cover picture is not valid or is too big.'; end if;
  if p_data is not null and p_data not like 'data:application/pdf;base64,%' then raise exception 'Please choose a PDF file.'; end if;
  if p_data is not null and char_length(p_data) > 11200000 then raise exception 'That PDF is too big. Choose one under 8 MB.'; end if;
  update public.novel set title = t,
         cover = coalesce(p_cover, cover),
         file_name = case when p_data is not null then left(p_file_name, 200) else file_name end,
         size_bytes = case when p_data is not null then p_size else size_bytes end,
         data = coalesce(p_data, data),
         updated_at = now()
   where id = 1;
  perform public.admin_log('novel.save', t || case when p_data is not null then ' (new PDF)' else '' end || case when p_cover is not null then ' (new cover)' else '' end);
end $$;
revoke execute on function public.admin_save_novel(text, text, text, integer, text) from public, anon;
grant execute on function public.admin_save_novel(text, text, text, integer, text) to authenticated;

-- admin: add questions (rows already checked in the browser; checked again here). Duplicates are skipped.
create or replace function public.admin_import_novel_questions(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; ins int := 0; dup int := 0; bad int := 0; n int; ok boolean;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 500 then
    raise exception 'send between 1 and 500 questions at a time';
  end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    ok := jsonb_typeof(r) = 'object'
      and char_length(btrim(coalesce(r->>'body', ''))) between 1 and 1000
      and jsonb_typeof(r->'options') = 'array' and jsonb_array_length(r->'options') = 4
      and (r->>'answer') ~ '^[0-3]$'
      and char_length(coalesce(r->>'explanation', '')) <= 1000;
    if ok then
      ok := not exists (select 1 from jsonb_array_elements(r->'options') o
                         where jsonb_typeof(o) <> 'string' or char_length(btrim(o #>> '{}')) not between 1 and 300);
    end if;
    if not ok then bad := bad + 1; continue; end if;
    insert into public.novel_questions (body, options, answer, explanation)
    values (btrim(r->>'body'),
            (select jsonb_agg(btrim(o.v #>> '{}') order by o.i) from jsonb_array_elements(r->'options') with ordinality as o(v, i)),
            (r->>'answer')::int, nullif(btrim(coalesce(r->>'explanation', '')), ''))
    on conflict (body) do nothing;
    get diagnostics n = row_count;
    if n = 1 then ins := ins + 1; else dup := dup + 1; end if;
  end loop;
  perform public.admin_log('novel.questions', ins || ' added, ' || dup || ' duplicates skipped, ' || bad || ' invalid');
  return jsonb_build_object('inserted', ins, 'duplicates', dup, 'invalid', bad);
end $$;
revoke execute on function public.admin_import_novel_questions(jsonb) from public, anon;
grant execute on function public.admin_import_novel_questions(jsonb) to authenticated;

-- admin: remove every novel question (to start the list again)
create or replace function public.admin_clear_novel_questions() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  delete from public.novel_questions;
  perform public.admin_log('novel.questions.clear', 'all removed');
end $$;
revoke execute on function public.admin_clear_novel_questions() from public, anon;
grant execute on function public.admin_clear_novel_questions() to authenticated;

notify pgrst, 'reload schema';
