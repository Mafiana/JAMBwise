-- Home page testimonials: optionally show the person's profile photo.
-- Nothing changes until you press "Photo" on a testimonial in Admin > Feedback. Run once in the Supabase SQL Editor. Safe to run again.
-- Run AFTER migrate-testimonials.sql.

alter table public.feedback add column if not exists show_photo boolean not null default false;

-- Admin > Feedback also reports which testimonials show a photo
drop function if exists public.admin_feedback();
create function public.admin_feedback() returns table (id bigint, user_id uuid, name text, email text, role text, rating int, kind text, message text, status text, created_at timestamptz, featured boolean, show_photo boolean)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query select f.id, f.user_id, p.full_name, p.email, case when p.is_teacher then 'teacher' else 'student' end, f.rating, f.kind, f.message, f.status, f.created_at, f.featured, f.show_photo
    from public.feedback f left join public.profiles p on p.id = f.user_id order by f.created_at desc limit 2000;
end $$;
revoke execute on function public.admin_feedback() from public, anon;
grant execute on function public.admin_feedback() to authenticated;

-- admin: show or hide the person's photo on one testimonial (it must already be on the website, and the person must have a photo)
create or replace function public.admin_set_feedback_photo(p_id bigint, p_show boolean) returns void
language plpgsql security definer set search_path = public as $$
declare f public.feedback; pic text;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  select * into f from public.feedback where id = p_id;
  if not found then raise exception 'That feedback no longer exists.'; end if;
  if p_show then
    if not f.featured then raise exception 'Show this feedback on the website first, then turn the photo on.'; end if;
    select avatar into pic from public.profiles where id = f.user_id;
    if coalesce(pic, '') = '' then raise exception 'This person has not uploaded a profile photo yet.'; end if;
  end if;
  update public.feedback set show_photo = coalesce(p_show, false) where id = p_id;
  perform public.admin_log('feedback.photo', case when p_show then 'shown' else 'hidden' end || ' #' || p_id);
end $$;
revoke execute on function public.admin_set_feedback_photo(bigint, boolean) from public, anon;
grant execute on function public.admin_set_feedback_photo(bigint, boolean) to authenticated;

-- hiding a testimonial from the website also switches its photo off
create or replace function public.admin_set_feedback_featured(p_id bigint, p_featured boolean) returns void
language plpgsql security definer set search_path = public as $$
declare f public.feedback;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  select * into f from public.feedback where id = p_id;
  if not found then raise exception 'That feedback no longer exists.'; end if;
  if p_featured then
    if f.kind <> 'feedback' or char_length(btrim(coalesce(f.message, ''))) < 20 then
      raise exception 'Only feedback with a message of at least 20 characters can be shown on the website.';
    end if;
    if (select count(*) from public.feedback where featured and id <> p_id) >= 6 then
      raise exception 'Six are already on the website. Hide one first.';
    end if;
  end if;
  update public.feedback set featured = coalesce(p_featured, false), show_photo = case when coalesce(p_featured, false) then show_photo else false end where id = p_id;
  perform public.admin_log('feedback.featured', case when p_featured then 'shown' else 'hidden' end || ' #' || p_id);
end $$;
revoke execute on function public.admin_set_feedback_featured(bigint, boolean) from public, anon;
grant execute on function public.admin_set_feedback_featured(bigint, boolean) to authenticated;

-- public: the chosen feedback, first name and surname initial, and the photo only where the Admin turned it on
drop function if exists public.public_testimonials();
create function public.public_testimonials() returns table (id bigint, name text, role text, rating int, message text, photo text)
language sql security definer stable set search_path = public as $$
  select f.id,
         split_part(btrim(coalesce(p.full_name, 'Student')), ' ', 1)
           || case when position(' ' in btrim(coalesce(p.full_name, ''))) > 0
                   then ' ' || upper(left(split_part(btrim(p.full_name), ' ', 2), 1)) || '.' else '' end,
         case when p.is_teacher then 'Teacher' else 'JAMBwise student' end,
         f.rating,
         btrim(f.message),
         case when f.show_photo and coalesce(p.avatar, '') <> '' then p.avatar else null end
    from public.feedback f
    left join public.profiles p on p.id = f.user_id
   where f.featured and f.kind = 'feedback' and char_length(btrim(coalesce(f.message, ''))) >= 20
   order by f.created_at desc
   limit 6;
$$;
revoke execute on function public.public_testimonials() from public;
grant execute on function public.public_testimonials() to anon, authenticated;

notify pgrst, 'reload schema';
