# JAMBwise

JAMB / UTME practice platform: subject practice, timed CBT mocks scored out of 400, an aggregate calculator,
a study planner, Access PINs for schools and tutors, Paystack payments and an admin dashboard.

**Stack:** React 18, Vite, React Router, Supabase (Postgres, Auth, Edge Functions), Paystack.

## Run it on your computer (no setup needed)

```bash
npm install
npm run dev              # opens http://localhost:5173
```

With no `.env` file, JAMBwise starts in **demo mode**: a built-in, browser-only backend with sample students, so you can try
every screen before Supabase and Paystack exist. A yellow bar at the top says so.

- Admin: `admin@demo.com` / `demo1234` (or use the one-click **Admin** button on the log-in page; it opens `/app/admin`)
- Student: `student@demo.com` / `demo1234`
- Access PIN to try on the homepage: `DEMO-2345`, and any PIN you generate in the admin page works too
- Paying on the Plans page upgrades you instantly (no real payment)
- **Reset demo** in the yellow bar restores the sample data

Demo data lives only in your browser and is not secure. It is never used once you connect the real backend.

To go live, copy `.env.example` to `.env` (on Windows: `copy .env.example .env`), fill in the two values from the next section,
and restart `npm run dev`. The demo bar disappears and the app uses your real Supabase project.

Other commands: `npm run build` (production build into `dist/`), `npm run preview`, `npm test`, `npm run seed`.

## Set up Supabase (about 10 minutes)

1. Create a free project at supabase.com.
2. **SQL Editor**: run `supabase/schema.sql`, then `supabase/seed-questions.sql` (358 questions).
3. **Project Settings > API**: copy the *Project URL* and the *anon public key* into `.env`.
   Never put the `service_role` key in `.env` or in any front-end file.
4. **Authentication > Providers > Email**: set the minimum password length to 8. Decide whether to keep
   "Confirm email" on (recommended for real use; the app handles both).
5. **Authentication > URL Configuration**: Site URL = your live address (for example your Netlify URL).
   Add `http://localhost:5173/**` to the redirect URLs for local work.
6. Run the app with your `.env` in place, sign up once, then make yourself admin in the SQL Editor:
   ```sql
   update public.profiles set is_admin = true where email = 'you@example.com';
   ```
   An **Admin** link now appears in the sidebar (or go straight to `/admin`).

### The admin panel (`/admin`)

| Tab | What it does |
| --- | --- |
| Overview | Students, paying users, revenue, activity, 14-day charts, plans ending soon, unread messages |
| Students | Search and filter, export CSV. Click a student to open their page: profile, scores by subject, mock results, payments and tickets, plus the controls to edit details, change plan, suspend, make or remove an admin, reset progress or delete the account |
| Access PINs | Make one named PIN or up to 100 at a time, copy, delete unused ones, export CSV |
| Payments | Every payment with its Paystack reference, status filter, CSV export |
| Questions | Add, edit and delete questions for each subject, or **Import** many at once from a CSV or JSON file |
| Support tickets | Tickets from Customer Support, question reports and messages from the Contact page: read the conversation, reply, mark resolved, reopen, delete. The **Question reports** filter shows only reports |
| Prices | Change the Student and Pro prices (used by the homepage, Billing and Paystack) |
| Activity | A server-written log of everything admins do |

An admin cannot change their own role or delete their own account here, so you cannot lock yourself out.

### Support tickets
Signed-in students open tickets under **Customer Support** and follow the replies there. Admins answer from **Admin > Support tickets**.
A student reply reopens the ticket; an admin reply marks it Answered. Visitors who are not signed in can write through the Contact page;
admins answer those by email.

If you created your database with an older `schema.sql`, run `supabase/migrate-admin-panel.sql` once in the SQL Editor to add tickets,
question reports, the spam limits, bulk import and the admin tools (safe to run again; it must be run before you use the new screens). To add the extra practice questions to an existing database, run `supabase/seed-questions.sql` again
(it skips questions that are already there).

### Question reports
Under every question (in Practice and in the CBT Mock) there is a **Report this question** button. The student picks what looks wrong
(wrong answer, unclear, none correct, not in the syllabus, other), optionally adds a note, and sends it. It becomes a ticket under
**Admin > Support tickets** (filter: *Question reports*) that already contains the question exactly as the student saw it, with the
option marked correct, so you can check it and fix it in the Questions tab. The student can follow the reply under Customer Support.

