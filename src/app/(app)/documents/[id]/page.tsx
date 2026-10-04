import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser, loadLookups } from '@/lib/auth';
import { PageHead, Notice, StatusBadge, PriorityBadge, ClassBadge } from '@/components/ui';
import { CLASS_LABEL, METHOD_LABEL, SIGNATORY_LABEL, ACTION_LABEL, type Row } from '@/lib/constants';
import { fmtDate, fmtDateTime, fmtSince, yn } from '@/lib/format';
import Panels from './Panels';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: 'Document' };
}

const KB = (n: number) => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ registered?: string }> }) {
  const { id } = await params;
  const { registered } = await searchParams;
  const { supabase, profile } = await requireUser();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const { data: doc } = await supabase.from('documents')
    .select('*, office:offices(code, name), doctype:document_types(name), category:categories(name), holder:profiles!documents_current_holder_id_fkey(full_name, job_title), registrar:profiles!documents_registered_by_fkey(full_name), closer:profiles!documents_closed_by_fkey(full_name), voider:profiles!documents_voided_by_fkey(full_name)')
    .eq('id', id).maybeSingle();
  if (!doc) notFound();
  const incoming = doc.direction === 'incoming';

  const [lookups, inc, out, recips, versions, history, corrections, linksOut, linksIn, minutes, unack, actions] = await Promise.all([
    loadLookups(),
    incoming ? supabase.from('incoming_details').select('*, org:organisations(name)').eq('document_id', id).maybeSingle() : Promise.resolve({ data: null }),
    !incoming ? supabase.from('outgoing_details').select('*, drafter:profiles!outgoing_details_drafted_by_fkey(full_name), signer:profiles!outgoing_details_signed_by_user_id_fkey(full_name), fbofficer:profiles!outgoing_details_feedback_officer_id_fkey(full_name), reply:documents!outgoing_details_feedback_document_id_fkey(id, reference_number)').eq('document_id', id).maybeSingle() : Promise.resolve({ data: null }),
    !incoming ? supabase.from('outgoing_recipients').select('*, org:organisations(name)').eq('document_id', id).order('sort_order') : Promise.resolve({ data: [] }),
    supabase.from('document_file_versions').select('id, version_number, mime_type, size_bytes, sha256, page_count, is_pdfa, reason, uploaded_at, original_filename, uploader:profiles!document_file_versions_uploaded_by_fkey(full_name), file:document_files(id, file_kind, title)').eq('document_id', id).order('uploaded_at'),
    supabase.from('v_document_history').select('*').eq('document_id', id).order('at'),
    supabase.from('correction_requests').select('*, requester:profiles!correction_requests_requested_by_fkey(full_name), reviewer:profiles!correction_requests_reviewed_by_fkey(full_name)').eq('document_id', id).order('requested_at', { ascending: false }),
    supabase.from('document_links').select('link_type, other:documents!document_links_to_document_id_fkey(id, reference_number, subject)').eq('from_document_id', id),
    supabase.from('document_links').select('link_type, other:documents!document_links_from_document_id_fkey(id, reference_number, subject)').eq('to_document_id', id),
    supabase.from('document_minutes').select('*, author:profiles!document_minutes_author_id_fkey(full_name, job_title), to:profiles!document_minutes_directed_to_user_id_fkey(full_name)').eq('document_id', id).order('created_at', { ascending: false }),
    supabase.from('document_movements').select('id').eq('document_id', id).eq('to_user_id', profile.id).is('acknowledged_at', null),
    supabase.from('document_actions').select('id').eq('document_id', id).limit(1),
  ]);

  const { data: withText } = await supabase.from('document_file_versions').select('id').eq('document_id', id).not('ocr_text', 'is', null);
  const textIds = new Set((withText ?? []).map((r: Row) => r.id));
  const details: Row = (incoming ? inc.data : out.data) ?? {};
  const recipients: Row[] = (recips.data ?? []).map((r: Row) => ({ ...r, organisation_name: r.org?.name }));
  const overdue = !['closed', 'filed'].includes(doc.status) && !doc.is_voided && doc.due_at && new Date(doc.due_at) < new Date() && incoming;
  const unackedMine = (unack.data ?? []).length > 0;
  const vers: Row[] = (versions.data ?? []).map((v: Row) => ({ ...v, has_text: textIds.has(v.id) }));
  const mainScan = vers.find((v) => v.file?.file_kind === 'main_scan');
  const noText = mainScan && mainScan.mime_type === 'application/pdf' && !mainScan.has_text;
  const links = [...(linksOut.data ?? []).map((l: Row) => ({ ...l, dir: 'to' })), ...(linksIn.data ?? []).map((l: Row) => ({ ...l, dir: 'from' }))];
  const LINK_LABEL: Record<string, [string, string]> = {
    related: ['Related to', 'Related to'], in_reply_to: ['In reply to', 'Answered by'], feedback_for: ['Feedback for', 'Feedback received in'], internal_memo_pair: ['Memo pair', 'Memo pair'],
  };

  return (
    <>
      <PageHead eyebrow={incoming ? 'Incoming document' : 'Outgoing document'} title={doc.reference_number}
        actions={<>
          {incoming && doc.registered_by === profile.id && <Link className="nec-btn nec-btn--outline" href={`/documents/${id}/slip`}>Acknowledgement Slip</Link>}
          <Link className="nec-btn nec-btn--outline" href={`/reports/document-history?ref=${encodeURIComponent(doc.reference_number)}`}>Full History</Link>
        </>}>
        <span style={{ color: 'var(--heading)', fontWeight: 600 }}>{doc.subject}</span>
        <span style={{ display: 'block', marginTop: 8 }}>
          <StatusBadge status={doc.status} overdue={!!overdue} /> <PriorityBadge p={doc.priority} /> <ClassBadge c={doc.classification} />
          {doc.is_voided && <> <span className="badge badge--ink">Voided</span></>}
        </span>
      </PageHead>
      <div className="notices">
        {registered && <Notice kind="success" label="Registered.">The reference number is <strong>{registered}</strong>. Type it on the letter before it is signed.</Notice>}
        {doc.is_voided && <Notice kind="danger" label="Voided.">{doc.void_reason} ({doc.voider?.full_name}, {fmtDateTime(doc.voided_at)}). The record is kept and cannot be changed.</Notice>}
        {unackedMine && !doc.is_voided && <Notice kind="warning" label="Waiting for you.">This was handed to you. Acknowledge receipt below.</Notice>}
        {overdue && <Notice kind="danger" label="Overdue.">This item was due {fmtDateTime(doc.due_at)}.</Notice>}
        {noText && <Notice kind="info" label="Not searchable.">The main scan has no text layer, so words inside it cannot be found by search. Re-scan as a searchable PDF (PDF/A with text recognition) and add it as a new version.</Notice>}
        {doc.classification === 'confidential' && <Notice kind="info" label="Confidential.">Visible only to executives, administrators and named recipients{doc.office_only ? ', and only from inside the office network' : ''}. Opening it is recorded.</Notice>}
      </div>

      {(minutes.data ?? []).length > 0 && (
        <section aria-label="Instructions" style={{ marginTop: 'var(--pad-panel)' }}>
          {(minutes.data as Row[]).map((m) => (
            <div className="minute" key={m.id}>
              <div className="nec-eyebrow">Instruction (minute) · {m.author?.full_name}{m.author?.job_title ? `, ${m.author.job_title}` : ''} · {fmtDateTime(m.created_at)}{m.to ? ` · for ${m.to.full_name}` : ''}</div>
              <p style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{m.minute_text}</p>
            </div>
          ))}
        </section>
      )}

      <div className="nec-grid nec-grid--2" style={{ marginTop: (minutes.data ?? []).length ? 0 : 'var(--pad-panel)' }}>
        <section className="nec-panel">
          <h2 className="section-title">Details</h2>
          <dl className="kv">
            <dt>Reference</dt><dd className="mono">{doc.reference_number}</dd>
            <dt>{incoming ? 'Receiving office' : 'Issuing office'}</dt><dd>{doc.office?.name}</dd>
            <dt>Subject</dt><dd>{doc.subject}</dd>
            <dt>Type · category</dt><dd>{doc.doctype?.name} · {doc.category?.name}</dd>
            <dt>Priority · classification</dt><dd>{doc.priority} · {CLASS_LABEL[doc.classification]}</dd>
            {incoming ? (<>
              <dt>Received</dt><dd>{fmtDateTime(doc.received_at)}{doc.entry_mode !== 'system' && <> <span className="badge badge--warning">Entered from outage form {doc.manual_register_form_no}</span></>}</dd>
              <dt>Registered by</dt><dd>{doc.registrar?.full_name}</dd>
              <dt>Sender</dt><dd>{details.org?.name ?? details.sender_organisation_text}<br />{details.sender_name}, {details.sender_title}</dd>
              <dt>Sender&apos;s reference</dt><dd>{[details.sender_reference, details.sender_reference_date && fmtDate(details.sender_reference_date)].filter(Boolean).join(' · ') || '—'}</dd>
              <dt>Delivered by</dt><dd>{details.delivered_by_name}{details.delivered_by_phone ? `, ${details.delivered_by_phone}` : ''} · ID seen: {yn(details.delivered_by_id_seen)} · {METHOD_LABEL[details.delivery_method]}</dd>
              <dt>Response required</dt><dd>{yn(details.response_required)}{details.response_due_date ? `, by ${fmtDate(details.response_due_date)}` : ''}</dd>
              <dt>Pages · attachments</dt><dd>{doc.number_of_pages} · {doc.number_of_attachments}</dd>
              <dt>Acknowledgement slip</dt><dd>{details.acknowledgement_sent_at ? `Issued ${fmtDateTime(details.acknowledgement_sent_at)}` : 'Not yet printed'}</dd>
            </>) : (<>
              <dt>Registered</dt><dd>{fmtDateTime(doc.registered_at)} by {doc.registrar?.full_name}</dd>
              <dt>Drafted by</dt><dd>{details.drafter?.full_name}</dd>
              <dt>Signed / approved by</dt><dd>{details.signer?.full_name ?? details.delegated_officer_name ?? SIGNATORY_LABEL[details.signatory]}{details.signatory !== 'delegated_officer' ? '' : ' (delegated)'}</dd>
              <dt>Recipients</dt><dd>{recipients.length ? recipients.map((r) => (<div key={r.id}>{r.recipient_type === 'cc' ? 'cc: ' : ''}{r.org?.name ?? r.organisation_text}{r.recipient_name ? `, ${r.recipient_name}` : ''}{r.recipient_title ? ` (${r.recipient_title})` : ''}</div>)) : '—'}</dd>
              <dt>Dispatch</dt><dd>{details.dispatched_at ? `${fmtDateTime(details.dispatched_at)} by ${details.dispatched_by_name} (${METHOD_LABEL[details.dispatch_method]})` : 'Not dispatched'}</dd>
              <dt>Delivery</dt><dd>{details.delivered_at ? `${fmtDateTime(details.delivered_at)}. Proof: ${details.proof_of_delivery_note ?? 'scanned receipt'}` : 'Not delivered'}</dd>
              <dt>Feedback</dt><dd>{details.feedback_required ? (<>Due {fmtDate(details.feedback_due_date)} · follow-up: {details.fbofficer?.full_name}{details.feedback_received_at ? <><br /><span className="badge badge--success">Received</span> {details.reply && <Link href={`/documents/${details.reply.id}`}>{details.reply.reference_number}</Link>}</> : ''}</>) : 'Not required'}</dd>
            </>)}
          </dl>
        </section>
        <section className="nec-panel">
          <h2 className="section-title">Where it is now</h2>
          <dl className="kv">
            <dt>Status</dt><dd><StatusBadge status={doc.status} overdue={!!overdue} /></dd>
            <dt>Held by</dt><dd>{doc.holder?.full_name ?? '—'}{doc.holder?.job_title ? `, ${doc.holder.job_title}` : ''}</dd>
            <dt>Held for</dt><dd>{fmtSince(doc.current_holder_since)} (since {fmtDateTime(doc.current_holder_since)})</dd>
            {incoming && <><dt>Due</dt><dd>{fmtDateTime(doc.due_at)}{overdue ? <> <span className="badge badge--danger">Overdue</span></> : ''}</dd></>}
            <dt>Paper original</dt><dd>{doc.current_physical_location ?? doc.physical_file_location ?? '—'}</dd>
            {doc.closed_at && <><dt>{doc.status === 'filed' ? 'Filed' : 'Closed'}</dt><dd>{fmtDateTime(doc.closed_at)} by {doc.closer?.full_name}<br />Note: {doc.closing_note}</dd></>}
            {links.length > 0 && <><dt>Linked documents</dt><dd>{links.map((l: Row, i: number) => <div key={i}>{LINK_LABEL[l.link_type]?.[l.dir === 'to' ? 0 : 1]}: <Link href={`/documents/${l.other.id}`}>{l.other.reference_number}</Link> <span className="caption">{l.other.subject}</span></div>)}</dd></>}
          </dl>
        </section>
      </div>

      <Panels doc={doc} profile={profile} lookups={lookups} unacked={unackedMine} details={details} recipients={recipients} />

      <section>
        <div className="block"><h2 className="section-title">Files</h2><p className="caption">Stored files are read-only and carry a SHA-256 fingerprint. The reference number{incoming ? ' and receipt date are' : ' is'} stamped on every copy you open or print.</p></div>
        {vers.length === 0 ? <div className="empty">No file yet.</div> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>File</th><th>Version</th><th>Size</th><th>Uploaded</th><th>Fingerprint</th><th>Open</th></tr></thead>
            <tbody>{vers.map((v) => (
              <tr key={v.id}>
                <td>{({ main_scan: 'Main scan', attachment: 'Attachment', draft: 'Draft', signed_copy: 'Signed copy', proof_of_delivery: 'Proof of delivery', acknowledgement_slip: 'Slip' } as Record<string, string>)[v.file?.file_kind] ?? v.file?.file_kind}{v.file?.title && v.file.title !== 'Scanned document' ? `: ${v.file.title}` : ''}
                  <div className="caption">{v.original_filename}{v.page_count ? ` · ${v.page_count} page(s)` : ''}{v.is_pdfa ? ' · PDF/A' : ''}{v.mime_type === 'application/pdf' && !v.has_text ? ' · no text layer' : ''}</div></td>
                <td>v{v.version_number}{v.reason && <div className="caption">{v.reason}</div>}</td>
                <td className="nowrap">{KB(v.size_bytes)}</td>
                <td className="nowrap">{fmtDateTime(v.uploaded_at)}<div className="caption">{v.uploader?.full_name}</div></td>
                <td className="mono caption" title={v.sha256}>{String(v.sha256).slice(0, 16)}…</td>
                <td className="nowrap"><a href={`/api/files/${v.id}`} target="_blank" rel="noopener">View</a> · <a href={`/api/files/${v.id}?download=1`}>Download</a></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      <section>
        <div className="block"><h2 className="section-title">History</h2><p className="caption">Every hand-over, instruction, action, file and correction. Earlier steps cannot be removed.</p></div>
        <ol className="timeline">
          {(history.data ?? []).map((h: Row, i: number) => (
            <li key={i}>
              <span className="when">{fmtDateTime(h.at)}</span>
              <span><span className="kind">{h.kind}</span>{h.by_name ? ` · ${h.by_name}` : ''}{h.from_name || h.to_name ? ` · ${h.from_name ?? ''} → ${h.to_name ?? ''}` : ''}{h.detail ? <><br /><span style={{ whiteSpace: 'pre-wrap' }}>{h.detail}</span></> : null}</span>
            </li>
          ))}
        </ol>
      </section>

      {(corrections.data ?? []).length > 0 && (
        <section>
          <div className="block"><h2 className="section-title">Corrections</h2></div>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Requested</th><th>Field</th><th>Old value</th><th>New value</th><th>Reason</th><th>Decision</th></tr></thead>
            <tbody>{(corrections.data as Row[]).map((c) => (
              <tr key={c.id}>
                <td className="nowrap">{fmtDateTime(c.requested_at)}<div className="caption">{c.requester?.full_name}</div></td>
                <td>{String(c.field_name).replace(/_/g, ' ')}</td>
                <td>{c.old_value === null ? '—' : String(typeof c.old_value === 'object' ? JSON.stringify(c.old_value) : c.old_value)}</td>
                <td>{c.new_value === null ? '—' : String(typeof c.new_value === 'object' ? JSON.stringify(c.new_value) : c.new_value)}</td>
                <td>{c.reason}</td>
                <td>{c.status === 'pending' ? <span className="badge badge--warning">Pending</span> : <><span className={`badge ${c.status === 'approved' ? 'badge--success' : 'badge--danger'}`}>{c.status === 'approved' ? 'Approved' : 'Rejected'}</span><div className="caption">{c.reviewer?.full_name} · {fmtDateTime(c.reviewed_at)}{c.review_note ? ` · ${c.review_note}` : ''}</div></>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>
      )}
    </>
  );
}
