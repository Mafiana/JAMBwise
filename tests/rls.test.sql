-- Security tests for supabase/schema.sql. Needs a Postgres with Supabase-like roles (see tests/README.md).
-- Any failed assertion raises an exception and stops the run.
\set ON_ERROR_STOP on
begin;
create temp table t_ids (name text primary key, id uuid);
grant all on t_ids to anon, authenticated, service_role;

create function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then return; end;
  raise exception 'SHOULD HAVE FAILED: %', label;
end $$;
create function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u::text,''), true); end $$;
grant execute on function pg_temp.expect_fail(text,text), pg_temp.as_user(uuid) to anon, authenticated, service_role;

-- users (the trigger must create profiles)
insert into auth.users(email, raw_user_meta_data) values ('free@x.com','{"full_name":"Free User"}'),('paid@x.com','{}'),('admin@x.com','{}'),('other@x.com','{}');
insert into t_ids select split_part(email,'@',1), id from auth.users;
update public.profiles set plan='student', plan_expires=now()+interval '10 days' where email='paid@x.com';
update public.profiles set is_admin=true where email='admin@x.com';
do $$ begin
  assert (select count(*) from public.profiles)=4, 'profile trigger';
  assert (select reg_number from public.profiles where email='free@x.com') ~ '^JW-[0-9]{4}-[0-9]{6}$', 'reg number format';
  assert (select full_name from public.profiles where email='paid@x.com')='Student', 'default name';
end $$;

-- PIN domain guard
select pg_temp.expect_fail($$insert into auth.users(email) values ('abcd2345@pin.jambwise.ng')$$, 'squatting pin domain');
insert into auth.users(email, raw_app_meta_data) values ('efgh2345@pin.jambwise.ng','{"pin":"true"}');

-- ===== free student =====
set local role authenticated;
select pg_temp.as_user((select id from t_ids where name='free'));
do $$ begin
  assert (select count(*) from public.profiles)=1, 'student sees only own profile';
  assert (select count(*) from public.questions where subject='eng')>0, 'free reads english';
  assert (select count(*) from public.questions where subject='mat')>0, 'free reads maths';
  assert (select count(*) from public.questions where subject='phy')=0, 'free blocked from physics';
  assert (select count(*) from public.access_pins)=0, 'student cannot see pins';
end $$;
update public.profiles set full_name='New Name', course='Law' where id=auth.uid();
select pg_temp.expect_fail($$update public.profiles set plan='pro' where id=auth.uid()$$, 'self-upgrade plan');
select pg_temp.expect_fail($$update public.profiles set is_admin=true where id=auth.uid()$$, 'self-admin');
select pg_temp.expect_fail($$update public.profiles set suspended=false where id=auth.uid()$$, 'self-unsuspend');
select pg_temp.expect_fail($$update public.profiles set reg_number='JW-2026-000001' where id=auth.uid()$$, 'change reg number');
select pg_temp.expect_fail($$update public.profiles set subjects='{mat,phy,chm,bio}' where id=auth.uid()$$, 'too many subjects');
select pg_temp.expect_fail($$update public.profiles set subjects='{hack}' where id=auth.uid()$$, 'bad subject code');
select pg_temp.expect_fail($$insert into public.payments(reference,user_id,plan,amount_kobo,status) values ('R1',auth.uid(),'pro',0,'paid')$$, 'forge payment');
select pg_temp.expect_fail($$select public.admin_make_pin('pro','x',365)$$, 'non-admin makes PIN');
select pg_temp.expect_fail($$select public.admin_students()$$, 'non-admin lists students');
select pg_temp.expect_fail($$select public.admin_allow_retake(auth.uid())$$, 'non-admin allows a retake');
do $$ begin assert public.my_exam_status('mock') is null and public.my_exam_status('hall') is null, 'no exam yet: status is empty'; end $$;
select pg_temp.expect_fail($$select public.fulfil_payment('R1',1)$$, 'student calls fulfil_payment');
select pg_temp.expect_fail($$select public.redeem_pin('AAAA-BBBB', auth.uid())$$, 'student calls redeem_pin');
select pg_temp.expect_fail($$insert into public.questions(subject,body,options,answer) values ('eng','x','["a","b","c","d"]',0)$$, 'student writes questions');
insert into public.attempts(user_id,subject,correct,total,kind) values (auth.uid(),'eng',3,5,'practice');
select pg_temp.expect_fail($$insert into public.attempts(user_id,subject,correct,total,kind) values (auth.uid(),'phy',3,5,'practice')$$, 'free logs physics');
select pg_temp.expect_fail($$insert into public.attempts(user_id,subject,correct,total,kind,mock_score) values (auth.uid(),'eng',3,5,'mock',300)$$, 'free logs mock');
select pg_temp.expect_fail($$insert into public.attempts(user_id,subject,correct,total,kind) values (auth.uid(),'eng',9,5,'practice')$$, 'correct > total');
select pg_temp.expect_fail($$insert into public.attempts(user_id,subject,correct,total,kind) values ((select id from t_ids where name='other'),'eng',1,1,'practice')$$, 'attempt for someone else');
do $$ begin assert (select full_name from public.profiles where id=auth.uid())='New Name','name update'; end $$;
reset role;

-- ===== paid student =====
set local role authenticated;
select pg_temp.as_user((select id from t_ids where name='paid'));
do $$ begin assert (select count(*) from public.questions where subject='phy')>0, 'paid reads physics'; end $$;
insert into public.attempts(user_id,subject,correct,total,kind,mock_score) values (auth.uid(),'phy',3,5,'mock',60);
-- one mock per student: a second scored mock is refused, the plain subject rows of the same mock are fine, and a student cannot delete a mock to write again
select pg_temp.expect_fail($$insert into public.attempts(user_id,subject,correct,total,kind,mock_score) values (auth.uid(),'eng',4,5,'mock',320)$$, 'second mock refused');
insert into public.attempts(user_id,subject,correct,total,kind) values (auth.uid(),'eng',4,5,'mock');
delete from public.attempts where user_id=auth.uid() and kind='mock';
do $$ begin
  assert (select count(*) from public.attempts where kind='mock' and mock_score is not null)=1, 'student can read their own CBT Mock score';
  assert public.my_exam_status('mock') is not null, 'status shows the mock was submitted';
end $$;
-- ExamHall: same one-attempt rule, but the student can never read the score back
select pg_temp.expect_fail($$insert into public.attempts(user_id,subject,correct,total,kind,mock_score) values (auth.uid(),'eng',4,5,'bogus',100)$$, 'unknown exam kind');
insert into public.attempts(user_id,subject,correct,total,kind,mock_score) values (auth.uid(),'eng',4,5,'hall',310);
insert into public.attempts(user_id,subject,correct,total,kind) values (auth.uid(),'phy',2,5,'hall');
select pg_temp.expect_fail($$insert into public.attempts(user_id,subject,correct,total,kind,mock_score) values (auth.uid(),'eng',5,5,'hall',390)$$, 'second ExamHall refused');
delete from public.attempts where user_id=auth.uid() and kind='hall';
do $$ begin
  assert (select count(*) from public.attempts where kind='hall')=0, 'student cannot read ExamHall scores';
  assert public.my_exam_status('hall') is not null, 'student can learn that ExamHall was submitted';
  assert public.my_exam_status('practice') is null, 'status only answers for exams';