### Importing many questions at once
**Admin > Questions > Import.** CSV is the easiest: click *Download CSV template*, open it in Excel or Google Sheets, fill one question per row
(`subject, question, option_a, option_b, option_c, option_d, answer, explanation`; the answer is the letter A to D), save as CSV and choose it.
JSON works too, including the files in `supabase/questions`. You see a preview first: rows with a problem are listed and skipped, questions that
already exist are skipped, so importing the same file twice is safe. A whole import is one line in the Activity log.

### Install the app and use it on weak data (PWA)
JAMBwise can be installed on a phone: students see an **Install app** banner on the dashboard (and a card under Settings; on iPhone they use
Share > Add to Home Screen). Once installed it opens like an app from the home screen.
- The app itself is saved on the phone by a service worker (`public/sw.js`), so it opens with no signal.
- After signing in, the question sets a student's plan allows are saved quietly in the background. Practice and CBT mocks then work offline,
  and the app falls back to the saved questions when the connection is very slow (over 7 seconds).
- A result earned offline waits on the phone and is sent automatically when the connection returns (a strip at the top of the app says so).
- Signing out removes the saved questions from the phone. Payments, logins and tickets always need a connection.
- The service worker is only active in the built site (`npm run build`), never in `npm run dev`. After you change the app, deploy as usual:
  phones pick up the new version the next time they open it online. To force every phone to refresh its saved files, change `VERSION` at the top of `public/sw.js`.

### CBT mock: student photo and calculator
The mock exam header shows the student's profile photo as a passport-style portrait (a silhouette if no photo is set; students add one under My Profile). On a computer (screen at least 900px wide with a mouse) a calculator pops up by itself when the mock starts, laid out like the one in the real JAMB CBT: 7 8 9 / C, 4 5 6 x root, 1 2 3 - x squared, 0 . + =. It can be dragged by its title bar, closed with the red X, and opened again with the Calculator button; the keyboard works too (digits, + - * /, Enter, Backspace, C). On phones it stays closed until the student taps Calculator. The logic is in `src/lib/calc.js`.

### CBT Mock, ExamHall and the Scoresheet
There are two timed exams in the student menu. They are the same exam (English plus 3 subjects, 40 seconds a question, question palette, calculator, passport photo), and each can be written **once** per student. The difference is who sees the result:

| | CBT Mock | ExamHall |
|---|---|---|
| Student sees their score | Yes: "View my result" after submitting, the score on the Dashboard and My Progress | **No.** The student only sees that it was submitted and when |
| Admin sees it | Admin > Scoresheet > CBT Mock | Admin > Scoresheet > ExamHall |

- On submit a **"Successfully submitted"** box appears and cannot be skipped. CBT Mock offers *View my result* and a red **Exit CBT MOCK Lab**; ExamHall has only a red **Exit ExamHall**. Afterwards the exam page says it was already submitted and there is no Start button.
- This is enforced in the database, not only on screen: a trigger refuses a second scored attempt of the same exam; students cannot delete a submitted exam (not even with Settings > Reset progress); and students can read only their own practice and CBT Mock rows, so an ExamHall score cannot be fetched even with developer tools (the student can only ask `my_exam_status('hall')` whether and when they submitted). A result earned offline counts as submitted straight away and syncs later.
- **Admin > Scoresheet** has a **CBT Mock / ExamHall** switch. Each lists every student's score, best first (equal scores share a rank), with the subject breakdown, average, highest score and a search box. **Download PDF** saves the exam you are looking at as an A4 landscape PDF (the search filter applies). The PDF is made in the browser by `src/lib/pdf.js`; no extra library is needed.
- If a student really needs another go (for example a power cut), press **Allow retake** on their row. It removes only that exam's result, keeps their other exam and practice history, and is written to Admin > Activity.
- Database already running? Run `supabase/migrate-mock-lock.sql` once in the Supabase SQL Editor (safe to repeat, and safe if you already ran the earlier version). New projects get it from `schema.sql`.

### Subjects

