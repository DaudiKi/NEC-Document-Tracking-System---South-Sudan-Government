'use server';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { guard, rpc, str, opt, bool, need, UserError, friendly } from '@/lib/actions';
import { storeFile } from '@/lib/files';
import { catToIso } from '@/lib/format';
import { resolveRefs } from '@/lib/refs';
import { requireUser } from '@/lib/auth';

const done = (id: string, msg: string) => { revalidatePath(`/documents/${id}`); return msg; };
const docId = (fd: FormData) => need(opt(fd, 'id'), 'Document');

export const acknowledge = guard(async (fd) => {
  const id = docId(fd);
  await rpc('acknowledge_receipt', { p_doc: id });
  return done(id, 'Receipt acknowledged.');
});

export const recordAction = guard(async (fd) => {
  const id = docId(fd);
  await rpc('record_action', { p_doc: id, p_type: need(opt(fd, 'type'), 'Type'), p_text: need(opt(fd, 'text'), 'Text') });
  return done(id, 'Recorded.');
});

export const forward = guard(async (fd) => {
  const id = docId(fd);
  await rpc('forward_document', { p_doc: id, p_to: need(opt(fd, 'to'), 'Forward to'), p_reason: need(opt(fd, 'reason'), 'Reason') });
  return done(id, 'Forwarded. The new holder has been notified and must acknowledge receipt.');
});

export const returnForClarification = guard(async (fd) => {
  const id = docId(fd);
  await rpc('return_document', { p_doc: id, p_reason: need(opt(fd, 'reason'), 'Reason') });
  return done(id, 'Returned to the registry for clarification.');
});

export const setHold = guard(async (fd) => {
  const id = docId(fd);
  const hold = str(fd, 'hold') === 'true';
  await rpc('set_hold', { p_doc: id, p_hold: hold, p_reason: need(opt(fd, 'reason'), 'Reason') });
  return done(id, hold ? 'Put on hold.' : 'Resumed.');
});

export const closeDocument = guard(async (fd) => {
  const id = docId(fd);
  await rpc('close_document', { p_doc: id, p_note: need(opt(fd, 'note'), 'Closing note'), p_outcome: opt(fd, 'outcome') ?? 'closed' });
  return done(id, 'Closed.');
});

export const route = guard(async (fd) => {
  const id = docId(fd);
  await rpc('route_document', {
    p_doc: id, p_to: need(opt(fd, 'to'), 'Route to'), p_reason: need(opt(fd, 'reason'), 'Reason'),
    p_cc: fd.getAll('cc').map(String).filter(Boolean),
  });
  return done(id, 'Routed. The new holder has been notified and must acknowledge receipt.');
});

export const changeDue = guard(async (fd) => {
  const id = docId(fd);
  await rpc('change_due_date', { p_doc: id, p_new_due: catToIso(need(opt(fd, 'due'), 'New due date')), p_reason: need(opt(fd, 'reason'), 'Reason') });
  return done(id, 'Due date changed and the reason recorded.');
});

export const physicalMove = guard(async (fd) => {
  const id = docId(fd);
  await rpc('record_physical_move', { p_doc: id, p_location: need(opt(fd, 'location'), 'New location'), p_reason: need(opt(fd, 'reason'), 'Reason') });
  return done(id, 'Physical file movement recorded.');
});

export const voidDocument = guard(async (fd) => {
  const id = docId(fd);
  await rpc('void_document', { p_doc: id, p_reason: need(opt(fd, 'reason'), 'Reason') });
  return done(id, 'Voided. The record stays in the database and in reports, marked as voided.');
});

export const addMinute = guard(async (fd) => {
  const id = docId(fd);
  await rpc('add_minute', { p_doc: id, p_text: need(opt(fd, 'text'), 'Instruction'), p_directed_to: opt(fd, 'to') });
  return done(id, 'Instruction recorded. The action officer will see it first.');
});

export const grantAccess = guard(async (fd) => {
  const id = docId(fd);
  await rpc('grant_named_recipient', { p_doc: id, p_user: need(opt(fd, 'to'), 'Person') });
  return done(id, 'Access granted. This is recorded in the audit trail.');
});

// ---- corrections ------------------------------------------------------------------------
export const requestCorrection = guard(async (fd) => {
  const id = docId(fd);
  const [table, field, kind] = need(opt(fd, 'field'), 'Field to correct').split('|');
  const raw = str(fd, 'value');
  let value: unknown = raw === '' ? null : raw;
  if (kind === 'number' || kind === 'selectNum') value = raw === '' ? null : Number(raw);
  if (kind === 'bool') value = raw === 'true';
  if (kind === 'text' && raw === '' && ['subject', 'sender_name', 'sender_title', 'delivered_by_name', 'physical_file_location'].includes(field)) {
    throw new UserError('This field cannot be empty.');
  }
  const p_new: Record<string, unknown> = { value };
  if (table === 'outgoing_recipients') p_new._row_id = need(opt(fd, 'row_id'), 'Recipient');
  await rpc('request_correction', { p_doc: id, p_table: table, p_field: field, p_new, p_reason: need(opt(fd, 'reason'), 'Reason') });
  return done(id, 'Correction requested. An Administrator will approve or reject it. The saved record stays as it is until then.');
});