end $$;
insert into public.attempts(user_id,subject,correct,total,kind) values (auth.uid(),'eng',1,5,'practice');
delete from public.attempts where user_id=auth.uid() and kind='practice';
do $$ begin assert (select count(*) from public.attempts where user_id=auth.uid() and kind='practice')=0, 'student can clear practice history'; end $$;
reset role;
do $$ begin
  assert (select count(*) from public.attempts where kind='mock' and mock_score is not null and user_id=(select id from t_ids where name='paid'))=1, 'a submitted mock survives the student deleting';
  assert (select count(*) from public.attempts where kind='hall' and mock_score=310 and user_id=(select id from t_ids where name='paid'))=1, 'a submitted ExamHall survives the student deleting';
end $$;

-- expired plan loses access
update public.profiles set plan_expires=now()-interval '1 day' where email='paid@x.com';
set local role authenticated;
select pg_temp.as_user((select id from t_ids where name='paid'));
do $$ begin assert (select count(*) from public.questions where subject='phy')=0, 'expired plan blocked'; end $$;
reset role;
update public.profiles set plan_expires=now()+interval '10 days' where email='paid@x.com';

-- suspended users lose access
update public.profiles set suspended=true where email='paid@x.com';
set local role authenticated;
select pg_temp.as_user((select id from t_ids where name='paid'));
do $$ begin assert (select count(*) from public.questions where subject='phy')=0, 'suspended blocked'; end $$;
select pg_temp.expect_fail($$insert into public.attempts(user_id,subject,correct,total,kind) values (auth.uid(),'eng',1,1,'practice')$$, 'suspended logs attempt');
reset role;
update public.profiles set suspended=false where email='paid@x.com';

-- ===== admin =====
set local role authenticated;
select pg_temp.as_user((select id from t_ids where name='admin'));
do $$
declare p text;
begin
  p := public.admin_make_pin('student','Ada',30);
  assert p ~ '^[A-Z2-9]{4}-[A-Z2-9]{4}$', 'pin format';
  insert into t_ids values ('pin', null);
  perform set_config('t.pin', p, true);
  assert (select count(*) from public.profiles)=5, 'admin sees all profiles';
  assert (select count(*) from public.admin_students())=5, 'admin_students';
  assert (select students from public.admin_stats())=5, 'admin_stats';
end $$;
select public.admin_set_plan((select id from t_ids where name='free'),'pro',60);
select public.admin_set_student((select id from t_ids where name='other'),'Other','Med','UNILAG',true);
do $$ begin
  assert (select plan from public.profiles where email='free@x.com')='pro','admin set plan';
  assert (select plan_expires from public.profiles where email='free@x.com') > now()+interval '59 days','plan expiry set';
  assert (select suspended from public.profiles where email='other@x.com'),'admin suspend';
end $$;
reset role;

-- ===== admin panel extras =====
set local role authenticated;
select pg_temp.as_user((select id from t_ids where name='admin'));
do $$
declare ps text[];
begin
  ps := public.admin_make_pins('student', 30, 5);
  assert array_length(ps,1)=5, 'bulk pins';
  assert (select count(*) from public.access_pins where pin = any(ps))=5, 'bulk pins stored';
  assert (select count(*) from public.admin_students() where is_admin)=1, 'admin_students has is_admin';
  insert into public.questions(subject,body,options,answer,explanation) values ('eng','Admin Q?','["a","b","c","d"]',1,'x');
  update public.questions set answer=2 where body='Admin Q?';
  assert (select answer from public.questions where body='Admin Q?')=2, 'admin edits question';
  update public.plans set price_kobo=160000 where id='student';
  assert (select price_kobo from public.plans where id='student')=160000, 'admin sets price';
  delete from public.questions where body='Admin Q?';
end $$;
select public.admin_set_role((select id from t_ids where name='other'), true);
select pg_temp.expect_fail($$select public.admin_set_role((select id from t_ids where name='admin'), false)$$, 'admin demotes self');
select public.admin_set_role((select id from t_ids where name='other'), false);
select pg_temp.expect_fail($$select public.admin_allow_retake((select id from t_ids where name='paid'), 'practice')$$, 'retake only for exams');
do $$ begin assert (select count(*) from public.attempts where kind='hall' and user_id=(select id from t_ids where name='paid'))>0, 'admin reads ExamHall scores'; end $$;
select public.admin_allow_retake((select id from t_ids where name='paid'), 'hall');
do $$ begin
  assert (select count(*) from public.attempts where user_id=(select id from t_ids where name='paid') and kind='hall')=0, 'retake clears ExamHall';
  assert (select count(*) from public.attempts where user_id=(select id from t_ids where name='paid') and kind='mock')>0, 'retake for ExamHall leaves the CBT Mock alone';
end $$;
-- ===== ExamHall controls: window, warning limit, "left the exam screen" log =====
select public.admin_set_exam_window('hall', now() + interval '1 day', now() + interval '2 days', 2);
select pg_temp.expect_fail($$select public.admin_set_exam_window('hall', now() + interval '2 days', now() + interval '1 day', 3)$$, 'closes before it opens');
select pg_temp.expect_fail($$select public.admin_set_exam_window('practice', null, null, 3)$$, 'window only for exams');
select pg_temp.as_user((select id from t_ids where name='paid'));
set local role authenticated;
do $$ begin
  assert (public.exam_window('hall')->>'max_violations')::int = 2, 'student sees the warning limit';
  assert (public.exam_window('hall')->>'opens_at') is not null and (public.exam_window('hall')->>'server_now') is not null, 'student sees the window and server time';
  assert (public.exam_window('mock')->>'opens_at') is null and (public.exam_window('mock')->>'max_violations')::int = 3, 'unset exam is open with the default limit';
end $$;
select pg_temp.expect_fail($$insert into public.attempts(user_id,subject,correct,total,kind,mock_score) values (auth.uid(),'eng',4,5,'hall',310)$$, 'ExamHall submitted before it opens');
select pg_temp.expect_fail($$select public.admin_set_exam_window('hall', null, null, 3)$$, 'student sets the window');
select pg_temp.expect_fail($$select * from public.admin_exam_events('hall')$$, 'student reads the integrity log');
select pg_temp.expect_fail($$select * from public.exam_events$$, 'student reads exam_events directly');
select public.log_exam_event('hall', 'left_tab', now() - interval '5 seconds', 'away 5s');
select public.log_exam_event('hall', 'left_fullscreen', null, null);
select public.log_exam_event('hall', 'made_up', null, null);
select public.log_exam_event('hall', 'started', null, null);
select public.log_exam_event('hall', 'submitted', null, 'Submitted by the student');
select public.log_exam_event('practice', 'left_tab', null, null);
reset role;
do $$ begin assert (select count(*) from public.exam_events)=4, 'only valid events are stored'; end $$;
select pg_temp.as_user(null);
select pg_temp.as_user((select id from t_ids where name='admin'));
set local role authenticated;
do $$ begin
  assert (select count(*) from public.admin_exam_events('hall'))=4, 'admin reads the integrity log';
  assert (select count(*) from public.admin_exam_events('hall', (select id from t_ids where name='paid')))=4 and (select count(*) from public.admin_exam_events('hall', (select id from t_ids where name='other')))=0, 'log can be filtered to one student';
  assert exists (select 1 from public.audit_log where action='hall.schedule'), 'schedule change logged';