There are 14: Use of English, Mathematics, Physics, Chemistry, Biology, Government, Economics, Commerce, Agricultural Science and (new) **Accounts, Marketing, Literature in English, Islamic Religious Knowledge, Christian Religious Knowledge**. English and Mathematics are free; the rest need a Student or Pro plan. Each subject has its questions in `supabase/questions/<code>.json` (codes: `acc`, `mkt`, `lit`, `irk`, `crk`). The new subjects start with 38 to 40 questions each, enough for a 20-question mock and practice, so add more through **Admin > Questions > Import**. Existing database? Run `supabase/migrate-subjects.sql`, then `supabase/seed-questions.sql` (both safe to repeat).

### ExamHall controls: schedule, warnings, shuffling, resume

- **Schedule.** Admin > Scoresheet > ExamHall has a schedule card: an opening time, a closing time and the number of warnings. Students can only start inside that window, and their exam ends at the closing time at the latest. The window is checked against the **server's clock**, and the database refuses an ExamHall submit before the opening time. Leave both times empty for "open any time".
- **Guards (ExamHall only).** On a computer the exam opens in full screen. Switching tab or window, or leaving full screen, shows a warning, is recorded in `exam_events`, and appears on the Scoresheet in a **Left screen** column (click the count for the times). After the chosen number of warnings (default 3, `0` = warn only) the exam is submitted automatically. Students who were flagged but never submitted are listed under the table. The timer auto-submits when it reaches zero, also if the student is on another page. A browser cannot be made tamper-proof: these guards deter and document, they do not replace a supervisor.
- **Shuffling.** Each student gets a random draw from the question pool (different questions and a different order) and shuffled answer options, so neighbours do not see the same paper.
- **Resume.** The exam in progress (questions, answers, position, warnings and the end time) is kept on the device. After a refresh or power cut the student sees **Welcome back** and carries on; the clock does not pause, and if time ran out meanwhile the exam is submitted at once. A reload is not counted as leaving.
- **Exam log per student.** Admin > Students has a **Logs** button on every row. It shows a student's CBT Mock and ExamHall history: when they started, each time they left the exam screen ("Warning 1 of 3"), when they came back to a restored exam, and how they submitted (by themselves, time ran out, or too many warnings).
- **Exam pages have no menu.** CBT Mock and ExamHall use the full width with no sidebar; the picker has a *Back to dashboard* link, and if a student navigates elsewhere during an exam a banner offers *Return to exam*.
- Database already running? Run `supabase/migrate-exam-controls.sql` once after `migrate-mock-lock.sql` (safe to repeat; also safe if you ran the first version of it, because it upgrades the log). New projects get it from `schema.sql`.

### Release ExamHall results, and the teacher role

- **Results are hidden by default.** After an ExamHall sitting, students only see the date they took it. In **Admin > Scoresheet > ExamHall**, use the **Release** card to show results; once released, students see their score and subject breakdown on the ExamHall page and in My Progress. You can hide them again at any time.
- **Teacher role.** A teacher can view students, scores and exam logs, add and edit questions (including import) and answer support tickets. A teacher cannot see payments, PINs, prices or the activity log, cannot delete anything, and cannot schedule, release or reset ExamHall. Only an admin sets roles: **Students > student > Manage > Role**. In demo mode use the **Teacher** button on the login page (`teacher@demo.com`, password `demo1234`).
- Database already running? Run `supabase/migrate-roles.sql` once, after `migrate-exam-controls.sql` (safe to repeat). New projects get it from `schema.sql`.

### Add students and teachers, the notification bell, and admin-teacher chat

- **Add student** (Admin > Students) and **Add teacher** (Admin > Teachers) create real accounts. You type the name and email and choose a password (or press Generate). The login details are shown once so you can copy them. Students can also be given a plan and days of access. Both go through the `admin-create-user` Edge Function, so the account exists in Supabase Auth and in the `profiles` table.
- **Teachers** (admin sidebar): add, edit name/subject/school, set a new password, suspend or restore, remove the teacher role, delete, and chat. Passwords are changed through the `admin-set-password` Edge Function.
- **Notification bell** (top of the sidebar, for everyone): shows an unread count. When an admin releases ExamHall results, every student who sat it is notified and the notification opens their result. New chat messages notify the other side too. Mark one or all as read.
- **Chat**: admins open a teacher's chat from Admin > Teachers > Chat. Teachers use **Chat with admin** in their sidebar. One thread per teacher, shared by all admins; it refreshes every few seconds.
- Deploy the two new functions: `supabase functions deploy admin-create-user` and `supabase functions deploy admin-set-password`.
- Database already running? Run `supabase/migrate-notify.sql` once, after `migrate-roles.sql` (safe to repeat). New projects get it from `schema.sql`.

