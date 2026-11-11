-- JAMBwise Blog, part 2: search, categories, likes, and "this post was updated" notifications.
-- Run ONCE in the Supabase SQL Editor, AFTER migrate-blog.sql. Safe to run again.
-- Run this first, then publish the new website files (a few seconds of mismatch at most).

-- 1. new columns and the likes table
alter table public.blog_posts add column if not exists category text check (category is null or char_length(category) between 1 and 40);
alter table public.blog_posts add column if not exists search_text text not null default '';   -- plain words of the post, for the search box

create table if not exists public.blog_likes (
  post_id bigint not null references public.blog_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.blog_likes enable row level security;
revoke all on public.blog_likes from anon, authenticated;

-- the words of a post without tags and pictures (for searching)
create or replace function public.blog_plain(p_html text) returns text
language sql immutable set search_path = public as $$
  select left(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(p_html, ''), '<img[^>]*>', ' ', 'gi'), '<[^>]+>', ' ', 'g'), '&nbsp;|&amp;|&lt;|&gt;|&quot;|&#0?39;', ' ', 'g'), '\s+', ' ', 'g')), 20000);
$$;
update public.blog_posts set search_text = public.blog_plain(body) where search_text = '';

-- 2. bell notifications: a new post, or an updated one. An unread older bell for the same post is replaced, never doubled.
create or replace function public.blog_announce(p_id bigint, p_title text, p_updated boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.notifications n where n.kind = 'blog' and n.read_at is null and (n.link = '/app/blog/' || p_id or n.link = '/app/admin/blog/' || p_id);
  insert into public.notifications (user_id, kind, title, body, link)
    select p.id, 'blog', case when p_updated then 'A blog post was updated' else 'New on the JAMBwise blog' end, left(p_title, 200),
           case when p.is_teacher then '/app/admin/blog/' else '/app/blog/' end || p_id
      from public.profiles p where not p.is_admin;
end $$;
revoke execute on function public.blog_announce(bigint, text, boolean) from public, anon, authenticated;

-- takes back the unread bells of a post that is hidden or deleted
create or replace function public.blog_unannounce(p_id bigint) returns void
language sql security definer set search_path = public as $$
  delete from public.notifications n where n.kind = 'blog' and n.read_at is null and (n.link = '/app/blog/' || p_id or n.link = '/app/admin/blog/' || p_id);
$$;
revoke execute on function public.blog_unannounce(bigint) from public, anon, authenticated;

-- 3. admin: create or change a post (now with a category, and an optional "tell everyone it was updated")
create or replace function public.admin_save_blog_post(p_id bigint, p_title text, p_summary text, p_cover text, p_body text, p_publish boolean, p_category text default null, p_notify boolean default false) returns bigint
language plpgsql security definer set search_path = public as $$
declare t text := btrim(coalesce(p_title, '')); b text := coalesce(p_body, ''); cat text := nullif(btrim(coalesce(p_category, '')), '');
        old public.blog_posts; new_id bigint; first_time boolean := false; was_live boolean := false; pub boolean := coalesce(p_publish, false);
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if char_length(t) < 1 or char_length(t) > 160 then raise exception 'Write a title (up to 160 characters).'; end if;
  if cat is not null and char_length(cat) > 40 then raise exception 'The category can be up to 40 characters.'; end if;
  if char_length(btrim(b)) < 1 then raise exception 'Write the post.'; end if;
  if char_length(b) > 3000000 then raise exception 'This post is too large. Use fewer or smaller pictures.'; end if;
  if b ~* '<\s*(script|iframe|object|embed)' or b ~* 'javascript:' then raise exception 'That content is not allowed.'; end if;
  if p_cover is not null and p_cover <> '' and (p_cover not like 'data:image/%' or char_length(p_cover) > 150000) then raise exception 'The cover picture is too large.'; end if;
  if p_id is null then
    insert into public.blog_posts (title, summary, cover, body, category, search_text, published, published_at, created_by)
      values (t, left(btrim(coalesce(p_summary, '')), 300), nullif(p_cover, ''), b, cat, public.blog_plain(b), pub, case when pub then now() end, auth.uid())
      returning id into new_id;
    first_time := pub;
  else
    select * into old from public.blog_posts where id = p_id for update;
    if not found then raise exception 'That post no longer exists.'; end if;
    new_id := p_id; was_live := old.published;
    first_time := pub and old.published_at is null;
    update public.blog_posts set title = t, summary = left(btrim(coalesce(p_summary, '')), 300), cover = nullif(p_cover, ''), body = b, category = cat, search_text = public.blog_plain(b),
           published = pub, published_at = coalesce(old.published_at, case when pub then now() end), updated_at = now()
     where id = p_id;
  end if;
  if first_time then perform public.blog_announce(new_id, t, false);
  elsif pub and coalesce(p_notify, false) then perform public.blog_announce(new_id, t, true);
  elsif was_live and not pub then perform public.blog_unannounce(new_id);
  end if;
  perform public.admin_log('blog.save', (case when pub then 'published #' else 'draft #' end) || new_id);
  return new_id;
end $$;
revoke execute on function public.admin_save_blog_post(bigint, text, text, text, text, boolean, text, boolean) from public, anon;
grant execute on function public.admin_save_blog_post(bigint, text, text, text, text, boolean, text, boolean) to authenticated;
drop function if exists public.admin_save_blog_post(bigint, text, text, text, text, boolean);

create or replace function public.admin_set_blog_published(p_id bigint, p_publish boolean) returns void
language plpgsql security definer set search_path = public as $$
declare old public.blog_posts; pub boolean := coalesce(p_publish, false);
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  select * into old from public.blog_posts where id = p_id for update;
  if not found then raise exception 'That post no longer exists.'; end if;
  update public.blog_posts set published = pub, published_at = coalesce(old.published_at, case when pub then now() end), updated_at = now() where id = p_id;
  if pub and old.published_at is null then perform public.blog_announce(p_id, old.title, false);
  elsif not pub and old.published then perform public.blog_unannounce(p_id);
  end if;
  perform public.admin_log('blog.publish', (case when pub then 'shown #' else 'hidden #' end) || p_id);
end $$;
revoke execute on function public.admin_set_blog_published(bigint, boolean) from public, anon;
grant execute on function public.admin_set_blog_published(bigint, boolean) to authenticated;

-- 4. admin lists: now with the category and the number of likes
drop function if exists public.admin_blog_posts();
create function public.admin_blog_posts() returns table (id bigint, title text, summary text, category text, published boolean, has_cover boolean, created_at timestamptz, updated_at timestamptz, published_at timestamptz, likes bigint)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query select b.id, b.title, b.summary, b.category, b.published, b.cover is not null, b.created_at, b.updated_at, b.published_at,
                      (select count(*) from public.blog_likes l where l.post_id = b.id)
    from public.blog_posts b order by b.created_at desc limit 1000;
end $$;
revoke execute on function public.admin_blog_posts() from public, anon;
grant execute on function public.admin_blog_posts() to authenticated;

drop function if exists public.admin_blog_post(bigint);
create function public.admin_blog_post(p_id bigint) returns table (id bigint, title text, summary text, cover text, body text, category text, published boolean, published_at timestamptz, updated_at timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query select b.id, b.title, b.summary, b.cover, b.body, b.category, b.published, b.published_at, b.updated_at from public.blog_posts b where b.id = p_id;
end $$;
revoke execute on function public.admin_blog_post(bigint) from public, anon;
grant execute on function public.admin_blog_post(bigint) to authenticated;

-- 5. readers: the list with search and category, likes, and the categories
drop function if exists public.blog_list(int, int);
drop function if exists public.blog_list(int, int, text, text);
create function public.blog_list(p_limit int default 9, p_offset int default 0, p_q text default null, p_category text default null)
returns table (id bigint, title text, summary text, cover text, category text, published_at timestamptz, likes bigint, liked boolean, total bigint)
language sql security definer stable set search_path = public as $$
  select b.id, b.title, b.summary, b.cover, b.category, b.published_at,
         (select count(*) from public.blog_likes l where l.post_id = b.id),
         exists (select 1 from public.blog_likes l where l.post_id = b.id and l.user_id = auth.uid()),
         count(*) over ()
    from public.blog_posts b
   where auth.uid() is not null and b.published
     and (nullif(btrim(coalesce(p_category, '')), '') is null or b.category = btrim(p_category))
     and not exists (select 1 from unnest(string_to_array(lower(btrim(coalesce(p_q, ''))), ' ')) w
                      where w <> '' and position(w in lower(b.title || ' ' || b.summary || ' ' || coalesce(b.category, '') || ' ' || b.search_text)) = 0)
   order by b.published_at desc, b.id desc
   limit least(greatest(coalesce(p_limit, 9), 1), 30) offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke execute on function public.blog_list(int, int, text, text) from public, anon;
grant execute on function public.blog_list(int, int, text, text) to authenticated;

create or replace function public.blog_categories() returns table (category text, n bigint)
language sql security definer stable set search_path = public as $$
  select b.category, count(*) from public.blog_posts b where auth.uid() is not null and b.published and b.category is not null group by b.category order by count(*) desc, b.category;
$$;
revoke execute on function public.blog_categories() from public, anon;
grant execute on function public.blog_categories() to authenticated;

drop function if exists public.blog_get(bigint);
create function public.blog_get(p_id bigint) returns table (id bigint, title text, summary text, cover text, body text, category text, published boolean, published_at timestamptz, updated_at timestamptz, likes bigint, liked boolean)
language sql security definer stable set search_path = public as $$
  select b.id, b.title, b.summary, b.cover, b.body, b.category, b.published, b.published_at, b.updated_at,
         (select count(*) from public.blog_likes l where l.post_id = b.id),
         exists (select 1 from public.blog_likes l where l.post_id = b.id and l.user_id = auth.uid())
    from public.blog_posts b
   where b.id = p_id and auth.uid() is not null and (b.published or public.is_admin());
$$;
revoke execute on function public.blog_get(bigint) from public, anon;
grant execute on function public.blog_get(bigint) to authenticated;

-- 6. like or unlike a published post (press again to take the like back)
create or replace function public.blog_toggle_like(p_id bigint) returns table (liked boolean, likes bigint)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  if not exists (select 1 from public.blog_posts b where b.id = p_id and b.published) then raise exception 'That post is not available.'; end if;
  if exists (select 1 from public.blog_likes l where l.post_id = p_id and l.user_id = auth.uid()) then
    delete from public.blog_likes l where l.post_id = p_id and l.user_id = auth.uid();
  else
    insert into public.blog_likes (post_id, user_id) values (p_id, auth.uid()) on conflict do nothing;
  end if;
  return query select exists (select 1 from public.blog_likes l where l.post_id = p_id and l.user_id = auth.uid()),
                      (select count(*) from public.blog_likes l where l.post_id = p_id);
end $$;
revoke execute on function public.blog_toggle_like(bigint) from public, anon;
grant execute on function public.blog_toggle_like(bigint) to authenticated;

-- the older helper is replaced by blog_announce(bigint, text, boolean)
drop function if exists public.blog_announce(bigint, text);

notify pgrst, 'reload schema';