end $$;
-- once the window is open the same submit works
select public.admin_set_exam_window('hall', now() - interval '1 hour', now() + interval '1 hour', 3);
reset role;
select pg_temp.as_user((select id from t_ids where name='paid'));
set local role authenticated;
insert into public.attempts(user_id,subject,correct,total,kind,mock_score) values (auth.uid(),'eng',4,5,'hall',310);
reset role;
select pg_temp.as_user((select id from t_ids where name='admin'));
set local role authenticated;
select public.admin_allow_retake((select id from t_ids where name='paid'), 'hall');
do $$ begin assert (select count(*) from public.admin_exam_events('hall'))=0, 'a retake clears the integrity log'; end $$;
-- ===== Teacher role =====
reset role;
insert into auth.users(email) values ('tutor@x.com');
insert into t_ids select split_part(email,'@',1), id from auth.users where email='tutor@x.com';
select pg_temp.as_user((select id from t_ids where name='admin'));
set local role authenticated;
select pg_temp.expect_fail($$select public.admin_set_staff_role((select id from t_ids where name='tutor'), 'owner')$$, 'unknown role');
select pg_temp.expect_fail($$select public.admin_set_staff_role(auth.uid(), 'teacher')$$, 'admin changes own role');
select public.admin_set_staff_role((select id from t_ids where name='tutor'), 'teacher');
do $$ begin assert (select is_teacher and not is_admin from public.profiles where email='tutor@x.com'), 'teacher flag set'; end $$;
select pg_temp.as_user((select id from t_ids where name='tutor'));
do $$ begin
  assert public.is_staff() and not public.is_admin(), 'teacher is staff, not admin';
  assert (select count(*) from public.admin_students())>=4, 'teacher lists students';
  assert (select count(*) from public.profiles)>=4, 'teacher reads profiles';
  assert (select count(*) from public.attempts)>0, 'teacher reads scores';
  assert (select count(*) from public.questions where subject in ('phy','chm','bio'))>0, 'teacher reads paid questions';
  assert (select count(*) from public.admin_exam_events('hall'))>=0, 'teacher reads the exam log';
end $$;
-- a teacher sees students only: no admins and no teachers in the list, nor in direct reads (their own row stays visible)
do $$ begin
  assert (select count(*) from public.admin_students() where is_admin or is_teacher) = 0, 'teacher does not see admins or teachers in the students list';
  assert (select count(*) from public.profiles where is_admin) = 0, 'teacher cannot read an admin profile';
  assert (select count(*) from public.profiles where id = auth.uid()) = 1, 'teacher still reads their own profile';
end $$;
select public.teacher_signed_in();
select public.teacher_signed_in();
reset role;
select pg_temp.as_user((select id from t_ids where name='admin'));
set local role authenticated;
do $$ begin
  assert (select count(*) from public.admin_students() where is_teacher) >= 1, 'admin still sees teachers in the list';
  assert (select count(*) from public.my_notifications() where kind = 'teacher') = 1, 'admin told once when a teacher signs in (not twice within 30 minutes)';
end $$;
reset role;
select pg_temp.as_user((select id from t_ids where name='paid'));
set local role authenticated;
select public.teacher_signed_in();
reset role;
select pg_temp.as_user((select id from t_ids where name='admin'));
set local role authenticated;
do $$ begin assert (select count(*) from public.my_notifications() where kind = 'teacher') = 1, 'a student calling it rings nothing'; end $$;
reset role;
select pg_temp.as_user((select id from t_ids where name='tutor'));
set local role authenticated;
insert into public.questions(subject, body, options, answer) values ('eng','Teacher added this?','["a","b","c","d"]'::jsonb,2);
update public.questions set explanation = 'edited by teacher' where body = 'Teacher added this?';
do $$ begin assert (select explanation from public.questions where body = 'Teacher added this?') = 'edited by teacher', 'teacher edits questions'; end $$;
delete from public.questions where body = 'Teacher added this?';
do $$ begin assert (select count(*) from public.questions where body = 'Teacher added this?') = 1, 'teacher cannot delete questions'; end $$;
update public.plans set price_kobo = 1 where id = 'student';
do $$ begin
  assert (select price_kobo from public.plans where id = 'student') <> 1, 'teacher cannot change prices';
  assert (select count(*) from public.payments) = 0, 'teacher cannot read payments';
  assert (select count(*) from public.audit_log) = 0, 'teacher cannot read the activity log';
  assert (select count(*) from public.access_pins) = 0, 'teacher cannot read PINs';
end $$;
select pg_temp.expect_fail($$select public.admin_make_pin('pro','x',30)$$, 'teacher makes a PIN');
select pg_temp.expect_fail($$select public.admin_set_plan((select id from t_ids where name='paid'), 'pro', 30)$$, 'teacher changes a plan');
select pg_temp.expect_fail($$select public.admin_set_student((select id from t_ids where name='paid'), 'X', '', '', true)$$, 'teacher suspends a student');
select pg_temp.expect_fail($$select public.admin_set_staff_role((select id from t_ids where name='paid'), 'admin')$$, 'teacher makes an admin');
select pg_temp.expect_fail($$select public.admin_reset_progress((select id from t_ids where name='paid'))$$, 'teacher resets progress');
select pg_temp.expect_fail($$select public.admin_allow_retake((select id from t_ids where name='paid'), 'hall')$$, 'teacher allows a retake');
select pg_temp.expect_fail($$select public.admin_set_exam_window('hall', null, null, 3)$$, 'teacher sets the schedule');
select pg_temp.expect_fail($$select public.admin_set_results_released('hall', true)$$, 'teacher releases results');
select pg_temp.expect_fail($$select * from public.admin_stats()$$, 'teacher reads revenue stats');
select pg_temp.expect_fail($$update public.profiles set is_teacher = false where id = auth.uid()$$, 'teacher edits own role column');
select pg_temp.expect_fail($$update public.profiles set is_admin = true where id = auth.uid()$$, 'teacher makes self admin');
select pg_temp.as_user((select id from t_ids where name='admin'));
select public.admin_set_staff_role((select id from t_ids where name='tutor'), 'admin');
do $$ begin assert (select is_admin and not is_teacher from public.profiles where email='tutor@x.com'), 'promoting to admin clears the teacher flag'; end $$;
select public.admin_set_staff_role((select id from t_ids where name='tutor'), 'student');
do $$ begin
  assert (select not is_admin and not is_teacher from public.profiles where email='tutor@x.com'), 'demoted to student';
  assert exists (select 1 from public.audit_log where action = 'role.teacher'), 'role change logged';
