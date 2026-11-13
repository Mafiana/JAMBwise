-- Home page "Blog" section: the three newest published posts, visible to visitors who are not signed in.
-- Only the title, short summary, cover picture, category and date are shared; the full post still needs a login.
-- Run once in the Supabase SQL Editor, AFTER migrate-blog.sql and migrate-blog-v2.sql. Safe to run again.
drop function if exists public.public_blog_latest();
create function public.public_blog_latest() returns table (id bigint, title text, summary text, cover text, category text, published_at timestamptz)
language sql security definer stable set search_path = public as $$
  select b.id, b.title, b.summary, b.cover, b.category, b.published_at
    from public.blog_posts b
   where b.published
   order by b.published_at desc, b.id desc
   limit 3;
$$;
revoke execute on function public.public_blog_latest() from public;
grant execute on function public.public_blog_latest() to anon, authenticated;

notify pgrst, 'reload schema';
