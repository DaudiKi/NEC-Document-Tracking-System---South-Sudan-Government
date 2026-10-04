'use server';
import { redirect } from 'next/navigation';
import { randomUUID } from 'crypto';
import { guard, str, opt, bool, need, UserError, friendly } from '@/lib/actions';
import { storeFile } from '@/lib/files';
import { requireUser } from '@/lib/auth';
import { resolveRefs } from '@/lib/refs';
import { createAdminClient } from '@/lib/supabase/admin';

export const registerOutgoing = guard(async (fd) => {
  const { supabase } = await requireUser(['registry_officer']);
  const docId = randomUUID();
  const signatory = need(opt(fd, 'signatory'), 'Signed / approved by');
  const feedback = bool(fd, 'feedback_required');
  if (feedback && (!opt(fd, 'feedback_due_date') || !opt(fd, 'feedback_officer_id'))) {
    throw new UserError('When feedback is required, give the feedback due date and the follow-up officer.');
  }
  if (signatory === 'delegated_officer' && !opt(fd, 'delegated_officer_name')) throw new UserError('Name the delegated officer who signs.');
  const kinds = fd.getAll('recipient_type').map(String);
  const orgs = fd.getAll('recipient_org').map(String);
  const orgTexts = fd.getAll('recipient_org_text').map(String);
  const names = fd.getAll('recipient_name').map(String);
  const titles = fd.getAll('recipient_title').map(String);
  const recipients = kinds.map((k, i) => ({
    recipient_type: k || 'to', organisation_id: orgs[i] || null, organisation_text: orgTexts[i]?.trim() || null,
    recipient_name: names[i]?.trim() || null, recipient_title: titles[i]?.trim() || null,
  })).filter((r) => r.organisation_id || r.organisation_text);
  if (!recipients.some((r) => r.recipient_type === 'to')) throw new UserError('Add at least one recipient (To).');
  const replyTo = await resolveRefs(str(fd, 'in_reply_to'));
  if (replyTo.length > 1) throw new UserError('A letter replies to one incoming document. Enter a single reference.');

  const file = fd.get('file') as File | null;
  let meta = null;
  const fileId = randomUUID();
  if (file && file.size > 0) meta = await storeFile(supabase, file, docId, fileId, 1);

  const payload = {
    document_id: docId, file_id: fileId,
    office_id: Number(need(opt(fd, 'office_id'), 'Issuing office')),
    subject: need(opt(fd, 'subject'), 'Subject'),
    document_type_id: Number(need(opt(fd, 'document_type_id'), 'Document type')),
    category_id: Number(need(opt(fd, 'category_id'), 'Category')),
    priority: need(opt(fd, 'priority'), 'Priority'), classification: need(opt(fd, 'classification'), 'Classification'),
    signatory, delegated_officer_name: opt(fd, 'delegated_officer_name'),
    feedback_required: feedback, feedback_due_date: feedback ? opt(fd, 'feedback_due_date') : null,
    feedback_officer_id: feedback ? opt(fd, 'feedback_officer_id') : null,
    in_reply_to: replyTo[0] ?? null, recipients, file: meta,
  };
  const { data, error } = await supabase.rpc('register_outgoing', { p: payload });
  if (error) {
    if (meta) await createAdminClient()?.storage.from('document-files').remove([meta.storage_path]);
    throw new UserError(friendly(error));
  }
  redirect(`/documents/${data.id}?registered=${encodeURIComponent(data.reference_number)}`);
});