end $$;
delete from public.questions where body = 'Teacher added this?';

-- ===== ExamHall results are hidden until an admin releases them =====
select pg_temp.as_user((select id from t_ids where name='paid'));
insert into public.attempts(user_id,subject,correct,total,kind,mock_score) values (auth.uid(),'eng',15,20,'hall',310);
insert into public.attempts(user_id,subject,correct,total,kind) values (auth.uid(),'phy',12,20,'hall');
do $$ declare r jsonb; begin
  r := public.my_exam_result('hall');
  assert (r->>'released')::boolean = false and r->'total' is null and r->'subjects' is null, 'ExamHall score hidden before release';
  assert (public.exam_window('hall')->>'results_released')::boolean = false, 'window says results are not released';
  assert (public.my_exam_result('mock')) is null or (public.my_exam_result('mock')->>'released')::boolean, 'CBT Mock is never hidden';
end $$;
select pg_temp.expect_fail($$select public.admin_set_results_released('hall', true)$$, 'student releases results');
select pg_temp.as_user((select id from t_ids where name='admin'));
select public.admin_set_results_released('hall', true);
select pg_temp.as_user((select id from t_ids where name='paid'));
do $$ declare r jsonb; begin
  r := public.my_exam_result('hall');
  assert (r->>'released')::boolean and (r->>'total')::int = 310 and jsonb_array_length(r->'subjects') = 2, 'ExamHall score visible after release';
  assert (select count(*) from public.attempts where kind = 'hall') = 0, 'attempt rows stay hidden from students';
end $$;
select pg_temp.as_user((select id from t_ids where name='admin'));
select public.admin_set_results_released('hall', false);
select pg_temp.as_user((select id from t_ids where name='paid'));
do $$ begin assert (public.my_exam_result('hall')->>'released')::boolean = false, 'hidden again after unrelease'; end $$;
select pg_temp.as_user((select id from t_ids where name='admin'));
do $$ begin assert exists (select 1 from public.audit_log where action = 'hall.release') and exists (select 1 from public.audit_log where action = 'hall.unrelease'), 'release logged'; end $$;

-- ===== notification bell =====
-- (the first release above already told 'paid', who sat ExamHall; 'free' never did)
select pg_temp.as_user((select id from t_ids where name='paid'));
do $$ begin
  assert (select count(*) from public.my_notifications() where kind = 'result' and read_at is null) = 1, 'student told when results were released';
  assert (select link from public.my_notifications() limit 1) = '/app/examhall', 'notification links to the result';
end $$;
select public.mark_notifications_read((select id from public.my_notifications() limit 1));
do $$ begin assert (select count(*) from public.my_notifications() where read_at is null) = 0, 'marked read'; end $$;
select pg_temp.as_user((select id from t_ids where name='free'));
do $$ begin assert (select count(*) from public.my_notifications()) = 0, 'a student who did not sit gets no result alert'; end $$;
select pg_temp.expect_fail($$insert into public.notifications(user_id, kind, title) values (auth.uid(), 'result', 'fake')$$, 'student writes a notification');
select pg_temp.expect_fail($$update public.notifications set read_at = null$$, 'student edits notifications directly');
select pg_temp.as_user((select id from t_ids where name='admin'));
select public.admin_set_results_released('hall', true);   -- shown again: tells them again
select pg_temp.as_user((select id from t_ids where name='paid'));
do $$ begin
  assert (select count(*) from public.my_notifications()) = 2, 'a second release rings again';
  assert (select count(*) from public.notifications) = 2, 'a student only ever reads their own';
end $$;
select public.mark_notifications_read();
select pg_temp.as_user((select id from t_ids where name='admin'));
do $$ begin assert (select count(*) from public.my_notifications() where kind = 'result') = 0, 'admin did not get the students alert'; end $$;
select public.admin_set_results_released('hall', false);

-- ===== admin <-> teacher chat =====
select public.admin_set_staff_role((select id from t_ids where name='tutor'), 'teacher');
select pg_temp.as_user((select id from t_ids where name='paid'));
select pg_temp.expect_fail($$select public.staff_chat_send((select id from t_ids where name='tutor'), 'hi')$$, 'student sends staff chat');
select pg_temp.expect_fail($$select * from public.staff_chat_thread((select id from t_ids where name='tutor'))$$, 'student reads staff chat');
select pg_temp.expect_fail($$select * from public.staff_chat_inbox()$$, 'student reads chat inbox');
select pg_temp.as_user((select id from t_ids where name='admin'));
select pg_temp.expect_fail($$select public.staff_chat_send((select id from t_ids where name='paid'), 'hi')$$, 'admin chats with a non-teacher');
select pg_temp.expect_fail($$select public.staff_chat_send((select id from t_ids where name='tutor'), '   ')$$, 'empty message');
select pg_temp.expect_fail($$select public.staff_chat_send((select id from t_ids where name='tutor'), repeat('x', 2001))$$, 'message too long');
select public.staff_chat_send((select id from t_ids where name='tutor'), 'Please add Physics questions.');
select public.staff_chat_send((select id from t_ids where name='tutor'), 'Thanks!');
select pg_temp.as_user((select id from t_ids where name='tutor'));
do $$ begin
  assert (select count(*) from public.my_notifications() where kind = 'chat' and read_at is null) = 1, 'repeated pings collapse into one notification';
  assert (select link from public.my_notifications() where kind = 'chat') = '/app/admin/chat', 'teacher is sent to the chat page';
  assert (select count(*) from public.staff_chat_thread(auth.uid())) = 2, 'teacher reads own thread';
end $$;
select pg_temp.expect_fail($$select public.staff_chat_send((select id from t_ids where name='admin'), 'sneaky')$$, 'teacher writes into another thread');
select pg_temp.expect_fail($$select * from public.staff_chat_thread((select id from t_ids where name='admin'))$$, 'teacher reads another thread');
select pg_temp.expect_fail($$select * from public.staff_chat_inbox()$$, 'teacher reads the admin inbox');
select pg_temp.expect_fail($$insert into public.staff_chat(teacher_id, sender_id, body) values (auth.uid(), auth.uid(), 'direct')$$, 'teacher inserts chat rows directly');
select public.staff_chat_send(auth.uid(), 'On it.');
select pg_temp.as_user((select id from t_ids where name='admin'));
do $$ begin
  assert (select count(*) from public.my_notifications() where kind = 'chat' and link like '/app/admin/teachers?chat=%') = 1, 'admin told about the teachers reply';
  assert (select count(*) from public.staff_chat_thread((select id from t_ids where name='tutor'))) = 3, 'admin reads the thread';
  assert (select count(*) from public.staff_chat_inbox()) = 1 and (select last_body from public.staff_chat_inbox()) = 'On it.', 'inbox shows the latest message';
