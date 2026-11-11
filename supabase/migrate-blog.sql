-- JAMBwise Blog: the admin writes posts (formatted text and pictures); students and teachers read them.
-- Run once in the Supabase SQL Editor. Safe to run again.

create table if not exists public.blog_posts (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 1 and 160),
  summary text not null default '' check (char_length(summary) <= 300),
  cover text check (cover is null or (cover like 'data:image/%' and char_length(cover) <= 150000)),
  body text not null check (char_length(body) between 1 and 3000000),
  published boolean not null default false,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists blog_posts_pub_idx on public.blog_posts (published, published_at desc);
alter table public.blog_posts enable row level security;
revoke all on public.blog_posts from anon, authenticated;   -- everything goes through the functions below

-- tell every student and teacher (bell) the first time a post is published
create or replace function public.blog_announce(p_id bigint, p_title text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, kind, title, body, link)
    select p.id, 'blog', 'New on the JAMBwise blog', left(p_title, 200),
           case when p.is_teacher then '/app/admin/blog/' else '/app/blog/' end || p_id
      from public.profiles p where not p.is_admin;
end $$;
revoke execute on function public.blog_announce(bigint, text) from public, anon, authenticated;

-- admin: create or change a post. p_publish true = visible to students and teachers, false = draft.
create or replace function public.admin_save_blog_post(p_id bigint, p_title text, p_summary text, p_cover text, p_body text, p_publish boolean) returns bigint
language plpgsql security definer set search_path = public as $$
declare t text := btrim(coalesce(p_title, '')); b text := coalesce(p_body, ''); old public.blog_posts; new_id bigint; first_time boolean := false;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if char_length(t) < 1 or char_length(t) > 160 then raise exception 'Write a title (up to 160 characters).'; end if;
  if char_length(btrim(b)) < 1 then raise exception 'Write the post.'; end if;
  if char_length(b) > 3000000 then raise exception 'This post is too large. Use fewer or smaller pictures.'; end if;
  if b ~* '<\s*(script|iframe|object|embed)' or b ~* 'javascript:' then raise exception 'That content is not allowed.'; end if;
  if p_cover is not null and p_cover <> '' and (p_cover not like 'data:image/%' or char_length(p_cover) > 150000) then raise exception 'The cover picture is too large.'; end if;
  if p_id is null then
    insert into public.blog_posts (title, summary, cover, body, published, published_at, created_by)
      values (t, left(btrim(coalesce(p_summary, '')), 300), nullif(p_cover, ''), b, coalesce(p_publish, false), case when p_publish then now() end, auth.uid())
      returning id into new_id;
    first_time := coalesce(p_publish, false);
  else
    select * into old from public.blog_posts where id = p_id for update;
    if not found then raise exception 'That post no longer exists.'; end if;
    new_id := p_id;
    first_time := coalesce(p_publish, false) and old.published_at is null;
    update public.blog_posts set title = t, summary = left(btrim(coalesce(p_summary, '')), 300), cover = nullif(p_cover, ''), body = b,
           published = coalesce(p_publish, false), published_at = coalesce(old.published_at, case when p_publish then now() end), updated_at = now()
     where id = p_id;
  end if;
  if first_time then perform public.blog_announce(new_id, t); end if;
  perform public.admin_log('blog.save', (case when p_publish then 'published #' else 'draft #' end) || new_id);
  return new_id;
end $$;
revoke execute on function public.admin_save_blog_post(bigint, text, text, text, text, boolean) from public, anon;
grant execute on function public.admin_save_blog_post(bigint, text, text, text, text, boolean) to authenticated;

-- admin: publish or hide a post from the list
create or replace function public.admin_set_blog_published(p_id bigint, p_publish boolean) returns void
language plpgsql security definer set search_path = public as $$
declare old public.blog_posts;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  select * into old from public.blog_posts where id = p_id for update;
  if not found then raise exception 'That post no longer exists.'; end if;
  update public.blog_posts set published = coalesce(p_publish, false), published_at = coalesce(old.published_at, case when p_publish then now() end), updated_at = now() where id = p_id;
  if coalesce(p_publish, false) and old.published_at is null then perform public.blog_announce(p_id, old.title); end if;
  perform public.admin_log('blog.publish', (case when p_publish then 'shown #' else 'hidden #' end) || p_id);
end $$;
revoke execute on function public.admin_set_blog_published(bigint, boolean) from public, anon;
grant execute on function public.admin_set_blog_published(bigint, boolean) to authenticated;

create or replace function public.admin_delete_blog_post(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  delete from public.notifications n where n.kind = 'blog' and (n.link = '/app/blog/' || p_id or n.link = '/app/admin/blog/' || p_id);
  delete from public.blog_posts where id = p_id;
  perform public.admin_log('blog.delete', '#' || p_id);
end $$;
revoke execute on function public.admin_delete_blog_post(bigint) from public, anon;
grant execute on function public.admin_delete_blog_post(bigint) to authenticated;

-- admin: every post (no body or cover, so the list stays light)
create or replace function public.admin_blog_posts() returns table (id bigint, title text, summary text, published boolean, has_cover boolean, created_at timestamptz, updated_at timestamptz, published_at timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query select b.id, b.title, b.summary, b.published, b.cover is not null, b.created_at, b.updated_at, b.published_at
    from public.blog_posts b order by b.created_at desc limit 1000;
end $$;
revoke execute on function public.admin_blog_posts() from public, anon;
grant execute on function public.admin_blog_posts() to authenticated;

-- admin: one whole post, for editing
create or replace function public.admin_blog_post(p_id bigint) returns table (id bigint, title text, summary text, cover text, body text, published boolean, published_at timestamptz, updated_at timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query select b.id, b.title, b.summary, b.cover, b.body, b.published, b.published_at, b.updated_at from public.blog_posts b where b.id = p_id;
end $$;
revoke execute on function public.admin_blog_post(bigint) from public, anon;
grant execute on function public.admin_blog_post(bigint) to authenticated;

-- students and teachers: published posts, newest first, a few at a time (no body, so the list is quick)
create or replace function public.blog_list(p_limit int default 9, p_offset int default 0) returns table (id bigint, title text, summary text, cover text, published_at timestamptz, total bigint)
language sql security definer stable set search_path = public as $$
  select b.id, b.title, b.summary, b.cover, b.published_at, count(*) over ()
    from public.blog_posts b
   where auth.uid() is not null and b.published
   order by b.published_at desc, b.id desc
   limit least(greatest(coalesce(p_limit, 9), 1), 30) offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke execute on function public.blog_list(int, int) from public, anon;
grant execute on function public.blog_list(int, int) to authenticated;

-- one published post to read (the admin can also open a draft to preview it)
create or replace function public.blog_get(p_id bigint) returns table (id bigint, title text, summary text, cover text, body text, published boolean, published_at timestamptz, updated_at timestamptz)
language sql security definer stable set search_path = public as $$
  select b.id, b.title, b.summary, b.cover, b.body, b.published, b.published_at, b.updated_at
    from public.blog_posts b
   where b.id = p_id and auth.uid() is not null and (b.published or public.is_admin());
$$;
revoke execute on function public.blog_get(bigint) from public, anon;
grant execute on function public.blog_get(bigint) to authenticated;

notify pgrst, 'reload schema';
