# Tests

```
npm test
```
Runs the logic tests (`utils.test.js`, the question importer, the offline service worker) and the contact-form CAPTCHA / spam tests (`contact.test.js`, needs Node 22.18 or newer, otherwise skipped), and checks that every question file is valid and that
`supabase/seed-questions.sql` is up to date (`seed.test.js`). No database needed.

## Database security tests (optional)

`rls.test.sql` proves the rules in `supabase/schema.sql`: students cannot upgrade their own plan or make themselves admin,
free students cannot read paid subjects, a PIN works once, a repeated payment webhook cannot grant time twice, and so on. It also covers the admin panel: only admins can write questions and prices, read messages or the activity log; guests cannot write to the messages table directly, and the spam limits and bulk question import behave as described in the README.
It needs any Postgres 15+ (a local one is fine, not your Supabase project):

```
createdb jw_test
psql jw_test -f tests/supabase-stub.sql
psql jw_test -f supabase/schema.sql
psql jw_test -f supabase/seed-questions.sql
psql jw_test -f tests/rls.test.sql      # prints ALL SECURITY TESTS PASSED
```
Run it again after any change to `schema.sql`.