end $$;
select pg_temp.as_user((select id from t_ids where name='paid'));
do $$ begin assert (select count(*) from public.staff_chat) = 0, 'students read no chat rows'; end $$;
select pg_temp.as_user((select id from t_ids where name='admin'));
select public.admin_set_staff_role((select id from t_ids where name='tutor'), 'student');
select public.admin_reset_progress((select id from t_ids where name='paid'));
select public.admin_allow_retake((select id from t_ids where name='paid'));
do $$ begin assert (select count(*) from public.attempts where user_id=(select id from t_ids where name='paid') and kind='mock')=0, 'retake clears the mock'; end $$;
select public.admin_reset_progress((select id from t_ids where name='paid'));
select pg_temp.expect_fail($$select public.admin_make_pins('pro',30,500)$$, 'bulk pin over limit');
do $$ begin
  assert (select count(*) from public.audit_log)>=6, 'audit log written';
  assert exists (select 1 from public.audit_log where action='plan.price'), 'price change logged';
  assert exists (select 1 from public.audit_log where action='question.add'), 'question add logged';
  assert exists (select 1 from public.audit_log where action='mock.retake'), 'retake logged';
  assert exists (select 1 from public.audit_log where action='hall.retake'), 'ExamHall retake logged';
  assert (select count(*) from public.attempts where user_id=(select id from t_ids where name='paid'))=0, 'progress reset';
end $$;
reset role;

-- contact form: guests cannot write to the table directly (they go through the contact-submit Edge Function,
-- which uses the service role after checking a CAPTCHA); nobody but admins can read other people's messages
set local role anon;
select pg_temp.expect_fail($$insert into public.messages(name,email,topic,body) values ('Visitor','v@x.com','general','Hello there team')$$, 'anon inserts a message directly');
select pg_temp.expect_fail($$select * from public.messages$$, 'anon reads messages');
reset role;
set local role service_role;
insert into public.messages(name,email,topic,body,abuse_key) values ('Visitor','v@x.com','general','Hello there team', md5('1.2.3.4'));
select pg_temp.expect_fail($$insert into public.messages(name,email,body) values ('A','not-an-email','Hello there')$$, 'bad email');
select pg_temp.expect_fail($$insert into public.messages(name,email,body) values ('A','a@x.com','hi')$$, 'too short');
reset role;
set local role authenticated;
select pg_temp.as_user((select id from t_ids where name='free'));
do $$ begin assert (select count(*) from public.messages)=0, 'student cannot read messages'; end $$;
do $$ begin assert (select count(*) from public.audit_log)=0, 'student sees no audit rows'; end $$;
select pg_temp.expect_fail($$insert into public.questions(subject,body,options,answer) values ('eng','S?','["a","b","c","d"]',0)$$, 'student writes questions');
update public.plans set price_kobo=1 where id='pro';
do $$ begin assert (select price_kobo from public.plans where id='pro')=300000, 'student cannot change price'; end $$;
select pg_temp.expect_fail($$select public.admin_set_role(auth.uid(), true)$$, 'student makes self admin');
select pg_temp.expect_fail($$select public.admin_log('x','y')$$, 'student calls admin_log');
reset role;
set local role authenticated;
select pg_temp.as_user((select id from t_ids where name='admin'));
do $$ begin assert (select count(*) from public.messages)=1, 'admin reads messages'; end $$;
update public.messages set status='read';
do $$ begin assert (select status from public.messages limit 1)='read', 'admin triages'; end $$;
reset role;

-- ===== support tickets =====
set local role authenticated;
select pg_temp.as_user((select id from t_ids where name='free'));
insert into public.messages(name,email,topic,subject,body,user_id) values ('Free User','free@x.com','payment','Paid but no access','I paid yesterday and still see Free.', (select id from t_ids where name='free'));
select pg_temp.expect_fail($$insert into public.messages(name,email,topic,body,user_id) values ('X','x@x.com','general','pretending to be someone',(select id from t_ids where name='paid'))$$, 'ticket for someone else');
select pg_temp.expect_fail($$insert into public.message_replies(message_id,body) values (1,'direct insert')$$, 'direct reply insert');
update public.messages set status='resolved';
do $$ begin assert (select status from public.messages)='new', 'student cannot set status directly'; end $$;
do $$ begin assert (select count(*) from public.messages)=1, 'student sees only own ticket'; end $$;
reset role;
do $$ begin perform set_config('t.tid', (select id::text from public.messages where user_id=(select id from t_ids where name='free')), true); end $$;
set local role authenticated;
select pg_temp.as_user((select id from t_ids where name='other'));
do $$ begin assert (select count(*) from public.messages)=0, 'other student cannot see the ticket'; assert (select count(*) from public.message_replies)=0, 'other student sees no replies'; end $$;
select pg_temp.expect_fail($$select public.ticket_reply(current_setting('t.tid')::bigint,'hijack')$$, 'reply to someone elses ticket');
select pg_temp.expect_fail($$select public.ticket_close(current_setting('t.tid')::bigint)$$, 'close someone elses ticket');
reset role;
set local role authenticated;
select pg_temp.as_user((select id from t_ids where name='admin'));
select public.ticket_reply(current_setting('t.tid')::bigint,'Please send your Paystack reference.');
do $$ begin
  assert (select status from public.messages where id=current_setting('t.tid')::bigint)='answered','admin reply marks answered';
  assert (select is_staff from public.message_replies limit 1),'reply flagged as staff';
  assert exists (select 1 from public.audit_log where action='ticket.reply'),'ticket reply logged';
end $$;
select pg_temp.expect_fail($$select public.ticket_reply(current_setting('t.tid')::bigint,'   ')$$, 'empty reply');
reset role;
set local role authenticated;
select pg_temp.as_user((select id from t_ids where name='free'));
do $$ begin assert (select count(*) from public.message_replies)=1,'student sees staff reply'; end $$;
select public.ticket_reply(current_setting('t.tid')::bigint,'Reference: T123');
do $$ begin
  assert (select status from public.messages where id=current_setting('t.tid')::bigint)='new','student reply reopens';
  assert (select count(*) from public.message_replies)=2,'two replies';
end $$;
select public.ticket_close(current_setting('t.tid')::bigint);
do $$ begin assert (select status from public.messages where id=current_setting('t.tid')::bigint)='resolved','student closes own ticket'; end $$;
reset role;
set local role anon;
select pg_temp.expect_fail($$select public.ticket_reply(1,'anon reply')$$, 'anon replies');
select pg_temp.expect_fail($$select * from public.message_replies$$, 'anon reads replies');
reset role;