// ---- files -------------------------------------------------------------------------------
async function nextVersion(fileId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from('document_file_versions').select('version_number').eq('file_id', fileId).order('version_number', { ascending: false }).limit(1);
  return (data?.[0]?.version_number ?? 0) + 1;
}

export const addFileVersion = guard(async (fd) => {
  const { supabase } = await requireUser(['registry_officer']);
  const id = docId(fd);
  const kind = need(opt(fd, 'kind'), 'File type');
  let existing = opt(fd, 'file_id');
  if (kind === 'main_scan') {
    const { data } = await supabase.from('document_files').select('id').eq('document_id', id).eq('file_kind', 'main_scan').maybeSingle();
    existing = data?.id ?? null;
    if (!existing) throw new UserError('This document has no main scan to replace.');
  }
  const fileId = existing ?? randomUUID();
  const version = existing ? await nextVersion(existing) : 1;
  if (existing && !opt(fd, 'reason')) throw new UserError('Say why the file is being replaced. The original stays in the version history.');
  const meta = await storeFile(supabase, fd.get('file') as File | null, id, fileId, version);
  const { error } = await supabase.rpc('add_file_version', {
    p_doc: id, p_kind: kind, p_file_id: fileId, p_meta: meta, p_title: opt(fd, 'title') ?? null, p_reason: opt(fd, 'reason'),
  });
  if (error) {
    await createAdminClient()?.storage.from('document-files').remove([meta.storage_path]);
    throw new UserError(friendly(error));
  }
  return done(id, existing ? `Version ${version} added. The earlier versions are kept.` : 'File added.');
});

// ---- outgoing lifecycle --------------------------------------------------------------------
export const updateDraft = guard(async (fd) => {
  const id = docId(fd);
  const p: Record<string, unknown> = {
    subject: opt(fd, 'subject'), priority: opt(fd, 'priority'), classification: opt(fd, 'classification'),
    document_type_id: opt(fd, 'document_type_id'), category_id: opt(fd, 'category_id'), signatory: opt(fd, 'signatory'),
    delegated_officer_name: opt(fd, 'delegated_officer_name'),
    feedback_required: bool(fd, 'feedback_required'),
    feedback_due_date: bool(fd, 'feedback_required') ? opt(fd, 'feedback_due_date') : null,
    feedback_officer_id: bool(fd, 'feedback_required') ? opt(fd, 'feedback_officer_id') : null,
  };
  await rpc('update_outgoing_draft', { p_doc: id, p });
  return done(id, 'Draft saved.');
});

export const finalise = guard(async (fd) => {
  const { supabase } = await requireUser(['registry_officer']);
  const id = docId(fd);
  const fileId = randomUUID();
  const meta = await storeFile(supabase, fd.get('file') as File | null, id, fileId, 1);
  const { error } = await supabase.rpc('finalise_outgoing', { p_doc: id, p_file_id: fileId, p_meta: meta });
  if (error) {
    await createAdminClient()?.storage.from('document-files').remove([meta.storage_path]);
    throw new UserError(friendly(error));
  }
  return done(id, 'Marked Final. The record is now locked and the signed copy stored.');
});

export const dispatch = guard(async (fd) => {
  const id = docId(fd);
  await rpc('dispatch_outgoing', {
    p_doc: id, p_method: need(opt(fd, 'method'), 'Dispatch method'), p_by_name: need(opt(fd, 'by_name'), 'Dispatched by'),
    p_at: catToIso(str(fd, 'at')) ?? new Date().toISOString(),
  });
  return done(id, 'Dispatched.');
});

export const confirmDelivery = guard(async (fd) => {
  const { supabase } = await requireUser(['registry_officer']);
  const id = docId(fd);
  const file = fd.get('file') as File | null;
  let meta = null; const fileId = randomUUID();
  if (file && file.size > 0) meta = await storeFile(supabase, file, id, fileId, 1);
  const { error } = await supabase.rpc('confirm_delivery', {
    p_doc: id, p_delivered_at: catToIso(str(fd, 'at')) ?? new Date().toISOString(), p_note: opt(fd, 'note'), p_file_id: fileId, p_meta: meta,
  });
  if (error) {
    if (meta) await createAdminClient()?.storage.from('document-files').remove([meta.storage_path]);
    throw new UserError(friendly(error));
  }
  return done(id, 'Delivery recorded.');
});

export const linkFeedback = guard(async (fd) => {
  const id = docId(fd);
  const [reply] = await resolveRefs(need(opt(fd, 'reply'), 'Reference of the incoming reply'));
  if (!reply) throw new UserError('Reference not found.');
  await rpc('link_feedback', { p_out: id, p_in: reply });
  return done(id, 'Feedback linked. The follow-up is closed.');
});
