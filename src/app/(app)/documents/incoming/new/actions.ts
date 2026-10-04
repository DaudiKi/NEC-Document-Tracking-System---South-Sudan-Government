'use server';
import { redirect } from 'next/navigation';
import { randomUUID } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { guard, str, opt, bool, num, need, UserError, friendly } from '@/lib/actions';
import { storeFile } from '@/lib/files';
import { catToIso } from '@/lib/format';
import { requireUser } from '@/lib/auth';
import { resolveRefs } from '@/lib/refs';

export const registerIncoming = guard(async (fd) => {
  const { supabase } = await requireUser(['registry_officer']);
  const docId = randomUUID();
  const fileId = randomUUID();
  const pages = num(fd, 'number_of_pages');
  if (!pages || pages < 1) throw new UserError('Enter the number of pages (at least 1).');
  const backfill = bool(fd, 'backfill');
  const responseRequired = bool(fd, 'response_required');
  if (responseRequired && !opt(fd, 'response_due_date')) throw new UserError('Enter the date a response is due.');
  if (!opt(fd, 'sender_organisation_id') && !opt(fd, 'sender_organisation_text')) throw new UserError('Choose the sender organisation, or type it.');
  if (backfill && (!opt(fd, 'manual_register_form_no') || !opt(fd, 'received_at'))) {
    throw new UserError('For an entry from the outage form, give the form number and the original receipt time.');
  }
  const file = fd.get('file') as File | null;
  const meta = await storeFile(supabase, file, docId, fileId, 1, { expectedPages: pages });
  const linked = await resolveRefs(str(fd, 'linked'));
  const cc = fd.getAll('cc').map(String).filter(Boolean);
  const payload = {
    document_id: docId, file_id: fileId,
    office_id: Number(need(opt(fd, 'office_id'), 'Receiving office')),
    subject: need(opt(fd, 'subject'), 'Subject'),
    document_type_id: Number(need(opt(fd, 'document_type_id'), 'Document type')),
    category_id: Number(need(opt(fd, 'category_id'), 'Category')),
    priority: need(opt(fd, 'priority'), 'Priority'),
    classification: need(opt(fd, 'classification'), 'Classification'),
    number_of_pages: pages, number_of_attachments: num(fd, 'number_of_attachments') ?? 0,
    physical_file_location: need(opt(fd, 'physical_file_location'), 'Physical file location'),
    sender_organisation_id: opt(fd, 'sender_organisation_id'), sender_organisation_text: opt(fd, 'sender_organisation_text'),
    sender_name: need(opt(fd, 'sender_name'), 'Sender name'), sender_title: need(opt(fd, 'sender_title'), 'Sender title'),
    delivered_by_name: need(opt(fd, 'delivered_by_name'), 'Delivered by'), delivered_by_phone: opt(fd, 'delivered_by_phone'),
    delivered_by_id_seen: bool(fd, 'delivered_by_id_seen'), delivery_method: need(opt(fd, 'delivery_method'), 'Delivery method'),
    sender_reference: opt(fd, 'sender_reference'), sender_reference_date: opt(fd, 'sender_reference_date'),
    response_required: responseRequired, response_due_date: responseRequired ? opt(fd, 'response_due_date') : null,
    routed_to: need(opt(fd, 'routed_to'), 'Routed to'), cc, minute: opt(fd, 'minute'), linked_document_ids: linked,
    entry_mode: backfill ? 'manual_register_backfill' : 'system',
    manual_register_form_no: backfill ? opt(fd, 'manual_register_form_no') : null,
    received_at: backfill ? catToIso(str(fd, 'received_at')) : null,
    file: meta,
  };
  const { data, error } = await supabase.rpc('register_incoming', { p: payload });
  if (error) {
    // the file never became part of a record: remove the orphan when the server can
    await createAdminClient()?.storage.from('document-files').remove([meta.storage_path]);
    throw new UserError(friendly(error));
  }
  redirect(`/documents/${data.id}/slip?new=1`);
});