-- ===== question reports, rate limits and bulk import =====
set local role authenticated;
select pg_temp.as_user((select id from t_ids where name='other'));
insert into public.messages(name,email,topic,subject,body,user_id) values ('Other','other@x.com','question','Report: Q#5 (Mathematics)','Q#5 marks the wrong answer. Option B is correct.', (select id from t_ids where name='other'));
do $$ begin assert (select topic from public.messages where user_id=(select id from t_ids where name='other'))='question','question report is a ticket'; end $$;
-- the same text twice is refused
select pg_temp.expect_fail($$insert into public.messages(name,email,topic,body,user_id) values ('Other','other@x.com','question','Q#5 marks the wrong answer. Option B is correct.',(select id from t_ids where name='other'))$$, 'duplicate message');
-- students are limited to 5 tickets an hour (this one has used 1 already, so 4 more work and the 6th is refused)
do $$ begin for i in 1..4 loop insert into public.messages(name,email,topic,body,user_id) values ('Other','other@x.com','general','Different message number ' || i, (select id from t_ids where name='other')); end loop; end $$;
select pg_temp.expect_fail($$insert into public.messages(name,email,topic,body,user_id) values ('Other','other@x.com','general','One message too many',(select id from t_ids where name='other'))$$, 'student over hourly limit');
do $$ declare m text; begin
  begin insert into public.messages(name,email,topic,body,user_id) values ('Other','other@x.com','general','Yet another one',(select id from t_ids where name='other'));
  exception when others then m := sqlerrm; end;
  assert m like 'rate_limited:%', 'limit error is recognisable: ' || coalesce(m,'(no error)');
end $$;
-- a student cannot dodge the limit by posting as a guest
select pg_temp.expect_fail($$insert into public.messages(name,email,topic,body) values ('Other','other2@x.com','general','posting as a guest')$$, 'student posts with no user_id');
-- and cannot set the abuse key themselves
select pg_temp.expect_fail($$insert into public.messages(name,email,topic,body,user_id,abuse_key) values ('Other','other@x.com','general','forging a key',(select id from t_ids where name='other'),'x')$$, 'student sets abuse_key');
reset role;

-- guests (service role, as the Edge Function): 3 an hour per email, 10 an hour per network address, 120 an hour overall
set local role service_role;
do $$ begin
  for i in 1..3 loop insert into public.messages(name,email,body,abuse_key) values ('G','guest@x.com','guest message ' || i, md5('9.9.9.9')); end loop;
end $$;
select pg_temp.expect_fail($$insert into public.messages(name,email,body,abuse_key) values ('G','GUEST@x.com','guest message 4 (other case)', md5('9.9.9.9'))$$, 'guest over per-email limit (case-insensitive)');
do $$ begin
  for i in 1..7 loop insert into public.messages(name,email,body,abuse_key) values ('G','g' || i || '@x.com','from one address ' || i, md5('9.9.9.9')); end loop;
end $$;
select pg_temp.expect_fail($$insert into public.messages(name,email,body,abuse_key) values ('G','fresh@x.com','11th from the same address', md5('9.9.9.9'))$$, 'guest over per-network limit');
insert into public.messages(name,email,body,abuse_key) values ('G','elsewhere@x.com','a different address is fine', md5('8.8.8.8'));
reset role;
-- the network address header (what PostgREST sets) is hashed into abuse_key for direct inserts
do $$ begin
  perform set_config('request.headers', '{"x-forwarded-for":"5.5.5.5, 10.0.0.1"}', true);
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', (select id::text from t_ids where name='paid'), true);
  insert into public.messages(name,email,topic,body,user_id) values ('Paid','paid@x.com','general','header test', (select id from t_ids where name='paid'));
  reset role;
  assert (select abuse_key from public.messages where body='header test')=md5('5.5.5.5'), 'abuse key comes from the first forwarded address';
  perform set_config('request.headers', '', true);
end $$;
-- admins are never limited
set local role authenticated;
select pg_temp.as_user((select id from t_ids where name='admin'));
do $$ begin for i in 1..12 loop insert into public.messages(name,email,topic,body,user_id) values ('Admin','admin@x.com','general','admin note ' || i, (select id from t_ids where name='admin')); end loop; end $$;
reset role;

-- bulk import: admin only, validates, skips duplicates, one audit line
set local role authenticated;
select pg_temp.as_user((select id from t_ids where name='free'));
select pg_temp.expect_fail($$select public.admin_import_questions('[{"subject":"eng","body":"S?","options":["a","b","c","d"],"answer":0}]')$$, 'student imports questions');
reset role;
set local role anon;
select pg_temp.expect_fail($$select public.admin_import_questions('[]')$$, 'anon imports questions');
reset role;
set local role authenticated;
select pg_temp.as_user((select id from t_ids where name='admin'));
do $$ declare r jsonb; before_ct int; begin
  select count(*) into before_ct from public.audit_log where action like 'question.%';
  r := public.admin_import_questions('[
    {"subject":"eng","body":"  Import test one?  ","options":[" a ","b","c","d"],"answer":2,"explanation":" because "},
    {"subject":"mat","body":"Import test two?","options":["1","2","3","4"],"answer":0},
    {"subject":"mat","body":"Import test two?","options":["1","2","3","4"],"answer":1},
    {"subject":"xyz","body":"bad subject","options":["a","b","c","d"],"answer":0},
    {"subject":"eng","body":"three options","options":["a","b","c"],"answer":0},
    {"subject":"eng","body":"answer out of range","options":["a","b","c","d"],"answer":4},
    {"subject":"eng","body":"empty option","options":["a","","c","d"],"answer":0},
    {"subject":"eng","body":"","options":["a","b","c","d"],"answer":0},
    {"subject":"eng","body":"numbers not strings","options":[1,2,3,4],"answer":0},
    "not an object"]');
  assert (r->>'inserted')::int=2, 'two imported: ' || r::text;
  assert (r->>'duplicates')::int=1, 'one duplicate skipped: ' || r::text;
  assert (r->>'invalid')::int=7, 'seven invalid skipped: ' || r::text;
  assert (select options from public.questions where body='Import test one?')='["a", "b", "c", "d"]'::jsonb, 'options are trimmed';
  assert (select answer from public.questions where subject='mat' and body='Import test two?')=0, 'first copy wins';
  assert (select explanation from public.questions where body='Import test one?')='because', 'explanation trimmed';
  -- re-importing the same file adds nothing
  r := public.admin_import_questions('[{"subject":"mat","body":"Import test two?","options":["1","2","3","4"],"answer":0}]');
  assert (r->>'inserted')::int=0 and (r->>'duplicates')::int=1, 're-import is harmless';
  assert (select count(*) from public.audit_log where action='question.import')=2, 'one log line per import';
  assert (select count(*) from public.audit_log where action like 'question.%')=before_ct+2, 'rows are not logged one by one';
end $$;
select pg_temp.expect_fail($$select public.admin_import_questions('[]')$$, 'empty import');
select pg_temp.expect_fail($$select public.admin_import_questions('{"a":1}')$$, 'import not an array');
reset role;

