-- Novel keypoints. Run once in the Supabase SQL Editor AFTER migrate-novel.sql (safe to run again). No Edge Function needed.
alter table public.novel add column if not exists keypoints text check (keypoints is null or char_length(keypoints) <= 200000);   -- the keypoints (plain text)
drop function if exists public.get_novel();
create or replace function public.get_novel() returns table (title text, cover text, file_name text, size_bytes integer, has_file boolean, questions bigint, updated_at timestamptz, has_keypoints boolean)
language sql security definer stable set search_path = public as $$
  select n.title, n.cover, n.file_name, n.size_bytes, n.data is not null, (select count(*) from public.novel_questions), n.updated_at, n.keypoints is not null
    from public.novel n where n.id = 1 and auth.uid() is not null;
$$;
revoke execute on function public.get_novel() from public, anon;
grant execute on function public.get_novel() to authenticated;

-- the keypoints text (a summary students can read before the questions), kept as plain text
create or replace function public.get_novel_keypoints() returns text
language sql security definer stable set search_path = public as $$
  select n.keypoints from public.novel n where n.id = 1 and auth.uid() is not null;
$$;
revoke execute on function public.get_novel_keypoints() from public, anon;
grant execute on function public.get_novel_keypoints() to authenticated;

-- admin: save the keypoints text (an empty text removes them)
create or replace function public.admin_save_novel_keypoints(p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare t text := btrim(coalesce(p_text, ''));
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if char_length(t) > 200000 then raise exception 'The keypoints are too long (up to 200,000 characters).'; end if;
  update public.novel set keypoints = nullif(t, ''), updated_at = now() where id = 1;
  perform public.admin_log('novel.keypoints', case when t = '' then 'removed' else char_length(t) || ' characters' end);
end $$;
revoke execute on function public.admin_save_novel_keypoints(text) from public, anon;
grant execute on function public.admin_save_novel_keypoints(text) to authenticated;

notify pgrst, 'reload schema';
