-- =============================================================================
-- Workflow functions, report views, search and dashboard
-- =============================================================================
-- At database level only System Administrators may INSERT and nobody may UPDATE
-- (see 20261004000000_initial_schema.sql). Registry Officers, Action Officers and
-- Executive Viewers do their work through the SECURITY DEFINER functions below.
-- Every function checks the caller's role and session (_require), writes through
-- the existing tables so that the locking, status and audit triggers still apply,
-- and never deletes anything.
--
-- Internal helpers start with an underscore and are NOT callable through the API.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Support table: password fingerprint (so "password changed" can be verified)
-- -----------------------------------------------------------------------------
create table public.profile_security (
  user_id        uuid primary key references public.profiles(id),
  pw_fingerprint text
);
alter table public.profile_security enable row level security;      -- no policies: functions only
revoke all on public.profile_security from anon, authenticated;
create trigger prevent_delete   before delete   on public.profile_security
  for each row       execute function public.tg_prevent_delete();
create trigger prevent_truncate before truncate on public.profile_security
  for each statement execute function public.tg_prevent_delete();

-- Every profile, however it is created, gets a fingerprint of the password it starts with.
create or replace function public.tg_profile_fingerprint()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  insert into public.profile_security (user_id, pw_fingerprint)
  values (new.id, (select encode(sha256(convert_to(encrypted_password, 'UTF8')), 'hex') from auth.users where id = new.id))
  on conflict (user_id) do nothing;
  return new;
end $$;
create trigger profile_fingerprint after insert on public.profiles
  for each row execute function public.tg_profile_fingerprint();
revoke execute on function public.tg_profile_fingerprint() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Internal helpers
-- -----------------------------------------------------------------------------
create or replace function public._require(p_roles public.user_role[])
returns public.profiles language plpgsql stable security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if not found then raise exception 'You are not signed in.' using errcode = 'P0001'; end if;
  if not public.is_session_permitted() then
    raise exception 'Your session is not permitted. Change your password or contact an administrator.' using errcode = 'P0001';
  end if;
  if not (p.role = any(p_roles)) then
    raise exception 'Your role (%) is not allowed to do this.', replace(p.role::text, '_', ' ') using errcode = 'P0001';
  end if;
  return p;
end $$;

create or replace function public._doc(p_id uuid, p_allow_voided boolean default false)
returns public.documents language plpgsql stable security definer set search_path = public as $$
declare d public.documents;
begin
  select * into d from public.documents where id = p_id;
  if not found or not public.can_view_document(p_id) then
    raise exception 'Document not found.' using errcode = 'P0001';
  end if;
  if d.is_voided and not p_allow_voided then
    raise exception 'Document % is voided.', d.reference_number using errcode = 'P0001';
  end if;
  return d;
end $$;