-- ===== PIN redemption (service role) =====
do $$
declare p text := current_setting('t.pin'); uid uuid;
begin
  insert into auth.users(email, raw_app_meta_data) values (lower(replace(p,'-',''))||'@pin.jambwise.ng','{"pin":"true"}') returning id into uid;
  set local role service_role;
  perform public.redeem_pin(p, uid);
  begin
    perform public.redeem_pin(p, uid);
    raise exception 'SECOND REDEEM SUCCEEDED';
  exception when others then
    if sqlerrm = 'SECOND REDEEM SUCCEEDED' then raise; end if;
  end;
  reset role;
  assert (select plan from public.profiles where id=uid)='student','pin plan';
  assert (select full_name from public.profiles where id=uid)='Ada','pin name';
  assert (select plan_expires from public.profiles where id=uid) between now()+interval '29 days' and now()+interval '31 days','pin expiry';
end $$;

-- ===== payment fulfilment idempotency =====
insert into public.payments(reference,user_id,plan,amount_kobo) values ('R2',(select id from t_ids where name='other'),'student',150000);
do $$
declare e1 timestamptz; e2 timestamptz;
begin
  set local role service_role;
  assert not public.fulfil_payment('R2', 100), 'wrong amount must not fulfil';
  assert public.fulfil_payment('R2', 150000), 'first fulfil';
  reset role;
  select plan_expires into e1 from public.profiles where email='other@x.com';
  set local role service_role;
  assert not public.fulfil_payment('R2', 150000), 'repeat webhook must not fulfil again';
  reset role;
  select plan_expires into e2 from public.profiles where email='other@x.com';
  assert e1 = e2, 'expiry unchanged by repeat';
  assert e1 between now()+interval '29 days' and now()+interval '31 days', '30 days granted';
end $$;

-- ===== parent access =====
reset role;
update public.profiles set full_name = 'Paid Student' where email = 'paid@x.com';
delete from public.attempts where user_id = (select id from t_ids where name='paid');
insert into public.attempts(user_id,subject,correct,total,kind) select id,'eng',15,20,'practice' from t_ids where name='paid';
insert into public.attempts(user_id,subject,correct,total,kind,mock_score) select id,'mat',16,20,'mock',280 from t_ids where name='paid';
insert into public.attempts(user_id,subject,correct,total,kind,mock_score) select id,'eng',15,20,'hall',310 from t_ids where name='paid';
insert into public.attempts(user_id,subject,correct,total,kind) select id,'phy',12,20,'hall' from t_ids where name='paid';
set local role authenticated;
select pg_temp.as_user((select id from t_ids where name='admin'));
select pg_temp.expect_fail($$select * from public.parent_code_create()$$, 'a staff member makes a parent code');
select pg_temp.as_user((select id from t_ids where name='paid'));
do $$ declare c text; begin
  select code into c from public.parent_code_create();
  assert c ~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$', 'parent code format: ' || c;
  assert (select code from public.parent_codes where user_id = auth.uid()) = c, 'student reads own code';
  assert (public.my_parent_access()->>'code') = c, 'my_parent_access shows the code';
end $$;
select pg_temp.expect_fail($$select * from public.parent_log$$, 'student reads the parent log table');
select pg_temp.expect_fail($$select * from public.parent_sessions$$, 'student reads parent sessions');
select pg_temp.expect_fail($$select public.parent_login('x','x','x','Mother','d',null)$$, 'student calls parent_login');
select pg_temp.expect_fail($$select public.parent_report('x')$$, 'student calls parent_report');
select pg_temp.as_user((select id from t_ids where name='free'));
do $$ begin assert (select count(*) from public.parent_codes) = 0, 'another student cannot read the code'; end $$;
reset role;
set local role anon;
select pg_temp.expect_fail($$select public.parent_login('x','x','x','Mother','d',null)$$, 'anon calls parent_login');
reset role;

-- the server side (service role) is what a parent really talks to
set local role service_role;
do $$ declare reg text; code text; r jsonb; tok text; rep jsonb; begin
  select reg_number into reg from public.profiles where email = 'paid@x.com';
  select c.code into code from public.parent_codes c join public.profiles p on p.id = c.user_id where p.email = 'paid@x.com';
  r := public.parent_login(lower(reg), lower(code), 'Mrs Okoro', 'Mother', 'Chrome on Android', 'iphash1');
  assert (r->>'ok')::boolean and length(r->>'token') = 64, 'parent signs in (ID and code are not case sensitive)';
  tok := r->>'token';
  rep := public.parent_report(tok);
  assert rep->'student'->>'name' = 'Paid Student' and rep->>'parent' = 'Mrs Okoro', 'report names the student and the parent';
  assert jsonb_array_length(rep->'subjects') >= 1, 'report has subject scores';
  assert rep->'hall'->>'released' = 'false' and rep->'hall'->'total' is null, 'ExamHall score hidden from the parent until released';
  assert rep ? 'days' and rep ? 'recent' and rep ? 'mocks', 'report has days, recent sessions and mocks';
  assert not (rep->'student' ? 'email'), 'the report never includes the email';
  assert public.parent_report('nonsense') is null, 'a made-up token gets nothing';
  perform public.parent_end(tok);
  assert public.parent_report(tok) is null, 'logging out ends the session';
end $$;
reset role;
-- the admin's bell rings for a parent sign-in, once for the same parent and student within 30 minutes
select pg_temp.as_user((select id from t_ids where name='admin'));
set local role authenticated;
do $$ begin
  assert (select count(*) from public.my_notifications() where kind = 'parent' and link = '/app/admin/parents') = 1, 'admin told when a parent signs in';
  assert (select body from public.my_notifications() where kind = 'parent' limit 1) like 'Mrs Okoro (Mother) viewed Paid Student%', 'the notification names the parent and the student';
end $$;
reset role;
select pg_temp.as_user((select id from t_ids where name='admin'));
set local role authenticated;
select public.admin_set_results_released('hall', true);
reset role;
set local role service_role;
do $$ declare reg text; code text; r jsonb; begin
  select reg_number into reg from public.profiles where email = 'paid@x.com';
  select c.code into code from public.parent_codes c join public.profiles p on p.id = c.user_id where p.email = 'paid@x.com';
  r := public.parent_login(reg, code, 'Mr Okoro', 'Father', 'Firefox on Windows', 'iphash2');
  assert (public.parent_report(r->>'token')->'hall'->>'total')::int = 310, 'released ExamHall score shows to the parent';
end $$;
reset role;
select pg_temp.as_user((select id from t_ids where name='admin'));
set local role authenticated;
select public.admin_set_results_released('hall', false);
reset role;