### Parent access

Parents can see how a student is doing, without ever logging in as the student.

1. The student opens **Settings > Parent access** and taps **Make a parent code**. The code (like `K7M2-9QXP`) lasts 7 days. The student can renew it, or **Switch off**, at any time, and sees **who has looked** and gets a bell message on every sign-in.
2. The parent opens the **For parents** box on the home page (or `/parent`), types the Student ID, the code and their own name, and passes the quick check. They get a read-only report for 60 minutes: questions and accuracy, subjects that need work, mock results, ExamHall (only after you release results), recent sessions and the last 14 days of practice. Never the email, messages or anything editable.
3. **Admin > Parent access** shows every sign-in and failed try (parent name, relationship, student, result, device, time), with search, filters, dates, pages, CSV export, and a **Switch off** button per student.

Safeguards: 5 wrong tries per student ID per 15 minutes, 20 per device per hour (counted whether or not the ID exists, so nothing is revealed); one vague error message; the same CAPTCHA as the contact form; codes expire; only a short browser description is kept (no IP address). Database: run `supabase/migrate-parent.sql` once, after `migrate-notify.sql`. Deploy the two functions: `supabase functions deploy parent-login` and `supabase functions deploy parent-report`. In demo mode, use ID `JW-2026-000002` and code `DEMO-2468` (shown in the demo banner).

### Spam protection
- **Rate limits** are enforced by the database, so they cannot be skipped from the browser. A student can open 5 tickets an hour (10 question reports an hour)
  and 25 a day; a visitor can send 3 messages an hour per email address and 10 an hour from one network; the whole site accepts at most 120 visitor messages an hour;
  the same text cannot be sent twice in a day. Admins are never limited.
