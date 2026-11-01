-- Pictures inside questions (a circuit, a map, a diagram). Safe to run more than once.
-- The picture is kept in its own table so the question lists stay small and fast;
-- a student's phone only downloads a picture when that question is on screen.

alter table public.questions add column if not exists has_image boolean not null default false;

create table if not exists public.question_images (
  question_id bigint primary key references public.questions (id) on delete cascade,
  data text not null check (data like 'data:image/%;base64,%' and char_length(data) <= 300000),
  updated_at timestamptz not null default now()
);
alter table public.question_images enable row level security;     -- no policies: only reachable through the functions below
revoke all on public.question_images from anon, authenticated;

-- a student gets the picture only for a question their plan lets them see
create or replace function public.get_question_image(p_id bigint) returns text
language sql security definer stable set search_path = public as $$
  select i.data
    from public.question_images i
    join public.questions q on q.id = i.question_id
   where i.question_id = p_id
     and auth.uid() is not null
     and (public.has_access(q.subject) or public.is_staff());
$$;
revoke execute on function public.get_question_image(bigint) from public, anon;
grant execute on function public.get_question_image(bigint) to authenticated;

-- admin: add or replace a question's picture. A null or empty picture removes it.
create or replace function public.admin_set_question_image(p_id bigint, p_data text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if not exists (select 1 from public.questions where id = p_id) then raise exception 'That question no longer exists.'; end if;
  if p_data is null or btrim(p_data) = '' then
    delete from public.question_images where question_id = p_id;
    update public.questions set has_image = false where id = p_id and has_image;
    perform public.admin_log('question.image', 'removed from #' || p_id);
    return;
  end if;
  if p_data not like 'data:image/%;base64,%' or char_length(p_data) > 300000 then
    raise exception 'The picture is not valid or is too big.';
  end if;
  insert into public.question_images (question_id, data) values (p_id, p_data)
  on conflict (question_id) do update set data = excluded.data, updated_at = now();
  update public.questions set has_image = true where id = p_id and not has_image;
  perform public.admin_log('question.image', 'set on #' || p_id);
end $$;
revoke execute on function public.admin_set_question_image(bigint, text) from public, anon;
grant execute on function public.admin_set_question_image(bigint, text) to authenticated;

notify pgrst, 'reload schema';
