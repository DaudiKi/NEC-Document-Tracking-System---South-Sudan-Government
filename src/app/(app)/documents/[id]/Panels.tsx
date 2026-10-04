import ActionForm, { SubmitButton } from '@/components/ActionForm';
import { Field } from '@/components/ui';
import type { Lookups, Profile } from '@/lib/auth';
import { ACTION_LABEL, CLASS_LABEL, METHOD_LABEL, PRIORITY_LABEL, ROLE_LABEL, SIGNATORY_LABEL, type Role, type Row } from '@/lib/constants';
import * as A from './actions';
import CorrectionForm from './CorrectionForm';

const Hidden = ({ id }: { id: string }) => <input type="hidden" name="id" value={id} />;
const Reason = ({ label = 'Reason', name = 'reason' }: { label?: string; name?: string }) => (
  <div className="field"><label htmlFor={name}>{label}</label><textarea id={name} name={name} required /></div>
);

function Block({ title, children, hint }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <details className="nec-panel" style={{ gap: 0 }}>
      <summary style={{ cursor: 'pointer', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, lineHeight: '26px' }}>{title}</summary>
      {hint && <p className="caption" style={{ marginTop: 8 }}>{hint}</p>}
      <div style={{ marginTop: 'var(--space-40)' }}>{children}</div>
    </details>
  );
}