-- wrong codes: five tries per ID, then locked even for the right code; an unknown ID behaves the same way
set local role service_role;
do $$ declare reg text; code text; r jsonb; i int; begin
  select reg_number into reg from public.profiles where email = 'other@x.com';
  perform public.parent_login(reg, 'AAAA-AAAA', 'Guess', 'Other', 'bot', 'iphash3');   -- no code exists: 'off'
  select reg_number into reg from public.profiles where email = 'paid@x.com';
  select c.code into code from public.parent_codes c join public.profiles p on p.id = c.user_id where p.email = 'paid@x.com';
  for i in 1..5 loop
    r := public.parent_login(reg, 'AAAA-AAA' || i, 'Guess', 'Other', 'bot', 'iphash3');
    assert r->>'reason' = 'mismatch', 'wrong code is a plain mismatch';
  end loop;
  r := public.parent_login(reg, code, 'Mrs Okoro', 'Mother', 'Chrome', 'iphash1');
  assert r->>'reason' = 'locked' and r->'token' is null, 'locked after five wrong tries, even with the right code';
  for i in 1..5 loop perform public.parent_login('JW-2099-000000', 'AAAA-AAA' || i, 'Guess', 'Other', 'bot', 'iphash4'); end loop;
  assert (public.parent_login('JW-2099-000000', 'AAAA-AAAA', 'Guess', 'Other', 'bot', 'iphash4')->>'reason') = 'locked', 'an ID that does not exist locks the same way (nothing revealed)';
  for i in 1..21 loop perform public.parent_login('JW-2098-' || lpad(i::text, 6, '0'), 'AAAA-AAAA', 'Guess', 'Other', 'bot', 'iphash5'); end loop;
  assert (public.parent_login('JW-2097-000001', 'AAAA-AAAA', 'Guess', 'Other', 'bot', 'iphash5')->>'reason') = 'locked', 'one device is limited across many IDs';
  assert (public.parent_login(reg, code, '', 'Mother', 'x', null)->>'reason') = 'name', 'a name is required';
end $$;
reset role;

-- the log, the student's view, expiry and revoking
update public.parent_log set created_at = now() - interval '1 hour' where outcome <> 'ok';   -- let the lock window pass
select pg_temp.as_user((select id from t_ids where name='paid'));
set local role authenticated;
do $$ begin
  assert (select count(*) from jsonb_array_elements(public.my_parent_access()->'views')) = 2, 'student sees who looked (two parents)';
  assert (select count(*) from public.my_notifications() where kind = 'parent') = 2, 'student is notified each time a parent signs in';
  assert not exists (select 1 from jsonb_array_elements(public.my_parent_access()->'views') v where v->>'parent_name' = 'Guess'), 'failed tries are not shown as views';
end $$;
select pg_temp.as_user((select id from t_ids where name='admin'));
do $$ begin
  assert (select count(*) from public.admin_parent_log() where outcome = 'ok') = 2, 'admin sees the successful logins';
  assert exists (select 1 from public.admin_parent_log() where outcome = 'locked'), 'admin sees locked attempts';
  assert exists (select 1 from public.admin_parent_log() where student_name = 'Paid Student' and parent_name = 'Mrs Okoro' and relationship = 'Mother' and device = 'Chrome on Android'), 'admin sees parent, relationship and device';
end $$;
select pg_temp.as_user((select id from t_ids where name='paid'));
select pg_temp.expect_fail($$select * from public.admin_parent_log()$$, 'student reads the admin parent log');
select pg_temp.expect_fail($$select public.admin_parent_revoke(auth.uid())$$, 'student calls admin revoke');
reset role;
update public.parent_codes set expires_at = now() - interval '1 minute' where user_id = (select id from t_ids where name='paid');
set local role service_role;
do $$ declare reg text; code text; begin
  select reg_number into reg from public.profiles where email = 'paid@x.com';
  select c.code into code from public.parent_codes c join public.profiles p on p.id = c.user_id where p.email = 'paid@x.com';
  assert (public.parent_login(reg, code, 'Late', 'Other', 'x', 'iphash6')->>'ok')::boolean is not true, 'an expired code does not work';
  assert exists (select 1 from public.parent_log where parent_name = 'Late' and outcome = 'expired'), 'expiry is logged';
end $$;
reset role;
select pg_temp.as_user((select id from t_ids where name='paid'));
set local role authenticated;
do $$ begin assert (public.my_parent_access()->>'code') is null and (public.my_parent_access()->>'expired')::boolean, 'expired code is shown as expired'; end $$;
do $$ declare c text; begin select code into c from public.parent_code_create(); assert c is not null, 'student renews the code'; end $$;
reset role;
set local role service_role;
do $$ declare reg text; code text; r jsonb; begin
  select reg_number into reg from public.profiles where email = 'paid@x.com';
  select c.code into code from public.parent_codes c join public.profiles p on p.id = c.user_id where p.email = 'paid@x.com';
  r := public.parent_login(reg, code, 'Mrs Okoro', 'Mother', 'Chrome', 'iphash7');
  assert (r->>'ok')::boolean, 'new code works';
  create temp table if not exists t_ptok(tok text); delete from t_ptok; insert into t_ptok values (r->>'token');
end $$;
grant select on t_ptok to authenticated;
reset role;
select pg_temp.as_user((select id from t_ids where name='paid'));
set local role authenticated;
select public.parent_code_revoke();
reset role;
set local role service_role;
do $$ declare reg text; begin
  assert public.parent_report((select tok from t_ptok)) is null, 'revoking signs the parent out';
  select reg_number into reg from public.profiles where email = 'paid@x.com';
  assert (public.parent_login(reg, 'AAAA-AAAA', 'Mrs Okoro', 'Mother', 'Chrome', 'iphash8')->>'ok')::boolean is not true, 'no code, no access';
end $$;
reset role;
select pg_temp.as_user((select id from t_ids where name='paid'));
set local role authenticated;
do $$ declare c text; begin select code into c from public.parent_code_create(); end $$;
select pg_temp.as_user((select id from t_ids where name='admin'));
select public.admin_parent_revoke((select id from t_ids where name='paid'));
do $$ begin
  assert not exists (select 1 from public.parent_codes), 'admin revoke removes the code';
  assert exists (select 1 from public.audit_log where action = 'parent.revoke'), 'admin revoke is logged';
end $$;
reset role;
-- deleting a student removes their codes and sessions but keeps the log rows (as history without a name)
select pg_temp.as_user((select id from t_ids where name='free'));
set local role authenticated;
do $$ declare c text; begin select code into c from public.parent_code_create(); end $$;
reset role;
do $$ begin
  assert (select count(*) from public.parent_codes) = 1, 'one code before delete';
end $$;

-- ===== anon =====
set local role anon;
do $$ begin assert (select count(*) from public.plans)=3,'anon reads plans'; end $$;
select pg_temp.expect_fail($$select * from public.profiles$$, 'anon reads profiles');
select pg_temp.expect_fail($$select * from public.questions$$, 'anon reads questions');
reset role;

-- ===== account deletion keeps payments, clears PIN references =====
delete from auth.users where email='other@x.com';
do $$ begin assert (select count(*) from public.payments where reference='R2')=1,'payment kept'; end $$;
delete from auth.users where email like '%@pin.jambwise.ng';
do $$ begin assert (select count(*) from public.access_pins where used_by is not null)=0,'pin ref cleared'; end $$;

rollback;
\echo ALL SECURITY TESTS PASSED