- **CAPTCHA on the Contact page** for visitors who are not signed in (signed-in students are limited by their account instead). Visitors can no longer write to the database
  directly: their message goes through the `contact-submit` Edge Function, which checks the CAPTCHA first.
  - Default: a small spelled-out sum ("What is seven plus five?") that the function verifies. Nothing to configure.
  - Better: **Cloudflare Turnstile** (free). Create a Turnstile widget at dash.cloudflare.com, then put the *site key* in `.env` as `VITE_TURNSTILE_SITE_KEY=...`
    (and in Netlify's environment variables), and run `supabase secrets set TURNSTILE_SECRET=your-secret-key`. The site then shows Turnstile instead of the sum.
- A hidden trap field, a 3-second minimum before an answer is accepted, and a limit of 2 links per message catch simple bots.

### Changing the hero wallpaper
The homepage background is `public/hero-wallpaper.svg`. Replace that file, or put your own photo in `public/` and
change `--hero-img` near the bottom of the hero section in `src/index.css`.

## Deploy the Edge Functions (PIN login, payments, account deletion, contact form)

Install the Supabase CLI, then from this folder:

```bash
supabase login
supabase link --project-ref YOUR_REF
supabase secrets set PAYSTACK_SECRET_KEY=sk_test_xxx ALLOWED_ORIGINS=https://YOUR-SITE.netlify.app,http://localhost:5173
supabase functions deploy pin-activate
supabase functions deploy paystack-init
supabase functions deploy delete-account
supabase functions deploy admin-delete-user
supabase functions deploy admin-create-user
supabase functions deploy admin-set-password
supabase functions deploy parent-login
supabase functions deploy parent-report
supabase functions deploy contact-submit
supabase functions deploy contact-challenge
supabase functions deploy paystack-webhook --no-verify-jwt
```

`contact-submit` and `contact-challenge` power the Contact page for visitors who are not signed in. Until they are deployed, that form shows
"The contact form is not available right now" (signed-in students can still use Customer Support). If you use Cloudflare Turnstile you do not need `contact-challenge`.

`ALLOWED_ORIGINS` is the list of sites allowed to call the functions (comma separated, no spaces). Use your real
site address, and keep the localhost one only while developing.

### Paystack
1. Paystack dashboard > Settings > API Keys & Webhooks.
2. Webhook URL: `https://YOUR_REF.supabase.co/functions/v1/paystack-webhook`
3. Test with a Paystack **test** key and test card first. When it all works, run `supabase secrets set PAYSTACK_SECRET_KEY=sk_live_xxx`.

A payment gives 30 days of the plan and does not renew by itself. Paying again before it ends adds 30 more days.

## Put the site online (Netlify)

Build command `npm run build`, publish directory `dist`. Add the two `VITE_` variables under Site settings >
Environment variables. `public/_redirects` already makes page refreshes work (`vercel.json` does the same on Vercel).

## Access PINs

Admin > Access PINs > Generate PIN. Give the code (for example `K7QM-3XPD`) to a student. They type it in the
box on the homepage. The first use creates their account with the plan you chose, for the number of days you chose.
Until they change it, **the PIN is also their password**, so tell them to set their own in Settings > Change password.

## What the server enforces (not the browser)

- Prices come from the `plans` table. The browser never sends an amount.
- Students can edit only their name, course, school, photo, subjects and exam plan. Plan, expiry, admin flag, suspension and registration number can change only through server functions that check who is calling.
- Paid-subject questions are readable only on a live Student or Pro plan; an expired plan loses access automatically.
- Mock results can be saved only on a paid plan; practice results only for subjects the plan allows.
- Admin actions run in database functions that check `is_admin()` on the server.
- Payments are confirmed by Paystack's signed webhook, re-verified with Paystack, amount-checked, and applied in one transaction so a repeated webhook cannot grant time twice.
- A PIN can be redeemed only once, atomically. Nobody can pre-register a PIN's login address.
- Edge Functions only accept calls from `ALLOWED_ORIGINS`.

`npm test` and `tests/README.md` explain how these rules are tested.

## Questions

Questions live in `supabase/questions/<subject>.json` (4 options, `a` is the index of the right one, plus an explanation).
After editing, run `npm run seed` and run the new `supabase/seed-questions.sql` in Supabase. It skips questions already there,
so it is safe to run again. `npm test` checks every question for mistakes such as duplicate options or a missing explanation.
Please have a teacher check any questions you add: students trust the answer key.

## Project map

```
src/lib/        supabase.js (real or demo backend), api.js (all server calls, offline cache), utils.js, importQuestions.js, calc.js, scoresheet.js and pdf.js (tested logic), constants.js, demo/ (demo mode)
src/context/    Auth, Theme, Exam (practice and exam state)
src/pages/      Landing, Auth, Legal, and app/* screens
public/         sw.js (offline), manifest.webmanifest, icons
supabase/       schema.sql, migrate-admin-panel.sql, migrate-mock-lock.sql, migrate-exam-controls.sql, migrate-roles.sql, migrate-notify.sql, migrate-parent.sql, migrate-subjects.sql, seed-questions.sql, questions/*.json, functions/*
tests/          unit tests and database security tests
```

## Known limits

- Built and checked in a sandbox with no access to a real Supabase or Paystack account. The SQL and security rules were
  run and tested on a real Postgres; the screens were exercised in a real browser against a stand-in for Supabase.
  **Do your first run with Paystack test keys** and walk through sign-up, a PIN, a payment and the admin screens.
- PIN accounts use a reserved address (`xxxx@pin.jambwise.ng`). That means no password-reset email for them; an admin
  can issue a new PIN. Paystack receipts for PIN accounts go to that unreachable address.
- The answer key is sent to the browser (needed for instant feedback), so a determined student can read it in dev tools.
  That only affects their own practice scores; there is no leaderboard.
- Profile photos are stored as small images inside the profile row. If you grow large, move them to Supabase Storage.
- Questions are original practice material, not real JAMB past questions.
- Offline: a result saved while offline is sent when the connection returns. In the rare case a connection drops just after the server received a result, it could be counted twice.
  Phones that never open the app online again keep their saved results until they do.
- The built-in CAPTCHA (a spelled-out sum) stops simple bots; use Cloudflare Turnstile if you are targeted by smarter ones.
  Rate limits by network address treat everyone behind one school or cyber-cafe connection as one sender (10 messages an hour).
