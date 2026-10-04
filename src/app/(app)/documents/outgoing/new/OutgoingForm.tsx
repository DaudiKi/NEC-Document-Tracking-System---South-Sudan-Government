'use client';
import { useState } from 'react';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import { registerOutgoing } from './actions';
import { Field } from '@/components/ui';
import { CLASS_LABEL, SIGNATORY_LABEL, type Row } from '@/lib/constants';

export default function OutgoingForm({ lookups, defaultOffice, maxMb }: {
  lookups: { offices: Row[]; categories: Row[]; types: Row[]; users: Row[]; organisations: Row[]; priorities: Row[] };
  defaultOffice: number | null; maxMb: number;
}) {
  const [feedback, setFeedback] = useState(false);
  const [signatory, setSignatory] = useState('chairperson');
  const [rows, setRows] = useState([0]);
  const [next, setNext] = useState(1);
  return (
    <ActionForm action={registerOutgoing}>
      <div className="fields">
        <div className="fieldset span-all">
          <h2 className="fieldset-title">Document</h2>
          <Field label="Subject" required htmlFor="subject"><input id="subject" name="subject" type="text" required /></Field>
          <div className="fields fields--3" style={{ background: 'transparent', border: 0, gap: 'var(--space-40)' }}>
            <Field label="Issuing office" required htmlFor="office_id">
              <select id="office_id" name="office_id" required defaultValue={defaultOffice ?? ''}><option value="">Select…</option>{lookups.offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
            </Field>
            <Field label="Document type" required htmlFor="document_type_id">
              <select id="document_type_id" name="document_type_id" required defaultValue=""><option value="">Select…</option>{lookups.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            </Field>
            <Field label="Category" required htmlFor="category_id">
              <select id="category_id" name="category_id" required defaultValue=""><option value="">Select…</option>{lookups.categories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            </Field>
            <Field label="Priority" required htmlFor="priority">
              <select id="priority" name="priority" required defaultValue="normal">{lookups.priorities.map((p) => <option key={p.priority} value={p.priority}>{p.label}</option>)}</select>
            </Field>
            <Field label="Classification" required htmlFor="classification">
              <select id="classification" name="classification" required defaultValue="open">{Object.entries(CLASS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </Field>
            <Field label="In reply to" htmlFor="in_reply_to" hint="Reference of the incoming document it answers. That item is closed when this letter is marked Final.">
              <input id="in_reply_to" name="in_reply_to" type="text" placeholder="NEC/CH/IN/2026/00012" />
            </Field>
          </div>
        </div>
        <div className="fieldset">
          <h2 className="fieldset-title">Signature</h2>
          <Field label="Signed / approved by" required htmlFor="signatory">
            <select id="signatory" name="signatory" required value={signatory} onChange={(e) => setSignatory(e.target.value)}>
              {Object.entries(SIGNATORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          {signatory === 'delegated_officer' && <Field label="Name of the delegated officer" required htmlFor="delegated_officer_name"><input id="delegated_officer_name" name="delegated_officer_name" type="text" required /></Field>}
          <p className="caption">The reference number is issued as soon as you save, so it can be typed on the letter before it is signed. It stays a Draft until the signed copy is scanned.</p>
        </div>
        <div className="fieldset">
          <h2 className="fieldset-title">Feedback</h2>
          <label className="check"><input type="checkbox" name="feedback_required" checked={feedback} onChange={(e) => setFeedback(e.target.checked)} /> Feedback is expected</label>
          {feedback && (<>
            <Field label="Feedback due date" required htmlFor="feedback_due_date"><input id="feedback_due_date" name="feedback_due_date" type="date" required /></Field>
            <Field label="Follow-up officer" required htmlFor="feedback_officer_id">
              <select id="feedback_officer_id" name="feedback_officer_id" required defaultValue=""><option value="">Select…</option>{lookups.users.filter((u) => u.role !== 'auditor').map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select>
            </Field>
            <p className="caption">If feedback has not arrived by this date, the follow-up officer and the issuing office are alerted.</p>
          </>)}
        </div>
        <div className="fieldset span-all">
          <div className="panel-head"><h2 className="fieldset-title">Recipients</h2>
            <button type="button" className="nec-btn nec-btn--outline nec-btn--sm" onClick={() => { setRows([...rows, next]); setNext(next + 1); }}>Add Recipient</button></div>
          {rows.map((k, idx) => (
            <div key={k} className="fields fields--3" style={{ background: 'transparent', border: 0, gap: 'var(--space-40)', alignItems: 'end' }}>
              <Field label={idx === 0 ? 'Recipient organisation' : 'Organisation'} htmlFor={`ro${k}`}>
                <select id={`ro${k}`} name="recipient_org" defaultValue=""><option value="">Not in the list</option>{lookups.organisations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
              </Field>
              <Field label="…or type it" htmlFor={`rt${k}`}><input id={`rt${k}`} name="recipient_org_text" type="text" /></Field>
              <Field label="Name" htmlFor={`rn${k}`}><input id={`rn${k}`} name="recipient_name" type="text" /></Field>
              <Field label="Title" htmlFor={`rl${k}`}><input id={`rl${k}`} name="recipient_title" type="text" /></Field>
              <Field label="To or copied" required htmlFor={`rk${k}`}>
                <select id={`rk${k}`} name="recipient_type" defaultValue={idx === 0 ? 'to' : 'to'}><option value="to">To</option><option value="cc">Copied to (cc)</option></select>
              </Field>
              <div>{rows.length > 1 && <button type="button" className="linklike" onClick={() => setRows(rows.filter((x) => x !== k))}>Remove</button>}</div>
            </div>
          ))}
        </div>
        <div className="fieldset span-all">
          <h2 className="fieldset-title">Draft file</h2>
          <Field label="Draft of the letter" htmlFor="file" hint={`Optional. PDF, JPEG, PNG or TIFF, up to ${maxMb} MB. The signed copy is added when you mark it Final.`}>
            <input id="file" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,application/pdf,image/*" />
          </Field>
        </div>
      </div>
      <div className="form-actions"><SubmitButton pendingLabel="Saving…">Register Draft</SubmitButton></div>
    </ActionForm>
  );
}