create or replace function public._notify(p_user uuid, p_type public.notification_type,
                                          p_doc uuid, p_title text, p_body text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  if not exists (select 1 from public.profiles where id = p_user and is_active) then return; end if;
  insert into public.notifications (user_id, notification_type, document_id, title, body)
  values (p_user, p_type, p_doc, p_title, p_body);
end $$;

create or replace function public._check_routable(p_user uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles
                 where id = p_user and is_active and locked_at is null and role <> 'auditor') then
    raise exception 'That person cannot receive documents (inactive, locked or an auditor).' using errcode = 'P0001';
  end if;
end $$;

create or replace function public._grant_access(p_doc uuid, p_user uuid, p_type public.access_type, p_by uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  if not exists (select 1 from public.document_access
                 where document_id = p_doc and user_id = p_user and access_type = p_type and revoked_at is null) then
    insert into public.document_access (document_id, user_id, access_type, granted_by)
    values (p_doc, p_user, p_type, p_by);
  end if;
end $$;

-- Makes p_to the primary owner; the previous owner keeps a read-only copy.
create or replace function public._assign_primary(p_doc uuid, p_to uuid, p_by uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_prev uuid;
begin
  select user_id into v_prev from public.document_access
   where document_id = p_doc and access_type = 'primary_owner' and revoked_at is null;
  if v_prev is not distinct from p_to then return; end if;
  if v_prev is not null then
    update public.document_access
       set revoked_by = p_by, revoked_at = now(), revoke_reason = p_reason
     where document_id = p_doc and access_type = 'primary_owner' and revoked_at is null;
    perform public._grant_access(p_doc, v_prev, 'copy', p_by);
  end if;
  perform public._grant_access(p_doc, p_to, 'primary_owner', p_by);
end $$;

-- Stores a file version. A new file gets version 1; an existing file gets the next
-- version (and then needs a reason). The path must match {doc}/{file}/v{n}.{ext}.
create or replace function public._add_file(p_doc uuid, p_kind public.file_kind, p_file_id uuid,
                                            p_meta jsonb, p_title text, p_reason text, p_user uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_file uuid := coalesce(p_file_id, gen_random_uuid()); v_ver int; v_vid uuid;
        v_path text := p_meta ->> 'storage_path';
begin
  if p_meta is null or v_path is null then raise exception 'File details are missing.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.document_files where id = v_file) then
    if not exists (select 1 from public.document_files
                   where id = v_file and document_id = p_doc and file_kind = p_kind) then
      raise exception 'That file does not belong to this document.' using errcode = 'P0001';
    end if;
    select max(version_number) + 1 into v_ver from public.document_file_versions where file_id = v_file;
  else
    insert into public.document_files (id, document_id, file_kind, title, created_by)
    values (v_file, p_doc, p_kind, p_title, p_user);
    v_ver := 1;
  end if;
  if v_path !~ ('^' || p_doc::text || '/' || v_file::text || '/v' || v_ver::text || '\.[a-z0-9]+$') then
    raise exception 'Stored file path does not match version %.', v_ver using errcode = 'P0001';
  end if;
  insert into public.document_file_versions
    (file_id, document_id, version_number, storage_path, original_filename, mime_type, size_bytes,
     sha256, page_count, scan_dpi, is_colour, is_pdfa, ocr_text, reason, uploaded_by)
  values
    (v_file, p_doc, v_ver, v_path, p_meta ->> 'original_filename', p_meta ->> 'mime_type',
     (p_meta ->> 'size_bytes')::bigint, p_meta ->> 'sha256',
     nullif(p_meta ->> 'page_count', '')::int, nullif(p_meta ->> 'scan_dpi', '')::int,
     nullif(p_meta ->> 'is_colour', '')::boolean, coalesce((p_meta ->> 'is_pdfa')::boolean, false),
     nullif(p_meta ->> 'ocr_text', ''), nullif(trim(coalesce(p_reason, '')), ''), p_user)
  returning id into v_vid;
  return v_vid;
end $$;

create or replace function public._pw_fp(p_user uuid)
returns text language sql stable security definer set search_path = public, auth as $$
  select encode(sha256(convert_to(encrypted_password, 'UTF8')), 'hex') from auth.users where id = p_user
$$;

-- -----------------------------------------------------------------------------
-- 3. Accounts (the Auth user itself is created by the server with the Admin API)
-- -----------------------------------------------------------------------------
create or replace function public.admin_create_profile(
  p_user uuid, p_full_name text, p_role public.user_role, p_office smallint,
  p_department integer, p_job_title text, p_phone text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  me := public._require(array['system_administrator']::public.user_role[]);
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'The login for that user does not exist yet.' using errcode = 'P0001';
  end if;
  insert into public.profiles (id, full_name, email, role, office_id, department_id, job_title, phone, created_by)
  values (p_user, trim(p_full_name), (select email from auth.users where id = p_user), p_role, p_office,
          p_department, nullif(trim(coalesce(p_job_title, '')), ''), nullif(trim(coalesce(p_phone, '')), ''), me.id);
  insert into public.profile_security (user_id, pw_fingerprint) values (p_user, public._pw_fp(p_user))
  on conflict (user_id) do update set pw_fingerprint = excluded.pw_fingerprint;
end $$;

create or replace function public.admin_update_user(
  p_user uuid, p_full_name text, p_role public.user_role, p_office smallint,
  p_department integer, p_job_title text, p_phone text, p_remote_access boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  me := public._require(array['system_administrator']::public.user_role[]);
  if p_user = me.id and p_role <> me.role then
    raise exception 'You cannot change your own role.' using errcode = 'P0001';
  end if;
  update public.profiles
     set full_name = trim(p_full_name), role = p_role, office_id = p_office, department_id = p_department,
         job_title = nullif(trim(coalesce(p_job_title, '')), ''), phone = nullif(trim(coalesce(p_phone, '')), ''),
         remote_access_allowed = coalesce(p_remote_access, remote_access_allowed)
   where id = p_user;
  if not found then raise exception 'User not found.' using errcode = 'P0001'; end if;
end $$;

create or replace function public.admin_suspend_user(p_user uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  me := public._require(array['system_administrator']::public.user_role[]);
  if p_user = me.id then raise exception 'You cannot suspend your own account.' using errcode = 'P0001'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'Give a reason.' using errcode = 'P0001'; end if;
  update public.profiles
     set is_active = false, suspended_at = now(), suspended_by = me.id, suspension_reason = trim(p_reason)
   where id = p_user and is_active;
  if not found then raise exception 'User not found or already suspended.' using errcode = 'P0001'; end if;
end $$;

create or replace function public.admin_reactivate_user(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require(array['system_administrator']::public.user_role[]);
  update public.profiles
     set is_active = true, suspended_at = null, suspended_by = null, suspension_reason = null
   where id = p_user and not is_active;
  if not found then raise exception 'User not found or not suspended.' using errcode = 'P0001'; end if;
end $$;

create or replace function public.admin_unlock_user(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require(array['system_administrator']::public.user_role[]);
  update public.profiles set locked_at = null, failed_login_attempts = 0 where id = p_user;
  if not found then raise exception 'User not found.' using errcode = 'P0001'; end if;
end $$;

-- Called after the server has set a new temporary password through the Auth Admin API.
create or replace function public.admin_mark_password_reset(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  me := public._require(array['system_administrator']::public.user_role[]);
  update public.profiles
     set must_change_password = true, failed_login_attempts = 0, locked_at = null
   where id = p_user;
  if not found then raise exception 'User not found.' using errcode = 'P0001'; end if;
  insert into public.profile_security (user_id, pw_fingerprint) values (p_user, public._pw_fp(p_user))
  on conflict (user_id) do update set pw_fingerprint = excluded.pw_fingerprint;
  perform public.write_audit('password_reset', null, 'profiles', p_user::text,
                             jsonb_build_object('affected_user', p_user, 'by', me.id));
end $$;

-- The user has just changed their own password through Supabase Auth. Verified by
-- comparing the stored password fingerprint, so the forced change cannot be skipped.
create or replace function public.complete_password_change()
returns void language plpgsql security definer set search_path = public as $$
declare v_old text; v_new text;
begin
  if auth.uid() is null then raise exception 'You are not signed in.' using errcode = 'P0001'; end if;
  select pw_fingerprint into v_old from public.profile_security where user_id = auth.uid();
  v_new := public._pw_fp(auth.uid());
  if v_old is not null and v_old = v_new then
    raise exception 'The password has not been changed.' using errcode = 'P0001';
  end if;
  update public.profiles
     set must_change_password = false, password_changed_at = now(), failed_login_attempts = 0
   where id = auth.uid() and is_active;
  insert into public.profile_security (user_id, pw_fingerprint) values (auth.uid(), v_new)
  on conflict (user_id) do update set pw_fingerprint = excluded.pw_fingerprint;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Contacts and configuration lists
-- -----------------------------------------------------------------------------
create or replace function public.save_organisation(
  p_id uuid, p_name text, p_type text, p_address text, p_phone text, p_email text, p_is_active boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare me public.profiles; v_id uuid := p_id;
begin
  me := public._require(array['registry_officer', 'system_administrator']::public.user_role[]);
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'Organisation name is required.' using errcode = 'P0001'; end if;
  if v_id is null then
    insert into public.organisations (name, organisation_type, address, phone, email, created_by)
    values (trim(p_name), nullif(trim(coalesce(p_type, '')), ''), nullif(trim(coalesce(p_address, '')), ''),
            nullif(trim(coalesce(p_phone, '')), ''), nullif(trim(coalesce(p_email, '')), ''), me.id)
    returning id into v_id;
  else
    update public.organisations
       set name = trim(p_name), organisation_type = nullif(trim(coalesce(p_type, '')), ''),
           address = nullif(trim(coalesce(p_address, '')), ''), phone = nullif(trim(coalesce(p_phone, '')), ''),
           email = nullif(trim(coalesce(p_email, '')), ''), is_active = coalesce(p_is_active, true)
     where id = v_id;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'An organisation with that name already exists.' using errcode = 'P0001';
end $$;

create or replace function public.save_contact(
  p_id uuid, p_organisation uuid, p_full_name text, p_title text, p_phone text, p_email text, p_is_active boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare me public.profiles; v_id uuid := p_id;
begin
  me := public._require(array['registry_officer', 'system_administrator']::public.user_role[]);
  if nullif(trim(coalesce(p_full_name, '')), '') is null then raise exception 'Name is required.' using errcode = 'P0001'; end if;
  if v_id is null then
    insert into public.contacts (organisation_id, full_name, title, phone, email, created_by)
    values (p_organisation, trim(p_full_name), nullif(trim(coalesce(p_title, '')), ''),
            nullif(trim(coalesce(p_phone, '')), ''), nullif(trim(coalesce(p_email, '')), ''), me.id)
    returning id into v_id;
  else
    update public.contacts
       set organisation_id = p_organisation, full_name = trim(p_full_name),
           title = nullif(trim(coalesce(p_title, '')), ''), phone = nullif(trim(coalesce(p_phone, '')), ''),
           email = nullif(trim(coalesce(p_email, '')), ''), is_active = coalesce(p_is_active, true)
     where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function public.admin_save_lookup(
  p_table text, p_id integer, p_name text, p_is_active boolean default true,
  p_sort integer default null, p_office smallint default null)
returns integer language plpgsql security definer set search_path = public as $$
declare v_id integer := p_id;
begin
  perform public._require(array['system_administrator']::public.user_role[]);
  if p_table not in ('categories', 'document_types', 'departments') then
    raise exception 'Unknown list.' using errcode = 'P0001';
  end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'Name is required.' using errcode = 'P0001'; end if;
  if p_table = 'departments' then
    if v_id is null then
      insert into public.departments (office_id, name, is_active) values (p_office, trim(p_name), coalesce(p_is_active, true))
      returning id into v_id;
    else
      update public.departments set office_id = p_office, name = trim(p_name), is_active = coalesce(p_is_active, true) where id = v_id;
    end if;
  elsif v_id is null then
    execute format('insert into public.%I (name, sort_order, is_active) values ($1, coalesce($2, 0), coalesce($3, true)) returning id', p_table)
      into v_id using trim(p_name), p_sort, p_is_active;
  else
    execute format('update public.%I set name = $1, sort_order = coalesce($2, sort_order), is_active = coalesce($3, true) where id = $4', p_table)
      using trim(p_name), p_sort, p_is_active, v_id;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'That name already exists.' using errcode = 'P0001';
end $$;

create or replace function public.admin_set_priority_hours(p_priority public.priority_level, p_hours integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require(array['system_administrator']::public.user_role[]);
  if p_hours is null or p_hours < 1 then raise exception 'Hours must be at least 1.' using errcode = 'P0001'; end if;
  update public.priority_rules set response_hours = p_hours where priority = p_priority;
end $$;

create or replace function public.admin_set_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  me := public._require(array['system_administrator']::public.user_role[]);
  update public.system_settings set value = p_value, updated_by = me.id where key = p_key;
  if not found then raise exception 'Unknown setting.' using errcode = 'P0001'; end if;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Incoming documents
-- -----------------------------------------------------------------------------
-- p: document_id?, file_id?, office_id, subject, document_type_id, category_id, priority,
--    classification, office_only?, number_of_pages, number_of_attachments, physical_file_location,
--    entry_mode?, manual_register_form_no?, received_at?,
--    sender_organisation_id?, sender_organisation_text?, sender_contact_id?, sender_name, sender_title,
--    delivered_by_name, delivered_by_phone?, delivered_by_id_seen, delivery_method,
--    sender_reference?, sender_reference_date?, response_required, response_due_date?,
--    routed_to, route_reason?, cc[]?, minute?, linked_document_ids[]?, file{...}
create or replace function public.register_incoming(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  v_doc uuid := coalesce(nullif(p ->> 'document_id', '')::uuid, gen_random_uuid());
  v_file uuid := coalesce(nullif(p ->> 'file_id', '')::uuid, gen_random_uuid());
  v_owner uuid := nullif(p ->> 'routed_to', '')::uuid;
  v_class public.classification_level := (p ->> 'classification')::public.classification_level;
  v_office_only boolean;
  v_mode public.entry_mode := coalesce(nullif(p ->> 'entry_mode', ''), 'system')::public.entry_mode;
  d public.documents; v_cc uuid; v_link uuid; v_reason text;
begin
  me := public._require(array['registry_officer']::public.user_role[]);
  if p -> 'file' is null or p -> 'file' = 'null'::jsonb then
    raise exception 'The record cannot be saved without the scanned file.' using errcode = 'P0001';
  end if;
  if v_owner is null then raise exception 'Choose who the document is routed to.' using errcode = 'P0001'; end if;
  perform public._check_routable(v_owner);
  v_office_only := coalesce(nullif(p ->> 'office_only', '')::boolean,
                            v_class = 'confidential' and coalesce((public.setting('confidential_office_only_default'))::boolean, false));

  insert into public.documents
    (id, direction, office_id, subject, document_type_id, category_id, priority, classification, office_only,
     number_of_pages, number_of_attachments, physical_file_location, registered_by,
     entry_mode, manual_register_form_no, received_at, status)
  values
    (v_doc, 'incoming', (p ->> 'office_id')::smallint, trim(p ->> 'subject'),
     (p ->> 'document_type_id')::int, (p ->> 'category_id')::int,
     (p ->> 'priority')::public.priority_level, v_class, v_office_only,
     (p ->> 'number_of_pages')::int, coalesce(nullif(p ->> 'number_of_attachments', '')::int, 0),
     trim(p ->> 'physical_file_location'), me.id,
     v_mode, nullif(p ->> 'manual_register_form_no', ''), nullif(p ->> 'received_at', '')::timestamptz, 'registered');

  insert into public.incoming_details
    (document_id, sender_organisation_id, sender_organisation_text, sender_contact_id, sender_name, sender_title,
     delivered_by_name, delivered_by_phone, delivered_by_id_seen, delivery_method,
     sender_reference, sender_reference_date, response_required, response_due_date)
  values
    (v_doc, nullif(p ->> 'sender_organisation_id', '')::uuid, nullif(trim(coalesce(p ->> 'sender_organisation_text', '')), ''),
     nullif(p ->> 'sender_contact_id', '')::uuid, trim(p ->> 'sender_name'), trim(p ->> 'sender_title'),
     trim(p ->> 'delivered_by_name'), nullif(trim(coalesce(p ->> 'delivered_by_phone', '')), ''),
     coalesce((p ->> 'delivered_by_id_seen')::boolean, false), (p ->> 'delivery_method')::public.delivery_method,
     nullif(trim(coalesce(p ->> 'sender_reference', '')), ''), nullif(p ->> 'sender_reference_date', '')::date,
     coalesce((p ->> 'response_required')::boolean, false), nullif(p ->> 'response_due_date', '')::date);

  perform public._add_file(v_doc, 'main_scan', v_file, p -> 'file', 'Scanned document', null, me.id);

  -- the registering officer is recorded as holder until the document is routed below
  v_reason := coalesce(nullif(trim(coalesce(p ->> 'route_reason', '')), ''), 'Initial routing at registry');
  perform public._assign_primary(v_doc, v_owner, me.id, v_reason);
  for v_cc in select (e)::uuid from jsonb_array_elements_text(coalesce(p -> 'cc', '[]'::jsonb)) e loop
    if v_cc <> v_owner then
      perform public._check_routable(v_cc);
      perform public._grant_access(v_doc, v_cc, 'copy', me.id);
      perform public._notify(v_cc, 'new_assignment', v_doc, 'Copy of a document for your information');
    end if;
  end loop;

  insert into public.document_movements (document_id, movement_type, from_user_id, to_user_id, reason, moved_by)
  values (v_doc, 'routed', me.id, v_owner, v_reason, me.id);
  update public.documents set status = 'routed', current_holder_id = v_owner, current_holder_since = now()
   where id = v_doc;

  if nullif(trim(coalesce(p ->> 'minute', '')), '') is not null then
    insert into public.document_minutes (document_id, author_id, directed_to_user_id, minute_text)
    values (v_doc, me.id, v_owner, trim(p ->> 'minute'));
  end if;

  for v_link in select (e)::uuid from jsonb_array_elements_text(coalesce(p -> 'linked_document_ids', '[]'::jsonb)) e loop
    if exists (select 1 from public.documents where id = v_link) and v_link <> v_doc then
      insert into public.document_links (from_document_id, to_document_id, link_type, created_by)
      values (v_doc, v_link, 'related', me.id) on conflict do nothing;
    end if;
  end loop;

  select * into d from public.documents where id = v_doc;
  perform public._notify(v_owner, 'new_assignment', v_doc, 'New document assigned: ' || d.reference_number, d.subject);
  return jsonb_build_object('id', d.id, 'reference_number', d.reference_number,
                            'registered_at', d.registered_at, 'received_at', d.received_at, 'due_at', d.due_at);
end $$;

-- Data for the acknowledgement slip / receipt label. Works for the registering
-- officer even when the document is Confidential, and never returns the subject.
create or replace function public.get_receipt_slip(p_doc uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.profiles; d public.documents; i public.incoming_details; r jsonb;
begin
  me := public._require(array['registry_officer', 'system_administrator', 'executive_viewer', 'auditor']::public.user_role[]);
  select * into d from public.documents where id = p_doc and direction = 'incoming';
  if not found or not (d.registered_by = me.id or public.can_view_document(p_doc)) then
    raise exception 'Document not found.' using errcode = 'P0001';
  end if;
  select * into i from public.incoming_details where document_id = p_doc;
  r := jsonb_build_object(
    'reference_number', d.reference_number, 'received_at', d.received_at,
    'office', (select name from public.offices where id = d.office_id),
    'delivered_by_name', i.delivered_by_name, 'delivered_by_phone', i.delivered_by_phone,
    'delivered_by_id_seen', i.delivered_by_id_seen,
    'sender', coalesce((select name from public.organisations where id = i.sender_organisation_id), i.sender_organisation_text),
    'number_of_pages', d.number_of_pages, 'number_of_attachments', d.number_of_attachments,
    'registered_by', (select full_name from public.profiles where id = d.registered_by),
    'classification', d.classification);
  update public.incoming_details
     set label_printed_at = coalesce(label_printed_at, now()),
         acknowledgement_method = coalesce(acknowledgement_method, 'printed'),
         acknowledgement_sent_at = coalesce(acknowledgement_sent_at, now())
   where document_id = p_doc;
  perform public.write_audit('document_printed', p_doc, 'incoming_details', p_doc::text,
                             jsonb_build_object('what', 'acknowledgement slip'));
  return r;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Outgoing documents
-- -----------------------------------------------------------------------------
-- p: document_id?, file_id?, office_id, subject, document_type_id, category_id, priority, classification,
--    office_only?, signatory, signed_by_user_id?, delegated_officer_name?, feedback_required,
--    feedback_due_date?, feedback_officer_id?, in_reply_to?, recipients[{recipient_type, organisation_id?,
--    organisation_text?, recipient_name?, recipient_title?}], file{...}? (draft)
create or replace function public.register_outgoing(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  v_doc uuid := coalesce(nullif(p ->> 'document_id', '')::uuid, gen_random_uuid());
  v_class public.classification_level := (p ->> 'classification')::public.classification_level;
  v_fb_officer uuid := nullif(p ->> 'feedback_officer_id', '')::uuid;
  v_reply uuid := nullif(p ->> 'in_reply_to', '')::uuid;
  r jsonb; n int := 0; d public.documents;
begin
  me := public._require(array['registry_officer']::public.user_role[]);
  if jsonb_array_length(coalesce(p -> 'recipients', '[]'::jsonb)) = 0 then
    raise exception 'Add at least one recipient.' using errcode = 'P0001';
  end if;
  insert into public.documents
    (id, direction, office_id, subject, document_type_id, category_id, priority, classification, office_only,
     registered_by, status)
  values
    (v_doc, 'outgoing', (p ->> 'office_id')::smallint, trim(p ->> 'subject'),
     (p ->> 'document_type_id')::int, (p ->> 'category_id')::int,
     (p ->> 'priority')::public.priority_level, v_class,
     coalesce(nullif(p ->> 'office_only', '')::boolean,
              v_class = 'confidential' and coalesce((public.setting('confidential_office_only_default'))::boolean, false)),
     me.id, 'draft');
  insert into public.outgoing_details
    (document_id, drafted_by, signatory, signed_by_user_id, delegated_officer_name,
     feedback_required, feedback_due_date, feedback_officer_id)
  values
    (v_doc, me.id, (p ->> 'signatory')::public.signatory_type, nullif(p ->> 'signed_by_user_id', '')::uuid,
     nullif(trim(coalesce(p ->> 'delegated_officer_name', '')), ''),
     coalesce((p ->> 'feedback_required')::boolean, false), nullif(p ->> 'feedback_due_date', '')::date, v_fb_officer);
  for r in select * from jsonb_array_elements(p -> 'recipients') loop
    insert into public.outgoing_recipients
      (document_id, recipient_type, organisation_id, organisation_text, recipient_name, recipient_title, sort_order)
    values
      (v_doc, coalesce(nullif(r ->> 'recipient_type', ''), 'to')::public.recipient_type,
       nullif(r ->> 'organisation_id', '')::uuid, nullif(trim(coalesce(r ->> 'organisation_text', '')), ''),
       nullif(trim(coalesce(r ->> 'recipient_name', '')), ''), nullif(trim(coalesce(r ->> 'recipient_title', '')), ''), n);
    n := n + 1;
  end loop;
  -- the drafter and the follow-up officer can always see the item, even if Confidential
  perform public._grant_access(v_doc, me.id, 'named_recipient', me.id);
  if v_fb_officer is not null then perform public._grant_access(v_doc, v_fb_officer, 'named_recipient', me.id); end if;
  if v_reply is not null then
    if not exists (select 1 from public.documents where id = v_reply and direction = 'incoming') then
      raise exception 'The document you are replying to was not found.' using errcode = 'P0001';
    end if;
    insert into public.document_links (from_document_id, to_document_id, link_type, created_by)
    values (v_doc, v_reply, 'in_reply_to', me.id);
  end if;
  if p -> 'file' is not null and p -> 'file' <> 'null'::jsonb then
    perform public._add_file(v_doc, 'draft', nullif(p ->> 'file_id', '')::uuid, p -> 'file', 'Draft', null, me.id);
  end if;
  select * into d from public.documents where id = v_doc;
  return jsonb_build_object('id', d.id, 'reference_number', d.reference_number, 'registered_at', d.registered_at);
end $$;

create or replace function public.update_outgoing_draft(p_doc uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; d public.documents; r jsonb; n int;
begin
  me := public._require(array['registry_officer']::public.user_role[]);
  d := public._doc(p_doc);
  if d.direction <> 'outgoing' or d.status <> 'draft' then
    raise exception 'Only a draft outgoing document can be edited. Use a correction request after it is Final.' using errcode = 'P0001';
  end if;
  update public.documents
     set subject = coalesce(nullif(trim(p ->> 'subject'), ''), subject),
         document_type_id = coalesce(nullif(p ->> 'document_type_id', '')::int, document_type_id),
         category_id = coalesce(nullif(p ->> 'category_id', '')::int, category_id),
         priority = coalesce(nullif(p ->> 'priority', '')::public.priority_level, priority),
         classification = coalesce(nullif(p ->> 'classification', '')::public.classification_level, classification)
   where id = p_doc;
  update public.outgoing_details
     set signatory = coalesce(nullif(p ->> 'signatory', '')::public.signatory_type, signatory),
         signed_by_user_id = case when p ? 'signed_by_user_id' then nullif(p ->> 'signed_by_user_id', '')::uuid else signed_by_user_id end,
         delegated_officer_name = case when p ? 'delegated_officer_name' then nullif(trim(coalesce(p ->> 'delegated_officer_name', '')), '') else delegated_officer_name end,
         feedback_required = coalesce(nullif(p ->> 'feedback_required', '')::boolean, feedback_required),
         feedback_due_date = case when p ? 'feedback_due_date' then nullif(p ->> 'feedback_due_date', '')::date else feedback_due_date end,
         feedback_officer_id = case when p ? 'feedback_officer_id' then nullif(p ->> 'feedback_officer_id', '')::uuid else feedback_officer_id end
   where document_id = p_doc;
  select coalesce(max(sort_order), -1) + 1 into n from public.outgoing_recipients where document_id = p_doc;
  for r in select * from jsonb_array_elements(coalesce(p -> 'new_recipients', '[]'::jsonb)) loop
    insert into public.outgoing_recipients
      (document_id, recipient_type, organisation_id, organisation_text, recipient_name, recipient_title, sort_order)
    values
      (p_doc, coalesce(nullif(r ->> 'recipient_type', ''), 'to')::public.recipient_type,
       nullif(r ->> 'organisation_id', '')::uuid, nullif(trim(coalesce(r ->> 'organisation_text', '')), ''),
       nullif(trim(coalesce(r ->> 'recipient_name', '')), ''), nullif(trim(coalesce(r ->> 'recipient_title', '')), ''), n);
    n := n + 1;
  end loop;
end $$;

-- Adds a file version. kind: attachment | main_scan (re-scan) | draft | signed_copy | proof_of_delivery
create or replace function public.add_file_version(
  p_doc uuid, p_kind public.file_kind, p_file_id uuid, p_meta jsonb, p_title text, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare me public.profiles; d public.documents;
begin
  me := public._require(array['registry_officer']::public.user_role[]);
  d := public._doc(p_doc);
  if p_kind = 'main_scan' and (d.direction <> 'incoming' or p_file_id is null) then
    raise exception 'A re-scan is added as a new version of the existing scan.' using errcode = 'P0001';
  end if;
  if p_kind = 'draft' and not (d.direction = 'outgoing' and d.status = 'draft') then
    raise exception 'Drafts can only be added while the document is a draft.' using errcode = 'P0001';
  end if;
  if p_kind in ('signed_copy', 'proof_of_delivery') and d.direction <> 'outgoing' then
    raise exception 'That file type is only for outgoing documents.' using errcode = 'P0001';
  end if;
  if p_kind = 'signed_copy' and d.status = 'draft' then
    raise exception 'Use Mark as Final to add the signed copy.' using errcode = 'P0001';
  end if;
  if p_kind = 'acknowledgement_slip' then raise exception 'Not supported.' using errcode = 'P0001'; end if;
  return public._add_file(p_doc, p_kind, p_file_id, p_meta, p_title, p_reason, me.id);
end $$;

create or replace function public.finalise_outgoing(p_doc uuid, p_file_id uuid, p_meta jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; d public.documents; x public.documents; l record;
begin
  me := public._require(array['registry_officer']::public.user_role[]);
  d := public._doc(p_doc);
  if d.direction <> 'outgoing' or d.status <> 'draft' then
    raise exception 'Only a draft outgoing document can be marked Final.' using errcode = 'P0001';
  end if;
  if p_meta is null or p_meta = 'null'::jsonb then
    raise exception 'Scan the final signed copy before marking the document Final.' using errcode = 'P0001';
  end if;
  perform public._add_file(p_doc, 'signed_copy', p_file_id, p_meta, 'Signed copy', null, me.id);
  update public.documents set status = 'final' where id = p_doc;
  -- a reply closes the incoming item it answers (when that item is being worked on)
  for l in select to_document_id from public.document_links where from_document_id = p_doc and link_type = 'in_reply_to' loop
    select * into x from public.documents where id = l.to_document_id;
    if x.status in ('with_action_officer', 'action_taken') and not x.is_voided then
      update public.documents
         set status = 'closed', closing_note = 'Replied by ' || d.reference_number,
             closed_at = now(), closed_by = me.id
       where id = x.id;
    end if;
  end loop;
end $$;

create or replace function public.dispatch_outgoing(
  p_doc uuid, p_method public.delivery_method, p_by_name text, p_at timestamptz default now())
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; d public.documents;
begin
  me := public._require(array['registry_officer']::public.user_role[]);
  d := public._doc(p_doc);
  if d.direction <> 'outgoing' or d.status <> 'final' then
    raise exception 'Only a Final document can be dispatched.' using errcode = 'P0001';
  end if;
  if nullif(trim(coalesce(p_by_name, '')), '') is null then raise exception 'Name the messenger or courier.' using errcode = 'P0001'; end if;
  if p_at > now() + interval '5 minutes' then raise exception 'The dispatch time cannot be in the future.' using errcode = 'P0001'; end if;
  update public.outgoing_details
     set dispatch_method = p_method, dispatched_at = coalesce(p_at, now()),
         dispatched_by_name = trim(p_by_name), dispatch_recorded_by = me.id
   where document_id = p_doc;
  update public.documents set status = 'dispatched' where id = p_doc;
end $$;

create or replace function public.confirm_delivery(
  p_doc uuid, p_delivered_at timestamptz, p_note text, p_file_id uuid, p_meta jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; d public.documents; o public.outgoing_details;
begin
  me := public._require(array['registry_officer']::public.user_role[]);
  d := public._doc(p_doc);
  if d.direction <> 'outgoing' or d.status <> 'dispatched' then
    raise exception 'Only a dispatched document can be marked Delivered.' using errcode = 'P0001';
  end if;
  if nullif(trim(coalesce(p_note, '')), '') is null and (p_meta is null or p_meta = 'null'::jsonb) then
    raise exception 'Give proof of delivery: a note (receipt or tracking number) or a scanned receipt.' using errcode = 'P0001';
  end if;
  if p_meta is not null and p_meta <> 'null'::jsonb then
    perform public._add_file(p_doc, 'proof_of_delivery', p_file_id, p_meta, 'Proof of delivery', null, me.id);
  end if;
  update public.outgoing_details
     set delivered_at = coalesce(p_delivered_at, now()),
         proof_of_delivery_note = nullif(trim(coalesce(p_note, '')), '')
   where document_id = p_doc;
  update public.documents set status = 'delivered' where id = p_doc;
  select * into o from public.outgoing_details where document_id = p_doc;
  if o.feedback_required then
    update public.documents set status = 'awaiting_feedback' where id = p_doc;
  end if;
end $$;

-- Links the incoming reply to an outgoing item and closes its follow-up.
create or replace function public.link_feedback(p_out uuid, p_in uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; o public.documents; i public.documents;
begin
  me := public._require(array['registry_officer', 'system_administrator']::public.user_role[]);
  o := public._doc(p_out);
  i := public._doc(p_in);
  if o.direction <> 'outgoing' or i.direction <> 'incoming' then
    raise exception 'Link an incoming reply to an outgoing document.' using errcode = 'P0001';
  end if;
  update public.outgoing_details
     set feedback_received_at = now(), feedback_document_id = p_in
   where document_id = p_out and feedback_required and feedback_received_at is null;
  if not found then raise exception 'This document is not waiting for feedback.' using errcode = 'P0001'; end if;
  insert into public.document_links (from_document_id, to_document_id, link_type, created_by)
  values (p_in, p_out, 'feedback_for', me.id) on conflict do nothing;
  perform public._notify((select drafted_by from public.outgoing_details where document_id = p_out),
                         'new_assignment', p_out, 'Feedback received for ' || o.reference_number,
                         'Reply registered as ' || i.reference_number);
end $$;

-- -----------------------------------------------------------------------------
-- 7. Routing, hand-overs, acknowledgement
-- -----------------------------------------------------------------------------
create or replace function public.route_document(p_doc uuid, p_to uuid, p_reason text, p_cc uuid[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; d public.documents; v_cc uuid; v_new public.document_status; v_type public.movement_type;
begin
  me := public._require(array['registry_officer', 'system_administrator']::public.user_role[]);
  d := public._doc(p_doc);
  if d.direction <> 'incoming' or d.status in ('closed', 'filed') then
    raise exception 'This document cannot be routed in its current state.' using errcode = 'P0001';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'Give a reason for the hand-over.' using errcode = 'P0001'; end if;
  perform public._check_routable(p_to);
  v_type := case when d.status = 'registered' then 'routed' else 'reassigned' end;
  v_new := case d.status
             when 'registered' then 'routed' when 'returned_for_clarification' then 'routed'
             when 'on_hold' then 'routed' when 'action_taken' then 'with_action_officer'
             else d.status end;
  perform public._assign_primary(p_doc, p_to, me.id, trim(p_reason));
  foreach v_cc in array coalesce(p_cc, '{}') loop
    if v_cc <> p_to then
      perform public._check_routable(v_cc);
      perform public._grant_access(p_doc, v_cc, 'copy', me.id);
    end if;
  end loop;
  insert into public.document_movements (document_id, movement_type, from_user_id, to_user_id, reason, moved_by)
  values (p_doc, v_type, d.current_holder_id, p_to, trim(p_reason), me.id);
  update public.documents set status = v_new, current_holder_id = p_to, current_holder_since = now() where id = p_doc;
  perform public._notify(p_to, 'new_assignment', p_doc, 'New document assigned: ' || d.reference_number, d.subject);
end $$;

create or replace function public.forward_document(p_doc uuid, p_to uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; d public.documents; v_new public.document_status;
begin
  me := public._require(array['action_officer', 'registry_officer', 'executive_viewer']::public.user_role[]);
  d := public._doc(p_doc);
  if d.direction <> 'incoming' or d.current_holder_id is distinct from me.id or d.status in ('closed', 'filed') then
    raise exception 'Only the officer holding an open incoming document can forward it.' using errcode = 'P0001';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'Give a reason for the hand-over.' using errcode = 'P0001'; end if;
  if p_to = me.id then raise exception 'Choose someone else.' using errcode = 'P0001'; end if;
  perform public._check_routable(p_to);
  v_new := case d.status when 'action_taken' then 'with_action_officer' when 'on_hold' then 'routed'
                         when 'returned_for_clarification' then 'routed' else d.status end;
  perform public._assign_primary(p_doc, p_to, me.id, trim(p_reason));
  insert into public.document_movements (document_id, movement_type, from_user_id, to_user_id, reason, moved_by)
  values (p_doc, 'forwarded', me.id, p_to, trim(p_reason), me.id);
  update public.documents set status = v_new, current_holder_id = p_to, current_holder_since = now() where id = p_doc;
  perform public._notify(p_to, 'new_assignment', p_doc, 'Document forwarded to you: ' || d.reference_number, d.subject);
end $$;

create or replace function public.return_document(p_doc uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; d public.documents; v_to uuid;
begin
  me := public._require(array['action_officer', 'executive_viewer']::public.user_role[]);
  d := public._doc(p_doc);
  if d.direction <> 'incoming' or d.current_holder_id is distinct from me.id
     or d.status not in ('routed', 'with_action_officer') then
    raise exception 'Only the officer holding the document can return it for clarification.' using errcode = 'P0001';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'Say what needs clarifying.' using errcode = 'P0001'; end if;
  select from_user_id into v_to from public.document_movements
   where document_id = p_doc and to_user_id = me.id order by moved_at desc limit 1;
  v_to := coalesce(v_to, d.registered_by);
  perform public._assign_primary(p_doc, v_to, me.id, trim(p_reason));
  insert into public.document_movements (document_id, movement_type, from_user_id, to_user_id, reason, moved_by)
  values (p_doc, 'returned', me.id, v_to, trim(p_reason), me.id);
  update public.documents set status = 'returned_for_clarification', current_holder_id = v_to, current_holder_since = now()
   where id = p_doc;
  perform public._notify(v_to, 'new_assignment', p_doc, 'Document returned for clarification: ' || d.reference_number, trim(p_reason));
end $$;

create or replace function public.record_physical_move(p_doc uuid, p_location text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; d public.documents;
begin
  me := public._require(array['registry_officer', 'action_officer', 'system_administrator']::public.user_role[]);
  d := public._doc(p_doc);
  if nullif(trim(coalesce(p_location, '')), '') is null or nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Give the new location and a reason.' using errcode = 'P0001';
  end if;
  insert into public.document_movements (document_id, movement_type, from_user_id, to_physical_location, reason, moved_by)
  values (p_doc, 'physical_transfer', d.current_holder_id, trim(p_location), trim(p_reason), me.id);
  update public.documents set current_physical_location = trim(p_location) where id = p_doc;
end $$;

create or replace function public.acknowledge_receipt(p_doc uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; d public.documents; m record; n int := 0;
begin
  me := public._require(array['action_officer', 'registry_officer', 'executive_viewer']::public.user_role[]);
  d := public._doc(p_doc);
  for m in select id from public.document_movements
            where document_id = p_doc and to_user_id = me.id and acknowledged_at is null loop
    update public.document_movements set acknowledged_at = now(), acknowledged_by = me.id where id = m.id;
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'Nothing to acknowledge.' using errcode = 'P0001'; end if;
  if d.status = 'routed' and d.current_holder_id = me.id then
    update public.documents set status = 'with_action_officer' where id = p_doc;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 8. Minutes, actions, status, closing
-- -----------------------------------------------------------------------------
create or replace function public.add_minute(p_doc uuid, p_text text, p_directed_to uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; d public.documents;
begin
  me := public._require(array['executive_viewer']::public.user_role[]);
  d := public._doc(p_doc);
  insert into public.document_minutes (document_id, author_id, directed_to_user_id, minute_text)
  values (p_doc, me.id, p_directed_to, trim(p_text));
  perform public._notify(coalesce(p_directed_to, d.current_holder_id), 'new_assignment', p_doc,
                         'Instruction (minute) on ' || d.reference_number, left(trim(p_text), 200));
end $$;

create or replace function public.record_action(p_doc uuid, p_type public.action_type, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; d public.documents;
begin
  me := public._require(array['action_officer', 'registry_officer', 'executive_viewer', 'system_administrator']::public.user_role[]);
  d := public._doc(p_doc);
  if d.status in ('closed', 'filed') then raise exception 'The item is closed.' using errcode = 'P0001'; end if;
  if p_type <> 'comment' and d.current_holder_id is distinct from me.id then
    raise exception 'Only the officer holding the document can record an action. You can add a comment.' using errcode = 'P0001';
  end if;
  insert into public.document_actions (document_id, user_id, action_type, action_text)
  values (p_doc, me.id, p_type, trim(p_text));
  if p_type in ('action_taken', 'task_completed') and d.status = 'with_action_officer' then
    update public.documents set status = 'action_taken' where id = p_doc;
  end if;
end $$;

create or replace function public.set_hold(p_doc uuid, p_hold boolean, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; d public.documents;
begin
  me := public._require(array['action_officer', 'registry_officer', 'executive_viewer', 'system_administrator']::public.user_role[]);
  d := public._doc(p_doc);
  if d.direction <> 'incoming' then raise exception 'Only incoming items can be put on hold.' using errcode = 'P0001'; end if;
  if d.current_holder_id is distinct from me.id and me.role not in ('registry_officer', 'system_administrator') then
    raise exception 'Only the holder, the registry or an administrator can do this.' using errcode = 'P0001';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'Give a reason.' using errcode = 'P0001'; end if;
  if p_hold then
    if d.status not in ('routed', 'with_action_officer') then
      raise exception 'Only a routed item can be put on hold.' using errcode = 'P0001';
    end if;
    update public.documents set status = 'on_hold' where id = p_doc;
    insert into public.document_actions (document_id, user_id, action_type, action_text)
    values (p_doc, me.id, 'comment', 'Put on hold: ' || trim(p_reason));
  else
    if d.status <> 'on_hold' then raise exception 'The item is not on hold.' using errcode = 'P0001'; end if;
    update public.documents set status = 'with_action_officer' where id = p_doc;
    insert into public.document_actions (document_id, user_id, action_type, action_text)
    values (p_doc, me.id, 'comment', 'Resumed: ' || trim(p_reason));
  end if;
end $$;

-- Close (needs a closing note) or file with no action required.
create or replace function public.close_document(p_doc uuid, p_note text, p_outcome text default 'closed')
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; d public.documents; v_status public.document_status;
begin
  me := public._require(array['action_officer', 'registry_officer', 'executive_viewer', 'system_administrator']::public.user_role[]);
  d := public._doc(p_doc);
  if nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception 'A closing note is required, for example "replied by NEC/SG/OUT/2026/00045" or "noted and filed".' using errcode = 'P0001';
  end if;
  if p_outcome not in ('closed', 'filed') then raise exception 'Unknown outcome.' using errcode = 'P0001'; end if;
  v_status := p_outcome::public.document_status;
  if d.direction = 'incoming' then
    if d.current_holder_id is distinct from me.id and me.role not in ('registry_officer', 'system_administrator', 'executive_viewer') then
      raise exception 'Only the holder, the registry, an executive or an administrator can close this item.' using errcode = 'P0001';
    end if;
    if p_outcome = 'closed' and d.status not in ('with_action_officer', 'action_taken') then
      raise exception 'Record the action taken before closing, or file it as "no action required".' using errcode = 'P0001';
    end if;
    if p_outcome = 'filed' and d.status not in ('registered', 'routed', 'with_action_officer') then
      raise exception 'This item cannot be filed from its current status.' using errcode = 'P0001';
    end if;
  else
    if me.role not in ('registry_officer', 'system_administrator', 'executive_viewer') then
      raise exception 'Only the registry, an executive or an administrator can close an outgoing document.' using errcode = 'P0001';
    end if;
    if p_outcome <> 'closed' then raise exception 'Outgoing documents are closed, not filed.' using errcode = 'P0001'; end if;
  end if;
  update public.documents
     set status = v_status, closing_note = trim(p_note), closed_at = now(), closed_by = me.id
   where id = p_doc;
end $$;

create or replace function public.change_due_date(p_doc uuid, p_new_due timestamptz, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; d public.documents; v_id uuid;
begin
  me := public._require(array['registry_officer', 'system_administrator']::public.user_role[]);
  d := public._doc(p_doc);
  if d.direction <> 'incoming' or d.status in ('closed', 'filed') then
    raise exception 'The due date of this item cannot be changed.' using errcode = 'P0001';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'Give a reason for the new due date.' using errcode = 'P0001'; end if;
  insert into public.due_date_changes (document_id, old_due_at, new_due_at, reason, changed_by)
  values (p_doc, d.due_at, p_new_due, trim(p_reason), me.id) returning id into v_id;
  perform set_config('app.due_date_change_id', v_id::text, true);
  update public.documents set due_at = p_new_due where id = p_doc;
  perform set_config('app.due_date_change_id', '', true);
  perform public._notify(d.current_holder_id, 'new_assignment', p_doc, 'Due date changed: ' || d.reference_number, trim(p_reason));
end $$;

create or replace function public.void_document(p_doc uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; d public.documents;
begin
  me := public._require(array['registry_officer', 'system_administrator']::public.user_role[]);
  d := public._doc(p_doc);
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'A reason is required to void a record.' using errcode = 'P0001'; end if;
  update public.documents
     set is_voided = true, void_reason = trim(p_reason), voided_by = me.id, voided_at = now()
   where id = p_doc;
end $$;

create or replace function public.grant_named_recipient(p_doc uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; d public.documents;
begin
  me := public._require(array['registry_officer', 'system_administrator', 'executive_viewer']::public.user_role[]);
  d := public._doc(p_doc);
  perform public._check_routable(p_user);
  perform public._grant_access(p_doc, p_user, 'named_recipient', me.id);
end $$;

-- -----------------------------------------------------------------------------
-- 9. Corrections
-- -----------------------------------------------------------------------------
create or replace function public.request_correction(p_doc uuid, p_table text, p_field text, p_new jsonb, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare me public.profiles; d public.documents; v_key uuid; v_old jsonb; v_id uuid; a record; v_allowed text[];
begin
  me := public._require(array['registry_officer', 'system_administrator']::public.user_role[]);
  d := public._doc(p_doc);
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'Give a reason for the correction.' using errcode = 'P0001'; end if;
  if d.direction = 'outgoing' and d.status = 'draft' then
    raise exception 'A draft can be edited directly. Corrections are for saved (locked) records.' using errcode = 'P0001';
  end if;
  v_allowed := case p_table
    when 'documents' then array['subject','document_type_id','category_id','priority','classification','office_only',
                                'number_of_pages','number_of_attachments','physical_file_location']
    when 'incoming_details' then array['sender_organisation_id','sender_organisation_text','sender_name','sender_title',
                                'delivered_by_name','delivered_by_phone','delivered_by_id_seen','delivery_method',
                                'sender_reference','sender_reference_date','response_required','response_due_date']
    when 'outgoing_details' then array['signatory','signed_by_user_id','delegated_officer_name','feedback_required',
                                'feedback_due_date','feedback_officer_id']
    when 'outgoing_recipients' then array['organisation_id','organisation_text','recipient_name','recipient_title']
    else null end;
  if v_allowed is null or not (p_field = any(v_allowed)) then
    raise exception 'That field cannot be corrected.' using errcode = 'P0001';
  end if;
  v_key := p_doc;
  if p_table = 'outgoing_recipients' then
    v_key := nullif(p_new ->> '_row_id', '')::uuid;
    if v_key is null or not exists (select 1 from public.outgoing_recipients where id = v_key and document_id = p_doc) then
      raise exception 'Choose the recipient to correct.' using errcode = 'P0001';
    end if;
    p_new := p_new - '_row_id';
  end if;
  execute format('select to_jsonb(t) -> %L from public.%I t where %I = $1', p_field, p_table,
                 case when p_table in ('documents', 'outgoing_recipients') then 'id' else 'document_id' end)
    into v_old using v_key;
  if v_old is not distinct from (p_new -> 'value') then
    raise exception 'The new value is the same as the current one.' using errcode = 'P0001';
  end if;
  insert into public.correction_requests (document_id, target_table, target_row_id, field_name, old_value, new_value, reason, requested_by)
  values (p_doc, p_table, v_key, p_field, v_old, p_new -> 'value', trim(p_reason), me.id)
  returning id into v_id;
  for a in select id from public.profiles where role = 'system_administrator' and is_active and id <> me.id loop
    perform public._notify(a.id, 'correction_request', p_doc, 'Correction requested on ' || d.reference_number,
                           p_field || ': ' || trim(p_reason));
  end loop;
  return v_id;
end $$;

create or replace function public.decide_correction(p_id uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; c public.correction_requests; v_keycol text; d public.documents;
begin
  me := public._require(array['system_administrator']::public.user_role[]);
  select * into c from public.correction_requests where id = p_id;
  if not found then raise exception 'Correction request not found.' using errcode = 'P0001'; end if;
  if c.status <> 'pending' then raise exception 'This request has already been decided.' using errcode = 'P0001'; end if;
  if c.requested_by = me.id then
    raise exception 'You cannot decide your own request. The other administrator must.' using errcode = 'P0001';
  end if;
  if not p_approve and nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception 'Give a reason for rejecting.' using errcode = 'P0001';
  end if;
  select * into d from public.documents where id = c.document_id;
  if p_approve then
    v_keycol := case when c.target_table in ('documents', 'outgoing_recipients') then 'id' else 'document_id' end;
    perform set_config('app.correction_id', c.id::text, true);
    execute format('update public.%I set %I = (jsonb_populate_record(null::public.%I, $1)).%I where %I = $2',
                   c.target_table, c.field_name, c.target_table, c.field_name, v_keycol)
      using jsonb_build_object(c.field_name, c.new_value), c.target_row_id;
    perform set_config('app.correction_id', '', true);
  end if;
  update public.correction_requests
     set status = case when p_approve then 'approved' else 'rejected' end::public.correction_status,
         reviewed_by = me.id, reviewed_at = now(), review_note = nullif(trim(coalesce(p_note, '')), ''),
         applied_at = case when p_approve then now() end
   where id = p_id;
  perform public._notify(c.requested_by, 'correction_decision', c.document_id,
                         'Correction ' || case when p_approve then 'approved' else 'rejected' end || ': ' || d.reference_number,
                         c.field_name);
end $$;

-- -----------------------------------------------------------------------------
-- 10. Scheduled jobs (called by the server with the service role only)
-- -----------------------------------------------------------------------------
create or replace function public.run_alerts()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_due int := 0; v_over int := 0; v_unack int := 0; v_fb int := 0; v_sum int := 0;
        r record; a record; v_overdue int; v_fbo int; v_today timestamptz;
begin
  v_today := date_trunc('day', now() at time zone 'Africa/Juba') at time zone 'Africa/Juba';

  for r in select d.id, d.reference_number, d.subject, d.current_holder_id, d.due_at from public.documents d
            where d.direction = 'incoming' and not d.is_voided and d.status not in ('closed', 'filed')
              and d.due_at > now() and d.due_at <= now() + interval '24 hours'
              and d.current_holder_id is not null
              and not exists (select 1 from public.notifications n where n.document_id = d.id
                              and n.notification_type = 'due_in_24_hours' and n.created_at > d.due_at - interval '25 hours') loop
    perform public._notify(r.current_holder_id, 'due_in_24_hours', r.id, 'Due within 24 hours: ' || r.reference_number, r.subject);
    v_due := v_due + 1;
  end loop;

  for r in select d.id, d.reference_number, d.subject, d.current_holder_id from public.documents d
            where d.direction = 'incoming' and not d.is_voided and d.status not in ('closed', 'filed')
              and d.due_at < now() and d.current_holder_id is not null
              and not exists (select 1 from public.notifications n where n.document_id = d.id
                              and n.notification_type = 'overdue' and n.created_at >= d.due_at) loop
    perform public._notify(r.current_holder_id, 'overdue', r.id, 'Overdue: ' || r.reference_number, r.subject);
    v_over := v_over + 1;
  end loop;

  for r in select m.id, m.document_id, m.to_user_id, m.moved_at, d.reference_number from public.document_movements m
            join public.documents d on d.id = m.document_id
            where m.acknowledged_at is null and m.to_user_id is not null and not d.is_voided
              and m.moved_at < now() - make_interval(hours => coalesce((public.setting('acknowledge_within_hours'))::int, 24))
              and d.status not in ('closed', 'filed') and d.current_holder_id = m.to_user_id
              and not exists (select 1 from public.notifications n where n.document_id = m.document_id
                              and n.user_id = m.to_user_id and n.notification_type = 'unacknowledged'
                              and n.created_at >= m.moved_at) loop
    perform public._notify(r.to_user_id, 'unacknowledged', r.document_id,
                           'Please acknowledge receipt: ' || r.reference_number, 'Handed to you more than 24 hours ago.');
    v_unack := v_unack + 1;
  end loop;

  for r in select f.id, f.reference_number, f.subject, f.feedback_officer_id, f.days_overdue, d.office_id, od.drafted_by, od.feedback_due_date
             from public.v_feedback_overdue f
             join public.documents d on d.id = f.id
             join public.outgoing_details od on od.document_id = f.id loop
    -- alert once per document; the follow-up officer, the drafter and the issuing office's executives/administrators
    for a in select p.id from public.profiles p
              where p.is_active and (p.id in (r.feedback_officer_id, r.drafted_by)
                    or (p.office_id = r.office_id and p.role in ('executive_viewer', 'system_administrator'))) loop
      if not exists (select 1 from public.notifications n where n.document_id = r.id and n.user_id = a.id
                     and n.notification_type = 'feedback_overdue') then
        perform public._notify(a.id, 'feedback_overdue', r.id, 'Feedback overdue: ' || r.reference_number,
                               r.subject || ' (' || r.days_overdue || ' day(s) overdue)');
        v_fb := v_fb + 1;
      end if;
    end loop;
  end loop;

  select count(*) into v_overdue from public.documents
   where direction = 'incoming' and not is_voided and status not in ('closed', 'filed') and due_at < now();
  select count(*) into v_fbo from public.v_feedback_overdue;
  if v_overdue + v_fbo > 0 then
    for a in select p.id from public.profiles p
              where p.is_active and p.role in ('system_administrator', 'executive_viewer')
                and not exists (select 1 from public.notifications n where n.user_id = p.id
                                and n.notification_type = 'daily_overdue_summary' and n.created_at >= v_today) loop
      perform public._notify(a.id, 'daily_overdue_summary', null, 'Daily summary: overdue items',
                             v_overdue || ' incoming item(s) overdue; ' || v_fbo || ' outgoing item(s) past their feedback due date.');
      v_sum := v_sum + 1;
    end loop;
  end if;
  return jsonb_build_object('due_soon', v_due, 'overdue', v_over, 'unacknowledged', v_unack,
                            'feedback_overdue', v_fb, 'daily_summaries', v_sum);
end $$;

create or replace function public.record_integrity_check(p_version uuid, p_sha256 text, p_result public.integrity_result)
returns void language plpgsql security definer set search_path = public as $$
declare v public.document_file_versions; a record;
begin
  select * into v from public.document_file_versions where id = p_version;
  if not found then raise exception 'File version not found.'; end if;
  insert into public.file_integrity_checks (file_version_id, computed_sha256, result, admins_alerted_at)
  values (p_version, p_sha256, p_result, case when p_result <> 'match' then now() end);
  if p_result <> 'match' then
    perform public.write_audit('integrity_check_failed', v.document_id, 'document_file_versions', p_version::text,
                               jsonb_build_object('expected', v.sha256, 'computed', p_sha256, 'result', p_result));
    for a in select id from public.profiles where role = 'system_administrator' and is_active loop
      perform public._notify(a.id, 'integrity_alert', v.document_id, 'File integrity alert',
                             'A stored file does not match its fingerprint (' || p_result || '): ' || v.storage_path);
    end loop;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 11. Report views (security_invoker: the viewer's own access rules apply)
-- -----------------------------------------------------------------------------
create view public.v_incoming_register with (security_invoker = true) as
select d.id, d.reference_number, o.code as office, d.registered_at, d.received_at,
       coalesce(org.name, i.sender_organisation_text) as sender_organisation,
       i.sender_name, i.sender_title, i.delivered_by_name, i.delivered_by_phone, i.delivered_by_id_seen,
       i.delivery_method, i.sender_reference, i.sender_reference_date,
       d.subject, dt.name as document_type, c.name as category, d.priority, d.classification,
       i.response_required, i.response_due_date, d.status, h.full_name as holder, d.due_at,
       d.number_of_pages, d.number_of_attachments, d.physical_file_location, d.closing_note, d.is_voided,
       (d.status not in ('closed', 'filed') and not d.is_voided and d.due_at < now()) as is_overdue
from public.documents d
join public.incoming_details i on i.document_id = d.id
join public.offices o on o.id = d.office_id
join public.document_types dt on dt.id = d.document_type_id
join public.categories c on c.id = d.category_id
left join public.organisations org on org.id = i.sender_organisation_id
left join public.profiles h on h.id = d.current_holder_id;

create view public.v_outgoing_register with (security_invoker = true) as
select d.id, d.reference_number, o.code as office, d.registered_at, od.dispatched_at,
       dr.full_name as drafted_by,
       case od.signatory when 'chairperson' then 'Chairperson' when 'secretary_general' then 'Secretary General'
            else coalesce(sg.full_name, od.delegated_officer_name, 'Delegated officer') end as signed_by,
       (select string_agg(coalesce(org.name, r.organisation_text) || coalesce(' (' || r.recipient_name || ')', ''), '; ' order by r.sort_order)
          from public.outgoing_recipients r left join public.organisations org on org.id = r.organisation_id
         where r.document_id = d.id and r.recipient_type = 'to') as recipients,
       (select string_agg(coalesce(org.name, r.organisation_text), '; ' order by r.sort_order)
          from public.outgoing_recipients r left join public.organisations org on org.id = r.organisation_id
         where r.document_id = d.id and r.recipient_type = 'cc') as cc,
       d.subject, dt.name as document_type, c.name as category, d.priority, d.classification,
       od.dispatch_method, od.dispatched_by_name, od.delivered_at, od.proof_of_delivery_note,
       od.feedback_required, od.feedback_due_date, fo.full_name as feedback_officer, od.feedback_received_at,
       d.status, d.closing_note, d.is_voided
from public.documents d
join public.outgoing_details od on od.document_id = d.id
join public.offices o on o.id = d.office_id
join public.document_types dt on dt.id = d.document_type_id
join public.categories c on c.id = d.category_id
join public.profiles dr on dr.id = od.drafted_by
left join public.profiles sg on sg.id = od.signed_by_user_id
left join public.profiles fo on fo.id = od.feedback_officer_id;

create view public.v_feedback_tracker with (security_invoker = true) as
select d.id, d.reference_number, o.code as office, d.subject,
       (select string_agg(coalesce(org.name, r.organisation_text), '; ' order by r.sort_order)
          from public.outgoing_recipients r left join public.organisations org on org.id = r.organisation_id
         where r.document_id = d.id and r.recipient_type = 'to') as recipients,
       od.dispatched_at, od.delivered_at, od.feedback_due_date, fo.full_name as feedback_officer,
       od.feedback_received_at, fb.reference_number as reply_reference, d.status,
       case when od.feedback_received_at is not null then 'Received'
            when od.feedback_due_date < (now() at time zone 'Africa/Juba')::date then 'Overdue'
            else 'Pending' end as feedback_status,
       greatest((now() at time zone 'Africa/Juba')::date - od.feedback_due_date, 0) as days_overdue,
       d.is_voided
from public.outgoing_details od
join public.documents d on d.id = od.document_id
join public.offices o on o.id = d.office_id
left join public.profiles fo on fo.id = od.feedback_officer_id
left join public.documents fb on fb.id = od.feedback_document_id
where od.feedback_required;

create view public.v_correspondence with (security_invoker = true) as
select coalesce(org.name, i.sender_organisation_text) as organisation, 'Incoming'::text as direction,
       d.id, d.reference_number, d.registered_at as at, d.subject, d.status, d.is_voided
from public.documents d
join public.incoming_details i on i.document_id = d.id
left join public.organisations org on org.id = i.sender_organisation_id
union all
select coalesce(org.name, r.organisation_text), 'Outgoing', d.id, d.reference_number, d.registered_at, d.subject, d.status, d.is_voided
from public.documents d
join public.outgoing_recipients r on r.document_id = d.id
left join public.organisations org on org.id = r.organisation_id;

-- Everything that happened to one document, in order.
create view public.v_document_history with (security_invoker = true) as
select d.id as document_id, d.registered_at as at, 'Registered'::text as kind,
       p.full_name as by_name, null::text as from_name, null::text as to_name,
       'Registered as ' || d.reference_number as detail
from public.documents d join public.profiles p on p.id = d.registered_by
union all
select m.document_id, m.moved_at,
       case m.movement_type when 'routed' then 'Routed' when 'forwarded' then 'Forwarded' when 'returned' then 'Returned'
            when 'reassigned' then 'Reassigned' else 'Physical file moved' end,
       mb.full_name, fu.full_name, coalesce(tu.full_name, m.to_physical_location), m.reason
from public.document_movements m
join public.profiles mb on mb.id = m.moved_by
left join public.profiles fu on fu.id = m.from_user_id
left join public.profiles tu on tu.id = m.to_user_id
union all
select m.document_id, m.acknowledged_at, 'Acknowledged', ab.full_name, null, null, 'Receipt acknowledged'
from public.document_movements m join public.profiles ab on ab.id = m.acknowledged_by
where m.acknowledged_at is not null
union all
select mi.document_id, mi.created_at, 'Minute', a.full_name, null, t.full_name, mi.minute_text
from public.document_minutes mi join public.profiles a on a.id = mi.author_id
left join public.profiles t on t.id = mi.directed_to_user_id
union all
select ac.document_id, ac.created_at,
       case ac.action_type when 'comment' then 'Comment' when 'action_taken' then 'Action taken'
            when 'feedback' then 'Feedback' when 'task_completed' then 'Task completed' else 'Clarification requested' end,
       u.full_name, null, null, ac.action_text
from public.document_actions ac join public.profiles u on u.id = ac.user_id
union all
select dc.document_id, dc.changed_at, 'Due date changed', u.full_name, null, null,
       'New due date ' || to_char(dc.new_due_at at time zone 'Africa/Juba', 'DD/MM/YYYY HH24:MI') || '. ' || dc.reason
from public.due_date_changes dc join public.profiles u on u.id = dc.changed_by
union all
select v.document_id, v.uploaded_at, 'File version', u.full_name, null, null,
       'Version ' || v.version_number || ' of ' || f.file_kind::text || coalesce('. ' || v.reason, '')
from public.document_file_versions v join public.document_files f on f.id = v.file_id
join public.profiles u on u.id = v.uploaded_by
union all
select c.document_id, c.requested_at, 'Correction requested', u.full_name, null, null,
       c.field_name || ': ' || coalesce(c.old_value::text, 'empty') || ' to ' || coalesce(c.new_value::text, 'empty') || '. ' || c.reason
from public.correction_requests c join public.profiles u on u.id = c.requested_by
union all
select c.document_id, c.reviewed_at, 'Correction ' || c.status::text, u.full_name, null, null,
       c.field_name || coalesce('. ' || c.review_note, '')
from public.correction_requests c join public.profiles u on u.id = c.reviewed_by
where c.status <> 'pending'
union all
select d.id, d.closed_at, case d.status when 'filed' then 'Filed' else 'Closed' end, u.full_name, null, null, d.closing_note
from public.documents d join public.profiles u on u.id = d.closed_by where d.closed_at is not null
union all
select d.id, d.voided_at, 'Voided', u.full_name, null, null, d.void_reason
from public.documents d join public.profiles u on u.id = d.voided_by where d.is_voided;

create or replace function public.report_monthly_summary(p_from date, p_to date)
returns table(section text, label text, value text)
language sql stable security invoker set search_path = public as $$
  with w as (select (p_from::timestamp at time zone 'Africa/Juba') as t0,
                    ((p_to + 1)::timestamp at time zone 'Africa/Juba') as t1)
  select 'Incoming received', o.code, count(*)::text
    from public.documents d join public.offices o on o.id = d.office_id, w
   where d.direction = 'incoming' and not d.is_voided and d.registered_at >= w.t0 and d.registered_at < w.t1 group by o.code
  union all
  select 'Outgoing dispatched', o.code, count(*)::text
    from public.outgoing_details od join public.documents d on d.id = od.document_id
    join public.offices o on o.id = d.office_id, w
   where not d.is_voided and od.dispatched_at >= w.t0 and od.dispatched_at < w.t1 group by o.code
  union all
  select 'Incoming by category', c.name, count(*)::text
    from public.documents d join public.categories c on c.id = d.category_id, w
   where d.direction = 'incoming' and not d.is_voided and d.registered_at >= w.t0 and d.registered_at < w.t1 group by c.name
  union all
  select 'Incoming by priority', d.priority::text, count(*)::text
    from public.documents d, w
   where d.direction = 'incoming' and not d.is_voided and d.registered_at >= w.t0 and d.registered_at < w.t1 group by d.priority
  union all
  select 'Closed in period', case d.status when 'filed' then 'Filed (no action)' else 'Closed' end, count(*)::text
    from public.documents d, w
   where not d.is_voided and d.closed_at >= w.t0 and d.closed_at < w.t1 group by d.status
  union all
  select 'Average days to close (incoming)', 'Days', coalesce(round(avg(extract(epoch from (d.closed_at - d.registered_at)) / 86400)::numeric, 1)::text, '-')
    from public.documents d, w
   where d.direction = 'incoming' and d.status = 'closed' and not d.is_voided and d.closed_at >= w.t0 and d.closed_at < w.t1
  union all
  select 'Open now', 'Incoming items still open', count(*)::text
    from public.documents d where d.direction = 'incoming' and not d.is_voided and d.status not in ('closed', 'filed')
  union all
  select 'Open now', 'Incoming items overdue', count(*)::text
    from public.documents d where d.direction = 'incoming' and not d.is_voided and d.status not in ('closed', 'filed') and d.due_at < now()
  union all
  select 'Open now', 'Outgoing items past feedback due date', count(*)::text from public.v_feedback_overdue
  union all
  select 'Voided in period', 'Records voided', count(*)::text from public.documents d, w where d.voided_at >= w.t0 and d.voided_at < w.t1
$$;

-- -----------------------------------------------------------------------------
-- 12. Search and dashboard (security invoker: classification rules apply)
-- -----------------------------------------------------------------------------
create or replace function public.search_documents(
  p_q text default null, p_direction public.document_direction default null,
  p_statuses public.document_status[] default null, p_priority public.priority_level default null,
  p_classification public.classification_level default null, p_office smallint default null,
  p_category integer default null, p_from date default null, p_to date default null,
  p_holder uuid default null, p_overdue boolean default false, p_voided boolean default false,
  p_limit integer default 50, p_offset integer default 0)
returns table(id uuid, reference_number text, direction public.document_direction, office_code text, subject text,
              status public.document_status, priority public.priority_level, classification public.classification_level,
              registered_at timestamptz, due_at timestamptz, party text, holder_name text,
              is_overdue boolean, days_overdue integer, is_voided boolean, snippet text, total_count bigint)
language plpgsql stable security invoker set search_path = public as $$
declare v_q text := nullif(trim(coalesce(p_q, '')), ''); v_tsq tsquery;
begin
  if v_q is not null then v_tsq := websearch_to_tsquery('english', v_q); end if;
  return query
  select d.id, d.reference_number, d.direction, o.code, d.subject, d.status, d.priority, d.classification,
         d.registered_at, d.due_at,
         case when d.direction = 'incoming'
              then coalesce(org.name, i.sender_organisation_text, '') || ' / ' || coalesce(i.sender_name, '')
              else (select string_agg(coalesce(ro.name, r.organisation_text), '; ' order by r.sort_order)
                      from public.outgoing_recipients r left join public.organisations ro on ro.id = r.organisation_id
                     where r.document_id = d.id and r.recipient_type = 'to') end,
         h.full_name,
         (d.status not in ('closed', 'filed') and not d.is_voided and d.due_at < now()),
         case when d.status not in ('closed', 'filed') and not d.is_voided and d.due_at < now()
              then (now()::date - d.due_at::date) end,
         d.is_voided,
         case when v_tsq is null then null
              else (select ts_headline('english', v.ocr_text, v_tsq, 'MaxFragments=1,MaxWords=20,MinWords=8')
                      from public.document_file_versions v
                     where v.document_id = d.id and v.ocr_tsv @@ v_tsq limit 1) end,
         count(*) over ()
    from public.documents d
    join public.offices o on o.id = d.office_id
    left join public.incoming_details i on i.document_id = d.id
    left join public.organisations org on org.id = i.sender_organisation_id
    left join public.profiles h on h.id = d.current_holder_id
   where (p_voided or not d.is_voided)
     and (p_direction is null or d.direction = p_direction)
     and (p_statuses is null or d.status = any(p_statuses))
     and (p_priority is null or d.priority = p_priority)
     and (p_classification is null or d.classification = p_classification)
     and (p_office is null or d.office_id = p_office)
     and (p_category is null or d.category_id = p_category)
     and (p_holder is null or d.current_holder_id = p_holder)
     and (p_from is null or (coalesce(d.received_at, d.registered_at) at time zone 'Africa/Juba')::date >= p_from)
     and (p_to is null or (coalesce(d.received_at, d.registered_at) at time zone 'Africa/Juba')::date <= p_to)
     and (not p_overdue or (d.status not in ('closed', 'filed') and d.due_at < now()))
     and (v_q is null
          or d.search_vector @@ v_tsq
          or d.reference_number ilike '%' || v_q || '%'
          or d.subject ilike '%' || v_q || '%'
          or coalesce(org.name, i.sender_organisation_text, '') ilike '%' || v_q || '%'
          or coalesce(i.sender_name, '') ilike '%' || v_q || '%'
          or coalesce(i.sender_reference, '') ilike '%' || v_q || '%'
          or exists (select 1 from public.outgoing_recipients r left join public.organisations ro on ro.id = r.organisation_id
                      where r.document_id = d.id and (coalesce(ro.name, r.organisation_text, '') ilike '%' || v_q || '%'
                                                      or coalesce(r.recipient_name, '') ilike '%' || v_q || '%'))
          or exists (select 1 from public.document_file_versions v where v.document_id = d.id and v.ocr_tsv @@ v_tsq))
   order by d.registered_at desc
   limit least(coalesce(p_limit, 50), 200) offset greatest(coalesce(p_offset, 0), 0);
end $$;

create or replace function public.dashboard_summary()
returns jsonb language sql stable security invoker set search_path = public as $$
  with b as (
    select (date_trunc('week', now() at time zone 'Africa/Juba') at time zone 'Africa/Juba') as week_start,
           (date_trunc('month', now() at time zone 'Africa/Juba') at time zone 'Africa/Juba') as month_start)
  select jsonb_build_object(
    'received', (select coalesce(jsonb_agg(jsonb_build_object('office', code, 'week', w, 'month', m) order by code), '[]')
                   from (select o.code,
                                count(d.id) filter (where d.registered_at >= b.week_start) w,
                                count(d.id) m
                           from b cross join public.offices o
                           left join public.documents d on d.office_id = o.id and d.direction = 'incoming'
                                and not d.is_voided and d.registered_at >= b.month_start
                          group by o.code) t),
    'dispatched', (select coalesce(jsonb_agg(jsonb_build_object('office', code, 'week', w, 'month', m) order by code), '[]')
                   from (select o.code,
                                count(od.document_id) filter (where od.dispatched_at >= b.week_start) w,
                                count(od.document_id) m
                           from b cross join public.offices o
                           left join public.documents d on d.office_id = o.id and d.direction = 'outgoing' and not d.is_voided
                           left join public.outgoing_details od on od.document_id = d.id and od.dispatched_at >= b.month_start
                          group by o.code) t),
    'open_by_status', (select coalesce(jsonb_agg(jsonb_build_object('status', status, 'count', c) order by c desc), '[]')
                         from (select status, count(*) c from public.documents
                                where not is_voided and status not in ('closed', 'filed') group by status) t),
    'open_by_officer', (select coalesce(jsonb_agg(jsonb_build_object('officer', name, 'open', c, 'overdue', od) order by c desc), '[]')
                          from (select coalesce(p.full_name, 'Unassigned') as name, count(*) c,
                                       count(*) filter (where d.due_at < now()) od
                                  from public.documents d left join public.profiles p on p.id = d.current_holder_id
                                 where not d.is_voided and d.status not in ('closed', 'filed') group by 1) t),
    'overdue', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'reference', reference_number, 'subject', subject,
                          'holder', current_holder_name, 'days_overdue', days_overdue, 'due_at', due_at, 'priority', priority)
                          order by days_overdue desc, due_at), '[]')
                  from (select * from public.v_document_tracker where is_overdue and direction = 'incoming'
                         order by days_overdue desc limit 25) t),
    'feedback_overdue', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'reference', reference_number, 'subject', subject,
                          'officer', feedback_officer_name, 'days_overdue', days_overdue, 'due', feedback_due_date)
                          order by days_overdue desc), '[]') from public.v_feedback_overdue),
    'urgent_24h', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'reference', reference_number, 'subject', subject,
                          'holder', current_holder_name, 'registered_at', registered_at, 'status', status)
                          order by registered_at desc), '[]')
                     from public.v_document_tracker
                    where direction = 'incoming' and priority = 'urgent' and not is_voided
                      and registered_at >= now() - interval '24 hours'),
    'unacknowledged', (select count(*) from public.v_unacknowledged_movements)
  )
$$;

-- -----------------------------------------------------------------------------
-- 13. Storage: Registry Officers upload through the app server (with their session)
-- -----------------------------------------------------------------------------
create policy upload_document_files_registry on storage.objects for insert to authenticated
  with check (bucket_id = 'document-files'
              and public.is_session_permitted()
              and public.has_role('registry_officer')
              and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$');

-- -----------------------------------------------------------------------------
-- 14. Grants: new objects start with the platform defaults, so set them explicitly
-- -----------------------------------------------------------------------------
revoke all on all functions in schema public from public, anon;
revoke execute on function
  public._require(public.user_role[]), public._doc(uuid, boolean),
  public._notify(uuid, public.notification_type, uuid, text, text), public._check_routable(uuid),
  public._grant_access(uuid, uuid, public.access_type, uuid), public._assign_primary(uuid, uuid, uuid, text),
  public._add_file(uuid, public.file_kind, uuid, jsonb, text, text, uuid), public._pw_fp(uuid),
  public.run_alerts(), public.record_integrity_check(uuid, text, public.integrity_result)
from authenticated;

grant execute on function
  public.admin_create_profile(uuid, text, public.user_role, smallint, integer, text, text),
  public.admin_update_user(uuid, text, public.user_role, smallint, integer, text, text, boolean),
  public.admin_suspend_user(uuid, text), public.admin_reactivate_user(uuid), public.admin_unlock_user(uuid),
  public.admin_mark_password_reset(uuid), public.complete_password_change(),
  public.save_organisation(uuid, text, text, text, text, text, boolean),
  public.save_contact(uuid, uuid, text, text, text, text, boolean),
  public.admin_save_lookup(text, integer, text, boolean, integer, smallint),
  public.admin_set_priority_hours(public.priority_level, integer), public.admin_set_setting(text, jsonb),
  public.register_incoming(jsonb), public.get_receipt_slip(uuid),
  public.register_outgoing(jsonb), public.update_outgoing_draft(uuid, jsonb),
  public.add_file_version(uuid, public.file_kind, uuid, jsonb, text, text),
  public.finalise_outgoing(uuid, uuid, jsonb),
  public.dispatch_outgoing(uuid, public.delivery_method, text, timestamptz),
  public.confirm_delivery(uuid, timestamptz, text, uuid, jsonb), public.link_feedback(uuid, uuid),
  public.route_document(uuid, uuid, text, uuid[]), public.forward_document(uuid, uuid, text),
  public.return_document(uuid, text), public.record_physical_move(uuid, text, text),
  public.acknowledge_receipt(uuid), public.add_minute(uuid, text, uuid),
  public.record_action(uuid, public.action_type, text), public.set_hold(uuid, boolean, text),
  public.close_document(uuid, text, text), public.change_due_date(uuid, timestamptz, text),
  public.void_document(uuid, text), public.grant_named_recipient(uuid, uuid),
  public.request_correction(uuid, text, text, jsonb, text), public.decide_correction(uuid, boolean, text),
  public.report_monthly_summary(date, date),
  public.search_documents(text, public.document_direction, public.document_status[], public.priority_level,
                          public.classification_level, smallint, integer, date, date, uuid, boolean, boolean, integer, integer),
  public.dashboard_summary()
to authenticated;

grant execute on function public.run_alerts(), public.record_integrity_check(uuid, text, public.integrity_result) to service_role;

revoke all on public.v_incoming_register, public.v_outgoing_register, public.v_feedback_tracker,
              public.v_correspondence, public.v_document_history from anon;
grant select on public.v_incoming_register, public.v_outgoing_register, public.v_feedback_tracker,
                public.v_correspondence, public.v_document_history to authenticated;
