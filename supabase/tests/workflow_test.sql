-- Exercises the workflow functions end to end: roles, locking, confidentiality,
-- routing, corrections, outgoing lifecycle, alerts, search, reports.
-- Run against a database that has the migrations applied (see README.md).
-- Everything runs in one transaction that is rolled back at the end.
\set ON_ERROR_STOP on
\pset tuples_only on
begin;

create schema t;
grant usage on schema t to public;
create table t.ids (k text primary key, v uuid);
grant all on t.ids to public;

create function t.as_user(p_key text) returns void language plpgsql as $$
declare u uuid;
begin
  select v into u from t.ids where k = p_key;
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;
create function t.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  set local role service_role;
end $$;
create function t.as_super() returns void language plpgsql as $$ begin reset role; end $$;
create function t.id(p_key text) returns uuid language sql stable as $$ select v from t.ids where k = p_key $$;
create function t.ok(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FAIL: %', p_label; end if;
  raise notice 'PASS  %', p_label;
end $$;
-- run a statement that must fail with a message containing p_like
create function t.fails(p_sql text, p_like text, p_label text) returns void language plpgsql as $$
declare v_msg text := null;
begin
  begin execute p_sql; exception when others then v_msg := sqlerrm; end;
  if v_msg is null then raise exception 'FAIL: % (statement succeeded)', p_label; end if;
  if v_msg not ilike '%' || p_like || '%' then raise exception 'FAIL: % (got: %)', p_label, v_msg; end if;
  raise notice 'PASS  %  [%]', p_label, left(v_msg, 70);
end $$;
create function t.file(p_doc uuid, p_file uuid, p_ver int, p_text text default null) returns jsonb language sql as $$
  select jsonb_build_object('storage_path', p_doc || '/' || p_file || '/v' || p_ver || '.pdf', 'mime_type', 'application/pdf',
         'size_bytes', 1000, 'sha256', repeat('ab', 32), 'original_filename', 'scan.pdf', 'ocr_text', p_text)
$$;
grant execute on all functions in schema t to public;

-- users ------------------------------------------------------------------------
do $$
declare k text; u uuid;
begin
  foreach k in array array['admin1','admin2','registry','action1','action2','exec','auditor'] loop
    u := gen_random_uuid();
    insert into t.ids values (k, u);
    insert into auth.users (id, email, aud, role, encrypted_password) values (u, k || '@t.test', 'authenticated', 'authenticated', 'pw-' || k);
  end loop;
  insert into public.profiles (id, full_name, email, role, office_id, must_change_password) values
    (t.id('admin1'), 'Admin One', 'admin1@t.test', 'system_administrator', 1, false),
    (t.id('admin2'), 'Admin Two', 'admin2@t.test', 'system_administrator', 2, false);
end $$;

select t.as_user('admin1');
select public.admin_create_profile(t.id('registry'), 'Registry Officer', 'registry_officer', 1::smallint, null, 'Registry', null);
select public.admin_create_profile(t.id('action1'), 'Action One', 'action_officer', 1::smallint, null, 'Officer', null);
select public.admin_create_profile(t.id('action2'), 'Action Two', 'action_officer', 2::smallint, null, 'Officer', null);
select public.admin_create_profile(t.id('exec'), 'Chairperson', 'executive_viewer', 1::smallint, null, 'Chairperson', null);
select public.admin_create_profile(t.id('auditor'), 'Auditor', 'auditor', null, null, 'Auditor', null);
select t.as_super();
update public.profiles set must_change_password = false;
select t.fails($f$ select public.admin_create_profile(gen_random_uuid(), 'X', 'system_administrator', null, null, null, null) $f$,
               'does not exist', 'profile needs an auth login first');
do $$ begin
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a3', 'a3@t.test');
  perform t.as_user('admin1');
  begin
    perform public.admin_create_profile('00000000-0000-0000-0000-0000000000a3', 'A3', 'system_administrator', null, null, null, null);
    raise exception 'FAIL: third administrator was allowed';
  exception when others then
    if sqlerrm not like '%Only two System Administrators%' then raise; end if;
    raise notice 'PASS  third administrator rejected';
  end;
  perform t.as_super();
end $$;

-- 1. incoming, confidential, routed to action1 ----------------------------------
select t.as_user('registry');
do $$
declare r jsonb; d uuid := gen_random_uuid(); f uuid := gen_random_uuid(); s jsonb;
begin
  r := public.register_incoming(jsonb_build_object(
    'document_id', d, 'file_id', f, 'office_id', 1, 'subject', 'Budget allocation for voter registration',
    'document_type_id', 1, 'category_id', 2, 'priority', 'high', 'classification', 'confidential',
    'number_of_pages', 3, 'number_of_attachments', 1, 'physical_file_location', 'Cabinet 2 / Shelf 3 / File 14',
    'sender_organisation_text', 'Ministry of Finance', 'sender_name', 'John Deng', 'sender_title', 'Director',
    'delivered_by_name', 'Mary Ayen', 'delivered_by_phone', '0912345678', 'delivered_by_id_seen', true,
    'delivery_method', 'hand_delivery', 'response_required', true, 'response_due_date', (current_date + 7)::text,
    'routed_to', t.id('action1'), 'cc', jsonb_build_array(t.id('action2')),
    'file', t.file(d, f, 1, 'The budget allocation for voter registration is attached.')));
  insert into t.ids values ('conf', d), ('conf_file', f);
  perform t.ok(r ->> 'reference_number' ~ '^NEC/CH/IN/20[0-9]{2}/00001$', 'reference number generated: ' || (r ->> 'reference_number'));
  s := public.get_receipt_slip(d);
  perform t.ok(s ->> 'reference_number' = r ->> 'reference_number' and s ->> 'subject' is null,
               'acknowledgement slip available to the registry officer without the subject');
end $$;
select t.ok((select count(*) from public.documents where id = t.id('conf')) = 0, 'registry officer cannot open the Confidential document');

select t.as_user('action1');
select t.ok((select count(*) from public.documents where id = t.id('conf')) = 1, 'routed action officer can see it');
select t.as_user('action2');
select t.ok((select count(*) from public.documents where id = t.id('conf')) = 1, 'copied action officer can see it');
select t.as_super();
-- a third officer who has nothing to do with it
do $$ declare u uuid := gen_random_uuid(); begin
  insert into t.ids values ('action3', u);
  insert into auth.users (id, email) values (u, 'action3@t.test');
  insert into public.profiles (id, full_name, email, role, must_change_password) values (u, 'Action Three', 'action3@t.test', 'action_officer', false);
end $$;
select t.as_user('action3');
select t.ok((select count(*) from public.documents) = 0, 'unrelated action officer sees nothing');
select t.ok((select count(*) from public.search_documents('budget')) = 0, 'unrelated officer cannot find it by text');
select t.as_user('auditor');
select t.ok((select count(*) from public.documents where id = t.id('conf')) = 0, 'auditor cannot see Confidential');
select t.as_user('exec');
select t.ok((select count(*) from public.documents where id = t.id('conf')) = 1, 'executive viewer can see it');
select t.ok((select count(*) from public.search_documents('voter registration') where snippet is not null) = 1, 'full-text search finds words inside the scan');

-- 2. acknowledgement, minutes, action, closing -------------------------------------
select t.as_user('action1');
select public.acknowledge_receipt(t.id('conf'));
select t.ok((select status from public.documents where id = t.id('conf')) = 'with_action_officer', 'acknowledging moves it to With action officer');
select t.fails($f$ select public.acknowledge_receipt(t.id('conf')) $f$, 'Nothing to acknowledge', 'cannot acknowledge twice');
select t.fails($f$ select public.add_minute(t.id('conf'), 'x') $f$, 'not allowed', 'action officer cannot add a minute');
select t.as_user('exec');
select public.add_minute(t.id('conf'), 'Please prepare a reply for my signature.', t.id('action1'));
select t.as_user('action1');
select t.ok((select count(*) from public.notifications where user_id = t.id('action1') and title like 'Instruction%') = 1, 'minute notifies the holder');
select public.record_action(t.id('conf'), 'action_taken', 'Reply drafted.');
select t.ok((select status from public.documents where id = t.id('conf')) = 'action_taken', 'recording action sets Action taken');
select t.fails($f$ select public.close_document(t.id('conf'), '   ') $f$, 'closing note is required', 'closing needs a note');
select public.close_document(t.id('conf'), 'Replied by letter');
select t.ok((select status from public.documents where id = t.id('conf')) = 'closed', 'closed with a note');
select t.fails($f$ select public.record_action(t.id('conf'), 'comment', 'late') $f$, 'closed', 'closed item takes no more actions');

-- 3. no direct writes, no deletes ---------------------------------------------------
select t.as_user('registry');
select t.fails($f$ update public.documents set subject = 'hack' $f$, 'permission denied', 'registry officer cannot UPDATE directly');
select t.fails($f$ insert into public.documents (direction, office_id, subject, document_type_id, category_id, priority, classification, status, registered_by, number_of_pages, physical_file_location)
                   values ('incoming', 1, 's', 1, 1, 'low', 'open', 'registered', t.id('registry'), 1, 'x') $f$,
               'row-level security', 'registry officer cannot INSERT directly');
select t.as_user('admin1');
select t.fails($f$ delete from public.documents $f$, 'permission denied', 'administrator cannot DELETE documents');
select t.fails($f$ delete from public.audit_log $f$, 'permission denied', 'administrator cannot DELETE audit entries');
select t.fails($f$ select public._require(array['system_administrator']::public.user_role[]) $f$, 'permission denied', 'internal helpers are not callable');
select t.fails($f$ select public.write_audit('login', null, null, null, '{}') $f$, 'permission denied', 'audit writer is not callable');
select t.as_super();
select t.fails($f$ delete from public.documents $f$, 'cannot be deleted', 'even the database owner cannot delete a document');

-- 4. open incoming: routing, forwarding, returning, due dates ---------------------------
select t.as_user('registry');
do $$
declare r jsonb; d uuid := gen_random_uuid(); f uuid := gen_random_uuid();
begin
  r := public.register_incoming(jsonb_build_object(
    'document_id', d, 'file_id', f, 'office_id', 1, 'subject', 'Invitation to donor roundtable',
    'document_type_id', 3, 'category_id', 4, 'priority', 'urgent', 'classification', 'open',
    'number_of_pages', 2, 'physical_file_location', 'Cabinet 1', 'sender_organisation_text', 'UNDP',
    'sender_name', 'Ann Lado', 'sender_title', 'Officer', 'delivered_by_name', 'Courier', 'delivered_by_id_seen', false,
    'delivery_method', 'courier', 'response_required', false, 'routed_to', t.id('action1'),
    'file', t.file(d, f, 1, 'Donor roundtable invitation')));
  insert into t.ids values ('open', d);
  perform t.ok((r ->> 'due_at')::timestamptz - (r ->> 'received_at')::timestamptz = interval '24 hours', 'urgent priority gives a 24 hour due date');
end $$;
select t.fails($f$ select public.register_incoming('{"office_id":1}'::jsonb) $f$, 'scanned file', 'incoming cannot be saved without a scan');
select t.ok((select count(*) from public.documents) = 1, 'registry officer sees the open document only');
select t.as_user('action1');
select public.acknowledge_receipt(t.id('open'));
select public.forward_document(t.id('open'), t.id('action2'), 'Falls under the Secretary General''s office');
select t.ok((select current_holder_id from public.documents where id = t.id('open')) = t.id('action2'), 'forwarding changes the holder');
select t.fails($f$ select public.forward_document(t.id('open'), t.id('action1'), 'back') $f$, 'holding', 'only the holder can forward');
select t.as_user('action2');
select public.return_document(t.id('open'), 'Which office should respond?');
select t.ok((select status from public.documents where id = t.id('open')) = 'returned_for_clarification'
        and (select current_holder_id from public.documents where id = t.id('open')) = t.id('action1'), 'returning sends it back with status Returned for clarification');
select t.as_user('registry');
select t.fails($f$ select public.route_document(t.id('open'), t.id('action2'), '') $f$, 'reason', 'routing needs a reason');
select public.route_document(t.id('open'), t.id('action2'), 'Confirmed: SG office', array[t.id('exec')]);
select t.ok((select status from public.documents where id = t.id('open')) = 'routed', 're-routing after return sets Routed');
select t.fails($f$ select public.close_document(t.id('open'), 'done') $f$, 'Record the action taken', 'cannot close an item nobody has acted on');
select t.fails($f$ update public.documents set due_at = now() $f$, 'permission denied', 'due date cannot be edited directly');
select public.change_due_date(t.id('open'), now() + interval '10 days', 'Donor extended the date');
select t.ok((select count(*) from public.due_date_changes where document_id = t.id('open')) = 1, 'due date change recorded with its reason');
select t.fails($f$ select public.change_due_date(t.id('open'), now(), ' ') $f$, 'reason', 'due date change needs a reason');
select t.as_user('action2');
select t.fails($f$ select public.change_due_date(t.id('open'), now(), 'x') $f$, 'not allowed', 'action officer cannot change due dates');
select public.acknowledge_receipt(t.id('open'));
select public.set_hold(t.id('open'), true, 'Waiting for donor details');
select t.ok((select status from public.documents where id = t.id('open')) = 'on_hold', 'put on hold');
select public.set_hold(t.id('open'), false, 'Details received');
select t.ok((select status from public.documents where id = t.id('open')) = 'with_action_officer', 'resumed');

-- 5. corrections -----------------------------------------------------------------------
select t.as_user('registry');
select t.fails($f$ select public.request_correction(t.id('open'), 'documents', 'reference_number', '{"value":"X"}', 'typo') $f$, 'cannot be corrected', 'reference number cannot be corrected');
do $$ declare c uuid; begin
  c := public.request_correction(t.id('open'), 'documents', 'subject', '{"value":"Invitation to the donor roundtable"}', 'Missing article');
  insert into t.ids values ('corr', c);
end $$;
select t.as_user('admin1');
select public.decide_correction(t.id('corr'), true, 'ok');
select t.ok((select subject from public.documents where id = t.id('open')) = 'Invitation to the donor roundtable', 'approved correction applied');
select t.fails($f$ select public.decide_correction(t.id('corr'), true, 'again') $f$, 'already been decided', 'a decided request cannot be decided again');
select t.ok((select old_value #>> '{}' from public.correction_requests where id = t.id('corr')) = 'Invitation to donor roundtable'
        and (select new_value #>> '{}' from public.correction_requests where id = t.id('corr')) = 'Invitation to the donor roundtable', 'old and new values kept');
select t.ok((select count(*) from public.audit_log where event_type = 'document_updated'
              and details ->> 'correction_request_id' = t.id('corr')::text) = 1, 'audit entry names the correction request');
select t.as_user('registry');
do $$ declare c uuid; begin
  c := public.request_correction(t.id('open'), 'documents', 'subject', '{"value":"Another subject"}', 'Test');
  insert into t.ids values ('corr2', c);
end $$;
select t.as_user('admin2');
select public.decide_correction(t.id('corr2'), false, 'Not needed');
select t.ok((select subject from public.documents where id = t.id('open')) = 'Invitation to the donor roundtable', 'rejected correction changes nothing');
select t.as_super();
select t.fails($f$ update public.documents set subject = 'sneaky' where id = t.id('open') $f$, 'locked', 'saved record is locked even for the database owner');
select t.as_user('admin1');
do $$ declare c uuid; begin
  c := public.request_correction(t.id('open'), 'documents', 'priority', '{"value":"low"}', 'Wrong priority');
  insert into t.ids values ('corr3', c);
end $$;
select t.fails($f$ select public.decide_correction(t.id('corr3'), true, 'self') $f$, 'cannot decide your own', 'administrator cannot approve their own request');

-- 6. outgoing lifecycle ------------------------------------------------------------------
select t.as_user('registry');
do $$
declare r jsonb; d uuid := gen_random_uuid(); f uuid := gen_random_uuid(); sf uuid := gen_random_uuid();
begin
  r := public.register_outgoing(jsonb_build_object(
    'document_id', d, 'office_id', 2, 'subject', 'Reply to donor roundtable', 'document_type_id', 1, 'category_id', 4,
    'priority', 'normal', 'classification', 'open', 'signatory', 'secretary_general',
    'feedback_required', true, 'feedback_due_date', (current_date - 1)::text, 'feedback_officer_id', t.id('action2'),
    'in_reply_to', t.id('open'),
    'recipients', jsonb_build_array(jsonb_build_object('recipient_type', 'to', 'organisation_text', 'UNDP', 'recipient_name', 'Ann Lado'))));
  insert into t.ids values ('out', d), ('out_signed', sf);
  perform t.ok(r ->> 'reference_number' ~ '^NEC/SG/OUT/20[0-9]{2}/00001$', 'outgoing reference issued at registration: ' || (r ->> 'reference_number'));
end $$;
select t.ok((select status from public.documents where id = t.id('out')) = 'draft', 'outgoing starts as Draft');
select public.update_outgoing_draft(t.id('out'), '{"subject":"Reply to the donor roundtable invitation"}');
select t.ok((select subject from public.documents where id = t.id('out')) like '%invitation', 'draft is editable');
select t.fails($f$ select public.finalise_outgoing(t.id('out'), null, null) $f$, 'signed copy', 'cannot be Final without the signed scan');
select t.fails($f$ select public.dispatch_outgoing(t.id('out'), 'courier', 'Peter') $f$, 'Final', 'cannot dispatch a draft');
select public.finalise_outgoing(t.id('out'), t.id('out_signed'), t.file(t.id('out'), t.id('out_signed'), 1, 'Signed reply'));
select t.ok((select status from public.documents where id = t.id('out')) = 'final'
        and (select finalised_at from public.outgoing_details where document_id = t.id('out')) is not null, 'Final locks the record');
select t.fails($f$ select public.update_outgoing_draft(t.id('out'), '{"subject":"x"}') $f$, 'draft', 'Final record cannot be edited');
select t.fails($f$ select public.dispatch_outgoing(t.id('out'), 'fax', 'Peter') $f$, 'fax', 'outgoing cannot go by fax');
select public.dispatch_outgoing(t.id('out'), 'courier', 'Peter Madut');
select t.fails($f$ select public.confirm_delivery(t.id('out'), now(), null, null, null) $f$, 'proof', 'delivery needs proof');
select public.confirm_delivery(t.id('out'), now(), 'DHL tracking 123456', null, null);
select t.ok((select status from public.documents where id = t.id('out')) = 'awaiting_feedback', 'delivered with feedback required becomes Awaiting feedback');
select t.ok((select count(*) from public.v_feedback_overdue) = 1, 'feedback tracker shows it overdue');
select t.as_super();

-- 7. alerts ------------------------------------------------------------------------------
select t.as_service();
select t.ok((public.run_alerts() ->> 'feedback_overdue')::int >= 2, 'feedback overdue alerts raised');
select t.ok((select count(*) from public.notifications where notification_type = 'due_in_24_hours') >= 0, 'due-in-24-hours runs');
select t.ok((select count(*) from public.notifications where notification_type = 'daily_overdue_summary' and user_id = t.id('admin1')) = 1, 'daily summary for administrator');
select t.ok((public.run_alerts() ->> 'feedback_overdue')::int = 0 and (public.run_alerts() ->> 'daily_summaries')::int = 0, 'alerts are not repeated');
select t.as_user('action2');
select t.ok((select count(*) from public.notifications where user_id = t.id('action2') and notification_type = 'feedback_overdue') = 1, 'follow-up officer was alerted');
select t.fails($f$ select public.run_alerts() $f$, 'permission denied', 'users cannot run the alert job');

-- 8. feedback, closing outgoing ----------------------------------------------------------------
select t.as_user('registry');
do $$
declare r jsonb; d uuid := gen_random_uuid(); f uuid := gen_random_uuid();
begin
  r := public.register_incoming(jsonb_build_object(
    'document_id', d, 'file_id', f, 'office_id', 2, 'subject', 'Donor reply', 'document_type_id', 1, 'category_id', 4,
    'priority', 'normal', 'classification', 'open', 'number_of_pages', 1, 'physical_file_location', 'Cabinet 4',
    'sender_organisation_text', 'UNDP', 'sender_name', 'Ann Lado', 'sender_title', 'Officer', 'delivered_by_name', 'Post',
    'delivered_by_id_seen', false, 'delivery_method', 'post', 'response_required', false, 'routed_to', t.id('action2'),
    'file', t.file(d, f, 1)));
  insert into t.ids values ('reply', d);
end $$;
select public.link_feedback(t.id('out'), t.id('reply'));
select t.ok((select feedback_received_at from public.outgoing_details where document_id = t.id('out')) is not null, 'feedback linked to the outgoing item');
select t.ok((select count(*) from public.v_feedback_overdue) = 0, 'feedback no longer overdue once received');
select t.fails($f$ select public.close_document(t.id('out'), '') $f$, 'closing note', 'outgoing needs a closing note');
select public.close_document(t.id('out'), 'Feedback received as ' || (select reference_number from public.documents where id = t.id('reply')));
select t.ok((select status from public.documents where id = t.id('out')) = 'closed', 'outgoing closed');
select t.ok((select count(*) from public.v_document_history where document_id = t.id('out')) >= 3, 'history view lists the steps');

-- 9. void instead of delete ------------------------------------------------------------------------
select public.void_document(t.id('reply'), 'Registered in error');
select t.fails($f$ select public.void_document(t.id('reply'), 'again') $f$, 'voided', 'a voided record cannot be changed');
select t.ok((select is_voided from public.documents where id = t.id('reply')), 'voided record stays in the database');
select t.ok((select count(*) from public.search_documents('Donor reply', p_voided => true) where id = t.id('reply')) = 1
        and (select count(*) from public.search_documents('Donor reply') where id = t.id('reply')) = 0, 'voided records are hidden from search unless asked for');

-- 10. reports, dashboard, search ------------------------------------------------------------------------------
select t.as_user('exec');
select t.ok(jsonb_array_length((public.dashboard_summary() -> 'received')) = 2, 'dashboard summary returns both offices');
select t.ok((select count(*) from public.v_incoming_register) >= 2 and (select count(*) from public.v_outgoing_register) = 1, 'register views return rows');
select t.ok((select count(*) from public.report_monthly_summary(date_trunc('month', current_date)::date, current_date)) > 5, 'monthly summary report returns rows');
select t.ok((select count(*) from public.search_documents('UNDP', p_direction => 'outgoing')) = 1, 'search by recipient organisation');
select t.ok((select count(*) from public.search_documents(null, p_holder => t.id('action2'))) >= 1, 'search by officer');
select t.ok((select count(*) from public.search_documents(null, p_priority => 'urgent')) = 1, 'search by priority');
select t.ok((select count(*) from public.v_correspondence where organisation = 'UNDP') >= 3, 'correspondence by organisation');

-- 11. audit trail and accounts ---------------------------------------------------------------------------------
select t.as_user('auditor');
select t.ok((select count(*) from public.audit_log) > 50, 'auditor can read the audit trail');
select t.as_user('admin1');
select public.admin_suspend_user(t.id('action3'), 'Left the commission');
select public.admin_unlock_user(t.id('action3'));
select public.admin_reactivate_user(t.id('action3'));
select t.ok((select count(*) from public.audit_log where event_type in ('user_suspended', 'user_reactivated')) = 2, 'administrator actions are audited');
select t.fails($f$ select public.admin_suspend_user(t.id('admin1'), 'me') $f$, 'own account', 'administrator cannot suspend themself');
select t.as_super();
select t.ok((select count(*) from public.audit_log a join public.audit_log b on b.id = (select max(id) from public.audit_log where id < a.id)
              where a.prev_hash is distinct from b.row_hash) = 0, 'audit hash chain is intact');
select t.fails($f$ update public.audit_log set details = '{}' $f$, 'permanent', 'audit entries cannot be edited');
-- password change must really change the password
select t.as_super();
update public.profiles set must_change_password = true where id = t.id('action3');
select t.as_user('action3');
select t.fails($f$ select public.complete_password_change() $f$, 'not been changed', 'forced password change cannot be skipped');
select t.as_super();
update auth.users set encrypted_password = 'new-secret-hash' where id = t.id('action3');
select t.as_user('action3');
select public.complete_password_change();
select t.ok(not (select must_change_password from public.profiles where id = t.id('action3')), 'password change completes once the password differs');

select t.as_super();
rollback;
\echo ALL WORKFLOW TESTS PASSED