export default function Panels({ doc, profile, lookups, unacked, details, recipients }: {
  doc: Row; profile: Profile; lookups: Lookups; unacked: boolean; details: Row; recipients: Row[];
}) {
  const role = profile.role as Role;
  const id = doc.id as string;
  const incoming = doc.direction === 'incoming';
  const status = doc.status as string;
  const closed = status === 'closed' || status === 'filed';
  const voided = doc.is_voided as boolean;
  const holder = doc.current_holder_id === profile.id;
  const isRegistry = role === 'registry_officer';
  const isAdmin = role === 'system_administrator';
  const isExec = role === 'executive_viewer';
  const canWork = !voided && !closed;
  const people = lookups.users.filter((u) => u.role !== 'auditor' && u.id !== profile.id);
  const blocks: React.ReactNode[] = [];

  // ---- incoming: the officer holding it -------------------------------------------------
  if (incoming && canWork && holder && role !== 'auditor') {
    if (unacked) blocks.push(
      <section key="ack" className="nec-panel nec-panel--sky">
        <h2 className="section-title">Acknowledge receipt</h2>
        <p>This document was handed to you. Confirm that you have received it. Unacknowledged items are flagged after 24 hours.</p>
        <ActionForm action={A.acknowledge} className="stack"><Hidden id={id} /><div><SubmitButton>Acknowledge Receipt</SubmitButton></div></ActionForm>
      </section>,
    );
    blocks.push(
      <Block key="act" title="Record an action or comment" hint="What you did, feedback you received, or a question. This stays in the history.">
        <ActionForm action={A.recordAction} resetOnSuccess>
          <Hidden id={id} />
          <div className="stack">
            <div className="field"><label htmlFor="type">Type</label>
              <select id="type" name="type" defaultValue="action_taken">{Object.entries(ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div className="field"><label htmlFor="text">What happened</label><textarea id="text" name="text" required /></div>
            <div><SubmitButton>Record</SubmitButton></div>
          </div>
        </ActionForm>
      </Block>,
      <Block key="fwd" title="Forward to someone else" hint="The new holder must acknowledge receipt. Earlier steps stay in the history.">
        <ActionForm action={A.forward}><Hidden id={id} />
          <div className="stack">
            <Field label="Forward to" required htmlFor="fto"><select id="fto" name="to" required defaultValue=""><option value="">Select…</option>{people.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({ROLE_LABEL[u.role as Role]})</option>)}</select></Field>
            <Reason /><div><SubmitButton>Forward</SubmitButton></div>
          </div>
        </ActionForm>
      </Block>,
    );
    if (role !== 'registry_officer') blocks.push(
      <Block key="ret" title="Return for clarification" hint="Sends it back to whoever handed it to you.">
        <ActionForm action={A.returnForClarification}><Hidden id={id} /><div className="stack"><Reason label="What needs clarifying" /><div><SubmitButton>Return</SubmitButton></div></div></ActionForm>
      </Block>,
    );
  }
  if (incoming && canWork && (holder || isRegistry || isAdmin) && role !== 'auditor' && (status === 'routed' || status === 'with_action_officer' || status === 'on_hold')) {
    blocks.push(
      <Block key="hold" title={status === 'on_hold' ? 'Resume' : 'Put on hold'}>
        <ActionForm action={A.setHold}><Hidden id={id} /><input type="hidden" name="hold" value={status === 'on_hold' ? 'false' : 'true'} />
          <div className="stack"><Reason /><div><SubmitButton className="nec-btn nec-btn--outline">{status === 'on_hold' ? 'Resume' : 'Put On Hold'}</SubmitButton></div></div></ActionForm>
      </Block>,
    );
  }
  if (incoming && canWork && role !== 'auditor' && (holder || isRegistry || isAdmin || isExec)) {
    blocks.push(
      <Block key="close" title="Close or file" hint="A closing note is required, for example “replied by NEC/SG/OUT/2026/00045” or “noted and filed”.">
        <ActionForm action={A.closeDocument}><Hidden id={id} />
          <div className="stack">
            <div className="field"><label htmlFor="outcome">Outcome</label>
              <select id="outcome" name="outcome" defaultValue={status === 'with_action_officer' || status === 'action_taken' ? 'closed' : 'filed'}>
                <option value="closed">Closed: action completed</option><option value="filed">Filed: no action required</option></select></div>
            <div className="field"><label htmlFor="note">Closing note</label><textarea id="note" name="note" required /></div>
            <div><SubmitButton>Close Item</SubmitButton></div>
          </div>
        </ActionForm>
      </Block>,
    );
  }
  // ---- non-holders can comment ------------------------------------------------------------
  if (canWork && !holder && role !== 'auditor' && (role === 'action_officer' || isExec || isRegistry || isAdmin)) {
    blocks.push(
      <Block key="cmt" title="Add a comment">
        <ActionForm action={A.recordAction} resetOnSuccess><Hidden id={id} /><input type="hidden" name="type" value="comment" />
          <div className="stack"><div className="field"><label htmlFor="ctext">Comment</label><textarea id="ctext" name="text" required /></div><div><SubmitButton>Add Comment</SubmitButton></div></div></ActionForm>
      </Block>,
    );
  }
  // ---- executives: minutes ----------------------------------------------------------------
  if (isExec && !voided && !closed) blocks.push(
    <Block key="minute" title="Give an instruction (minute)" hint="The action officer sees it first, above the document details.">
      <ActionForm action={A.addMinute} resetOnSuccess><Hidden id={id} />
        <div className="stack">
          <div className="field"><label htmlFor="mtext">Instruction</label><textarea id="mtext" name="text" required /></div>
          <Field label="Direct it to" htmlFor="mto" hint="Leave empty to address the officer holding the document."><select id="mto" name="to" defaultValue=""><option value="">The current holder</option>{people.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></Field>
          <div><SubmitButton>Record Minute</SubmitButton></div>
        </div>
      </ActionForm>
    </Block>,
  );
  // ---- routing officer ---------------------------------------------------------------------
  if (incoming && canWork && (isRegistry || isAdmin)) {
    blocks.push(
      <Block key="route" title={status === 'registered' ? 'Route' : 'Re-route'} hint="One primary owner and optional copies. Every hand-over is recorded: from, to, when and why.">
        <ActionForm action={A.route}><Hidden id={id} />
          <div className="stack">
            <Field label="Route to" required htmlFor="rto"><select id="rto" name="to" required defaultValue=""><option value="">Select…</option>{lookups.users.filter((u) => u.role !== 'auditor').map((u) => <option key={u.id} value={u.id}>{u.full_name} ({ROLE_LABEL[u.role as Role]})</option>)}</select></Field>
            <Field label="Copies" htmlFor="rcc"><select id="rcc" name="cc" multiple size={3}>{lookups.users.filter((u) => u.role !== 'auditor').map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></Field>
            <Reason /><div><SubmitButton>Route</SubmitButton></div>
          </div>
        </ActionForm>
      </Block>,
      <Block key="due" title="Change the due date" hint="Set automatically from the priority. Only the routing officer can change it, with a reason.">
        <ActionForm action={A.changeDue}><Hidden id={id} />
          <div className="stack"><Field label="New due date and time" required htmlFor="due"><input id="due" name="due" type="datetime-local" required /></Field><Reason /><div><SubmitButton>Change Due Date</SubmitButton></div></div>
        </ActionForm>
      </Block>,
    );
  }
  if (canWork && (isRegistry || isAdmin || (role === 'action_officer' && holder))) blocks.push(
    <Block key="phys" title="Record a physical file movement" hint="When the paper original goes to another cabinet, desk or office.">
      <ActionForm action={A.physicalMove}><Hidden id={id} />
        <div className="stack"><Field label="New location" required htmlFor="loc"><input id="loc" name="location" type="text" required /></Field><Reason /><div><SubmitButton>Record Movement</SubmitButton></div></div>
      </ActionForm>
    </Block>,
  );

  // ---- outgoing lifecycle -------------------------------------------------------------------
  if (!incoming && !voided && isRegistry) {
    if (status === 'draft') blocks.push(
      <Block key="draft" title="Edit the draft">
        <ActionForm action={A.updateDraft}><Hidden id={id} />
          <div className="stack">
            <Field label="Subject" required htmlFor="dsub"><input id="dsub" name="subject" type="text" defaultValue={doc.subject} required /></Field>
            <div className="fields fields--3" style={{ background: 'transparent', border: 0, gap: 'var(--space-40)' }}>
              <Field label="Priority" required htmlFor="dpr"><select id="dpr" name="priority" defaultValue={doc.priority}>{Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="Classification" required htmlFor="dcl"><select id="dcl" name="classification" defaultValue={doc.classification}>{Object.entries(CLASS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="Signed / approved by" required htmlFor="dsg"><select id="dsg" name="signatory" defaultValue={details.signatory}>{Object.entries(SIGNATORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="Document type" required htmlFor="dty"><select id="dty" name="document_type_id" defaultValue={doc.document_type_id}>{lookups.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
              <Field label="Category" required htmlFor="dca"><select id="dca" name="category_id" defaultValue={doc.category_id}>{lookups.categories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
              <Field label="Delegated officer" htmlFor="dde"><input id="dde" name="delegated_officer_name" type="text" defaultValue={details.delegated_officer_name ?? ''} /></Field>
            </div>
            <label className="check"><input type="checkbox" name="feedback_required" defaultChecked={details.feedback_required} /> Feedback is expected</label>
            <div className="fields fields--3" style={{ background: 'transparent', border: 0, gap: 'var(--space-40)' }}>
              <Field label="Feedback due date" htmlFor="dfd"><input id="dfd" name="feedback_due_date" type="date" defaultValue={details.feedback_due_date ?? ''} /></Field>
              <Field label="Follow-up officer" htmlFor="dfo"><select id="dfo" name="feedback_officer_id" defaultValue={details.feedback_officer_id ?? ''}><option value="">None</option>{lookups.users.filter((u) => u.role !== 'auditor').map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></Field>
            </div>
            <div><SubmitButton>Save Draft</SubmitButton></div>
          </div>
        </ActionForm>
      </Block>,
      <section key="fin" className="nec-panel nec-panel--sky">
        <h2 className="section-title">Mark as Final</h2>
        <p>Scan the final, signed copy and attach it. Once the document is Final it is locked: further changes go through a correction request.</p>
        <ActionForm action={A.finalise} className="stack"><Hidden id={id} />
          <Field label="Signed copy (scan)" required htmlFor="fin"><input id="fin" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,application/pdf,image/*" required /></Field>
          <div><SubmitButton pendingLabel="Uploading…">Mark Final and Lock</SubmitButton></div>
        </ActionForm>
      </section>,
    );
    if (status === 'final') blocks.push(
      <section key="disp" className="nec-panel nec-panel--sky">
        <h2 className="section-title">Dispatch</h2>
        <ActionForm action={A.dispatch} className="stack"><Hidden id={id} />
          <Field label="Dispatch method" required htmlFor="dm"><select id="dm" name="method" required defaultValue=""><option value="">Select…</option>{Object.entries(METHOD_LABEL).filter(([k]) => k !== 'fax').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Dispatched by (messenger or courier)" required htmlFor="db"><input id="db" name="by_name" type="text" required /></Field>
          <Field label="Date and time dispatched" htmlFor="da" hint="Leave empty for now."><input id="da" name="at" type="datetime-local" /></Field>
          <div><SubmitButton>Record Dispatch</SubmitButton></div>
        </ActionForm>
        <p className="caption">Print the <a href="/delivery-book">delivery book</a> for the messenger to collect the recipient&apos;s signature.</p>
      </section>,
    );
    if (status === 'dispatched') blocks.push(
      <section key="deliv" className="nec-panel nec-panel--sky">
        <h2 className="section-title">Confirm delivery</h2>
        <p>Proof of delivery is required: the signed delivery book page, a courier receipt or an email confirmation. Give a note, a scan, or both.</p>
        <ActionForm action={A.confirmDelivery} className="stack"><Hidden id={id} />
          <Field label="Date and time received by the recipient" htmlFor="dat"><input id="dat" name="at" type="datetime-local" /></Field>
          <Field label="Proof note" htmlFor="dn" hint="For example the courier tracking number or who signed."><input id="dn" name="note" type="text" /></Field>
          <Field label="Scanned receipt" htmlFor="df"><input id="df" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,application/pdf,image/*" /></Field>
          <div><SubmitButton pendingLabel="Saving…">Confirm Delivery</SubmitButton></div>
        </ActionForm>
      </section>,
    );
    if (status === 'awaiting_feedback' && details.feedback_received_at == null) blocks.push(
      <Block key="fb" title="Link the incoming reply" hint="Register the reply as an incoming document first, then enter its reference here. This closes the follow-up.">
        <ActionForm action={A.linkFeedback}><Hidden id={id} />
          <div className="stack"><Field label="Reference of the incoming reply" required htmlFor="fbr"><input id="fbr" name="reply" type="text" required placeholder="NEC/CH/IN/2026/00012" /></Field><div><SubmitButton>Link Feedback</SubmitButton></div></div>
        </ActionForm>
      </Block>,
    );
    if (status === 'delivered' || status === 'awaiting_feedback') blocks.push(
      <Block key="oclose" title="Close" hint="Needs a closing note, and the signed copy must be attached.">
        <ActionForm action={A.closeDocument}><Hidden id={id} /><input type="hidden" name="outcome" value="closed" />
          <div className="stack"><div className="field"><label htmlFor="onote">Closing note</label><textarea id="onote" name="note" required /></div><div><SubmitButton>Close</SubmitButton></div></div></ActionForm>
      </Block>,
    );
  }
  // ---- files (registry) ---------------------------------------------------------------------
  if (isRegistry && !voided) {
    blocks.push(
      <Block key="newfile" title="Add a file or a new version of the scan" hint="Files are read-only once saved. A poor scan is corrected by adding a new version; the original stays in the version history.">
        <ActionForm action={A.addFileVersion} resetOnSuccess><Hidden id={id} />
          <div className="stack">
            <div className="field"><label htmlFor="kind">What is it</label>
              <select id="kind" name="kind" defaultValue={incoming ? 'attachment' : 'proof_of_delivery'}>
                <option value="attachment">Attachment (separate file)</option>
                {incoming && <option value="main_scan">New version of the main scan</option>}
                {!incoming && status !== 'draft' && <option value="proof_of_delivery">Proof of delivery</option>}
                {!incoming && status === 'draft' && <option value="draft">Draft</option>}
              </select></div>
            <Field label="Title" htmlFor="ftitle" hint="For example “Annex A”."><input id="ftitle" name="title" type="text" /></Field>
            <Field label="File" required htmlFor="ffile"><input id="ffile" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,application/pdf,image/*" required /></Field>
            <Field label="Reason (needed for a new version)" htmlFor="freason"><input id="freason" name="reason" type="text" /></Field>
            <div><SubmitButton pendingLabel="Uploading…">Add File</SubmitButton></div>
          </div>
        </ActionForm>
      </Block>,
    );
  }
  // ---- corrections ----------------------------------------------------------------------------
  const lockedForCorrection = !(doc.direction === 'outgoing' && status === 'draft');
  if ((isRegistry || isAdmin) && !voided && lockedForCorrection) blocks.push(
    <Block key="corr" title="Request a correction" hint="Saved records are locked. State the field, the new value and the reason.">
      <CorrectionForm action={A.requestCorrection} id={id} direction={doc.direction}
        types={lookups.types} categories={lookups.categories} orgs={lookups.organisations} users={lookups.users}
        recipients={recipients.map((r) => ({ id: r.id, name: `${r.organisation_name ?? r.organisation_text ?? ''}${r.recipient_name ? ' / ' + r.recipient_name : ''}` }))} />
    </Block>,
  );
  if ((isRegistry || isAdmin || isExec) && !voided && doc.classification === 'confidential') blocks.push(
    <Block key="access" title="Name another recipient" hint="Confidential documents are visible only to executives, administrators and named recipients.">
      <ActionForm action={A.grantAccess}><Hidden id={id} />
        <div className="stack"><Field label="Person" required htmlFor="gto"><select id="gto" name="to" required defaultValue=""><option value="">Select…</option>{lookups.users.filter((u) => u.role !== 'auditor').map((u) => <option key={u.id} value={u.id}>{u.full_name} ({ROLE_LABEL[u.role as Role]})</option>)}</select></Field><div><SubmitButton>Grant Access</SubmitButton></div></div>
      </ActionForm>
    </Block>,
  );
  // ---- void -------------------------------------------------------------------------------------
  if ((isRegistry || isAdmin) && !voided) blocks.push(
    <Block key="void" title="Cancel / void this record" hint="Records are never deleted. A voided record stays in the database and in reports, marked as voided.">
      <ActionForm action={A.voidDocument}><Hidden id={id} /><div className="stack"><Reason /><div><SubmitButton className="nec-btn nec-btn--danger">Void Record</SubmitButton></div></div></ActionForm>
    </Block>,
  );

  if (!blocks.length) return null;
  return <div className="nec-grid nec-grid--2">{blocks}</div>;
}
