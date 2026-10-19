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
do $$ begin assert public.my_mock_status() is null, 'no mock yet: status is empty'; end $$;
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
  assert (select count(*) from public.attempts where kind='mock')=0, 'student cannot read mock scores';
  assert public.my_mock_status() is not null, 'student can learn that the mock was submitted';
end $$;
insert into public.attempts(user_id,subject,correct,total,kind) values (auth.uid(),'eng',1,5,'practice');
delete from public.attempts where user_id=auth.uid() and kind='practice';
do $$ begin assert (select count(*) from public.attempts where user_id=auth.uid() and kind='practice')=0, 'student can clear practice history'; end $$;
reset role;
do $$ begin assert (select count(*) from public.attempts where kind='mock' and mock_score is not null and user_id=(select id from t_ids where name='paid'))=1, 'a submitted mock survives the student deleting'; end $$;

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
select public.admin_allow_retake((select id from t_ids where name='paid'));
do $$ begin assert (select count(*) from public.attempts where user_id=(select id from t_ids where name='paid') and kind='mock')=0, 'retake clears the mock'; end $$;
select public.admin_reset_progress((select id from t_ids where name='paid'));
select pg_temp.expect_fail($$select public.admin_make_pins('pro',30,500)$$, 'bulk pin over limit');
do $$ begin
  assert (select count(*) from public.audit_log)>=6, 'audit log written';
  assert exists (select 1 from public.audit_log where action='plan.price'), 'price change logged';
  assert exists (select 1 from public.audit_log where action='question.add'), 'question add logged';
  assert exists (select 1 from public.audit_log where action='mock.retake'), 'retake logged';
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
