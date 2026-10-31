-- Run once in the Supabase SQL Editor. Safe to run again. No Edge Function needs deploying.
-- Syllabus: the admin uploads one PDF per subject; every signed-in student can open them from the Syllabus page.
-- The PDF is kept inside the database (up to 3 MB each), so there is no storage bucket to set up.

create table if not exists public.syllabi (
  id bigserial primary key,
  subject text not null check (char_length(subject) between 2 and 80),
  file_name text check (char_length(file_name) <= 200),
  size_bytes integer check (size_bytes >= 0),
  data text not null check (data like 'data:application/pdf;base64,%' and char_length(data) <= 4400000),
  created_at timestamptz not null default now()
);
create unique index if not exists syllabi_subject_uq on public.syllabi (lower(subject));
alter table public.syllabi enable row level security;     -- no policies: the table is only reachable through the functions below
revoke all on public.syllabi from anon, authenticated;

-- the list (without the heavy file data)
create or replace function public.list_syllabi() returns table (id bigint, subject text, file_name text, size_bytes integer, created_at timestamptz)
language sql security definer stable set search_path = public as $$
  select s.id, s.subject, s.file_name, s.size_bytes, s.created_at from public.syllabi s where auth.uid() is not null order by lower(s.subject);
$$;
revoke execute on function public.list_syllabi() from public, anon;
grant execute on function public.list_syllabi() to authenticated;

-- one file, when a student opens it
create or replace function public.get_syllabus(p_id bigint) returns text
language sql security definer stable set search_path = public as $$
  select s.data from public.syllabi s where s.id = p_id and auth.uid() is not null;
$$;
revoke execute on function public.get_syllabus(bigint) from public, anon;
grant execute on function public.get_syllabus(bigint) to authenticated;

-- admin: add a syllabus (a subject that already has one is replaced)
create or replace function public.admin_add_syllabus(p_subject text, p_file_name text, p_size integer, p_data text) returns bigint
language plpgsql security definer set search_path = public as $$
declare sub text := btrim(coalesce(p_subject, '')); new_id bigint;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if char_length(sub) < 2 or char_length(sub) > 80 then raise exception 'Enter the subject name (2 to 80 characters).'; end if;
  if p_data is null or p_data not like 'data:application/pdf;base64,%' then raise exception 'Please choose a PDF file.'; end if;
  if char_length(p_data) > 4400000 then raise exception 'That PDF is too big. Choose one under 3 MB.'; end if;
  insert into public.syllabi (subject, file_name, size_bytes, data) values (sub, left(p_file_name, 200), p_size, p_data)
  on conflict (lower(subject)) do update set subject = excluded.subject, file_name = excluded.file_name, size_bytes = excluded.size_bytes, data = excluded.data, created_at = now()
  returning id into new_id;
  return new_id;
end $$;
revoke execute on function public.admin_add_syllabus(text, text, integer, text) from public, anon;
grant execute on function public.admin_add_syllabus(text, text, integer, text) to authenticated;

-- admin: delete a syllabus
create or replace function public.admin_delete_syllabus(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  delete from public.syllabi where id = p_id;
end $$;
revoke execute on function public.admin_delete_syllabus(bigint) from public, anon;
grant execute on function public.admin_delete_syllabus(bigint) to authenticated;

notify pgrst, 'reload schema';
