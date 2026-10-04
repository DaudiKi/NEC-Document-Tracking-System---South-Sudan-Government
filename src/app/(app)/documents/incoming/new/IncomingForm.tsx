'use client';
import { useState } from 'react';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import { registerIncoming } from './actions';
import { Field } from '@/components/ui';
import { PRIORITY_LABEL, CLASS_LABEL, METHOD_LABEL, ROLE_LABEL, type Row, type Role } from '@/lib/constants';

export default function IncomingForm({ lookups, defaultOffice, maxMb }: {
  lookups: { offices: Row[]; categories: Row[]; types: Row[]; users: Row[]; organisations: Row[]; priorities: Row[] };
  defaultOffice: number | null; maxMb: number;
}) {
  const [response, setResponse] = useState(false);
  const [backfill, setBackfill] = useState(false);
  const [conf, setConf] = useState(false);
  return (
    <ActionForm action={registerIncoming}>
      <div className="fields">
        <div className="fieldset">
          <h2 className="fieldset-title">Receipt</h2>
          <Field label="Receiving office" required htmlFor="office_id">
            <select id="office_id" name="office_id" required defaultValue={defaultOffice ?? ''}>
              <option value="">Select…</option>{lookups.offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
          <Field label="Delivered by (name)" required htmlFor="delivered_by_name"><input id="delivered_by_name" name="delivered_by_name" type="text" required /></Field>
          <Field label="Delivered by (phone number)" htmlFor="delivered_by_phone"><input id="delivered_by_phone" name="delivered_by_phone" type="tel" /></Field>
          <label className="check"><input type="checkbox" name="delivered_by_id_seen" /> ID of the person delivering was seen</label>
          <Field label="Delivery method" required htmlFor="delivery_method">
            <select id="delivery_method" name="delivery_method" required defaultValue="">
              <option value="">Select…</option>{Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <p className="hint caption">The date and time received are taken from the server clock when you save, not from this computer.</p>
        </div>
        <div className="fieldset">
          <h2 className="fieldset-title">Sender</h2>
          <Field label="Sender organisation (from the contacts list)" htmlFor="sender_organisation_id" hint="Pick from the list to keep spelling consistent.">
            <select id="sender_organisation_id" name="sender_organisation_id" defaultValue="">
              <option value="">Not in the list</option>{lookups.organisations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
          <Field label="…or type the organisation" htmlFor="sender_organisation_text" hint="Only when it is not in the list. Add it to Contacts afterwards."><input id="sender_organisation_text" name="sender_organisation_text" type="text" /></Field>
          <Field label="Sender name" required htmlFor="sender_name"><input id="sender_name" name="sender_name" type="text" required /></Field>
          <Field label="Sender title" required htmlFor="sender_title"><input id="sender_title" name="sender_title" type="text" required /></Field>
          <div className="fields" style={{ background: 'transparent', border: 0, gap: 'var(--space-40)' }}>
            <Field label="Sender's own reference" htmlFor="sender_reference"><input id="sender_reference" name="sender_reference" type="text" /></Field>
            <Field label="Date on the letter" htmlFor="sender_reference_date"><input id="sender_reference_date" name="sender_reference_date" type="date" /></Field>
          </div>
        </div>
        <div className="fieldset span-all">
          <h2 className="fieldset-title">Document</h2>
          <Field label="Subject" required htmlFor="subject"><input id="subject" name="subject" type="text" required /></Field>
          <div className="fields fields--3" style={{ background: 'transparent', border: 0, gap: 'var(--space-40)' }}>
            <Field label="Purpose / document type" required htmlFor="document_type_id">
              <select id="document_type_id" name="document_type_id" required defaultValue=""><option value="">Select…</option>{lookups.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            </Field>
            <Field label="Category" required htmlFor="category_id">
              <select id="category_id" name="category_id" required defaultValue=""><option value="">Select…</option>{lookups.categories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            </Field>
            <Field label="Priority" required htmlFor="priority" hint="Sets the due date automatically.">
              <select id="priority" name="priority" required defaultValue="normal">{lookups.priorities.map((p) => <option key={p.priority} value={p.priority}>{p.label}</option>)}</select>
            </Field>
            <Field label="Classification" required htmlFor="classification" hint={conf ? 'Confidential: only the executives, administrators and the named recipients can open it.' : undefined}>
              <select id="classification" name="classification" required defaultValue="open" onChange={(e) => setConf(e.target.value === 'confidential')}>
                {Object.entries(CLASS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Number of pages" required htmlFor="number_of_pages" hint="Checked against the scan."><input id="number_of_pages" name="number_of_pages" type="number" min={1} required /></Field>
            <Field label="Number of attachments" htmlFor="number_of_attachments"><input id="number_of_attachments" name="number_of_attachments" type="number" min={0} defaultValue={0} /></Field>
          </div>
          <Field label="Physical file location" required htmlFor="physical_file_location" hint="Cabinet, shelf and file number."><input id="physical_file_location" name="physical_file_location" type="text" required /></Field>
          <label className="check"><input type="checkbox" name="response_required" checked={response} onChange={(e) => setResponse(e.target.checked)} /> A response is required</label>
          {response && <Field label="Response due date" required htmlFor="response_due_date"><input id="response_due_date" name="response_due_date" type="date" required /></Field>}
        </div>
        <div className="fieldset">
          <h2 className="fieldset-title">Routing</h2>
          <Field label="Routed to (primary owner)" required htmlFor="routed_to">
            <select id="routed_to" name="routed_to" required defaultValue="">
              <option value="">Select…</option>
              {lookups.users.filter((u) => u.role !== 'auditor').map((u) => <option key={u.id} value={u.id}>{u.full_name} ({ROLE_LABEL[u.role as Role]})</option>)}
            </select>
          </Field>
          <Field label="Copies (optional)" htmlFor="cc" hint="Hold Ctrl (or Cmd) to choose several.">
            <select id="cc" name="cc" multiple size={4}>{lookups.users.filter((u) => u.role !== 'auditor').map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select>
          </Field>
          <Field label="Instruction / minute written on the file" htmlFor="minute" hint="For example the Chairperson's minute. Recorded under your name."><textarea id="minute" name="minute" /></Field>
          <Field label="Linked documents" htmlFor="linked" hint="Reference numbers of earlier letters in the same matter, separated by commas."><input id="linked" name="linked" type="text" placeholder="NEC/CH/IN/2026/00012" /></Field>
        </div>
        <div className="fieldset">
          <h2 className="fieldset-title">Scan</h2>
          <Field label="Scanned file" required htmlFor="file" hint={`One searchable PDF (PDF/A with text recognition) at 300 dpi, colour where there are stamps or signatures. PDF, JPEG, PNG or TIFF, up to ${maxMb} MB. The record cannot be saved without it.`}>
            <input id="file" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,application/pdf,image/*" required />
          </Field>
          <p className="caption">Scanning straight from an office scanner into the record needs the scanner software installed on the registry PC (a later step). For now, scan to PDF and attach it here; the system stamps the reference number and receipt date on every copy it shows or prints.</p>
          <label className="check"><input type="checkbox" name="backfill" checked={backfill} onChange={(e) => setBackfill(e.target.checked)} /> Entered afterwards from the manual outage form</label>
          {backfill && (<>
            <Field label="Manual form number" required htmlFor="manual_register_form_no"><input id="manual_register_form_no" name="manual_register_form_no" type="text" required /></Field>
            <Field label="Original receipt time" required htmlFor="received_at"><input id="received_at" name="received_at" type="datetime-local" required /></Field>
          </>)}
        </div>
      </div>
      <div className="form-actions">
        <SubmitButton pendingLabel="Saving and uploading…">Register and Route</SubmitButton>
        <span className="caption">You get the reference number and an acknowledgement slip to print for the person who delivered it.</span>
      </div>
    </ActionForm>
  );
}
