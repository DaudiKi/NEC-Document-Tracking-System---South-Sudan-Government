'use client';
import { useState } from 'react';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import type { FormState } from '@/lib/actions';
import { CLASS_LABEL, METHOD_LABEL, PRIORITY_LABEL, SIGNATORY_LABEL, type Row } from '@/lib/constants';

type Opt = [string, string];
type Def = { key: string; label: string; kind: 'text' | 'number' | 'bool' | 'date' | 'select' | 'selectNum'; options?: Opt[] };

export default function CorrectionForm({ action, id, direction, types, categories, orgs, users, recipients }: {
  action: (p: FormState, fd: FormData) => Promise<FormState>; id: string; direction: 'incoming' | 'outgoing';
  types: Row[]; categories: Row[]; orgs: Row[]; users: Row[]; recipients: Row[];
}) {
  const o = (m: Record<string, string>): Opt[] => Object.entries(m);
  const common: Def[] = [
    { key: 'documents|subject', label: 'Subject', kind: 'text' },
    { key: 'documents|document_type_id', label: 'Document type', kind: 'selectNum', options: types.map((t) => [String(t.id), t.name]) },
    { key: 'documents|category_id', label: 'Category', kind: 'selectNum', options: categories.map((t) => [String(t.id), t.name]) },
    { key: 'documents|priority', label: 'Priority', kind: 'select', options: o(PRIORITY_LABEL) },
    { key: 'documents|classification', label: 'Classification', kind: 'select', options: o(CLASS_LABEL) },
    { key: 'documents|number_of_pages', label: 'Number of pages', kind: 'number' },
    { key: 'documents|number_of_attachments', label: 'Number of attachments', kind: 'number' },
    { key: 'documents|physical_file_location', label: 'Physical file location', kind: 'text' },
  ];
  const incoming: Def[] = [
    { key: 'incoming_details|sender_organisation_id', label: 'Sender organisation (from list)', kind: 'select', options: orgs.map((t) => [t.id, t.name]) },
    { key: 'incoming_details|sender_organisation_text', label: 'Sender organisation (typed)', kind: 'text' },
    { key: 'incoming_details|sender_name', label: 'Sender name', kind: 'text' },
    { key: 'incoming_details|sender_title', label: 'Sender title', kind: 'text' },
    { key: 'incoming_details|delivered_by_name', label: 'Delivered by', kind: 'text' },
    { key: 'incoming_details|delivered_by_phone', label: 'Delivered by (phone)', kind: 'text' },
    { key: 'incoming_details|delivery_method', label: 'Delivery method', kind: 'select', options: o(METHOD_LABEL) },
    { key: 'incoming_details|sender_reference', label: "Sender's reference", kind: 'text' },
    { key: 'incoming_details|sender_reference_date', label: 'Date on the letter', kind: 'date' },
    { key: 'incoming_details|response_due_date', label: 'Response due date', kind: 'date' },
  ];
  const outgoing: Def[] = [
    { key: 'outgoing_details|signatory', label: 'Signed / approved by', kind: 'select', options: o(SIGNATORY_LABEL) },
    { key: 'outgoing_details|delegated_officer_name', label: 'Delegated officer name', kind: 'text' },
    { key: 'outgoing_details|feedback_due_date', label: 'Feedback due date', kind: 'date' },
    { key: 'outgoing_details|feedback_officer_id', label: 'Follow-up officer', kind: 'select', options: users.map((u) => [u.id, u.full_name]) },
    { key: 'outgoing_recipients|recipient_name', label: 'Recipient name', kind: 'text' },
    { key: 'outgoing_recipients|recipient_title', label: 'Recipient title', kind: 'text' },
    { key: 'outgoing_recipients|organisation_text', label: 'Recipient organisation (typed)', kind: 'text' },
  ];
  const defs = [...common, ...(direction === 'incoming' ? incoming : outgoing)];
  const [sel, setSel] = useState(defs[0].key);
  const def = defs.find((d) => d.key === sel)!;
  const full = `${def.key}|${def.kind}`.replace(/^([a-z_]+)\|([a-z_]+)\|/, '$1|$2|');
  return (
    <ActionForm action={action}>
      <input type="hidden" name="id" value={id} />
      <div className="fields">
        <div className="fieldset">
          <div className="field"><label htmlFor="cf">Field to correct</label>
            <select id="cf" name="field" value={full} onChange={(e) => setSel(e.target.value.split('|').slice(0, 2).join('|'))}>
              {defs.map((d) => <option key={d.key} value={`${d.key}|${d.kind}`}>{d.label}</option>)}
            </select></div>
          {def.key.startsWith('outgoing_recipients') && (
            <div className="field"><label htmlFor="cr">Which recipient</label>
              <select id="cr" name="row_id" required defaultValue=""><option value="">Select…</option>{recipients.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
          )}
          <div className="field"><label htmlFor="cv">Correct value</label>
            {def.kind === 'text' && <input id="cv" name="value" type="text" key={sel} />}
            {def.kind === 'number' && <input id="cv" name="value" type="number" min={0} key={sel} />}
            {def.kind === 'date' && <input id="cv" name="value" type="date" key={sel} />}
            {(def.kind === 'select' || def.kind === 'selectNum') && (
              <select id="cv" name="value" key={sel} required defaultValue=""><option value="">Select…</option>{def.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            )}
          </div>
        </div>
        <div className="fieldset">
          <div className="field"><label htmlFor="cw">Reason for the correction</label><textarea id="cw" name="reason" required /></div>
          <p className="caption">The saved record is locked. An Administrator approves or rejects the correction. Both the old and the new value are kept, with who asked and who approved.</p>
        </div>
      </div>
      <div className="form-actions"><SubmitButton>Request Correction</SubmitButton></div>
    </ActionForm>
  );
}
