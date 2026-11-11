-- Adds six schools to Admin > Institutions and to the home page list. Run once in the Supabase SQL Editor.
-- Safe to run again: a school that is already there is skipped.
insert into public.institutions (slug, name, location, note) values
  ('bright-future-international-school', 'Bright Future International School', 'Ikeja, Lagos',                null),
  ('golden-crown-secondary-school',      'Golden Crown Secondary School',      'Warri, Delta State',          null),
  ('excel-heights-college',              'Excel Heights College',              'Asaba, Delta State',          null),
  ('royal-heritage-academy',             'Royal Heritage Academy',             'Abuja, FCT',                  null),
  ('wisdom-gate-secondary-school',       'Wisdom Gate Secondary School',       'Benin City, Edo State',       null),
  ('great-scholars-college',             'Great Scholars College',             'Port Harcourt, Rivers State', null)
on conflict do nothing;

notify pgrst, 'reload schema';
