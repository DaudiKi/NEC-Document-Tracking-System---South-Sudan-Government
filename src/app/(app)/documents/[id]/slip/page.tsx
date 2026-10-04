import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import PrintButton from '@/components/PrintButton';
import { Notice } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';

export const metadata = { title: 'Acknowledgement slip' };
export const dynamic = 'force-dynamic';

export default async function SlipPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const { id } = await params;
  const { new: isNew } = await searchParams;
  const { supabase, profile } = await requireUser(['registry_officer', 'system_administrator', 'executive_viewer', 'auditor']);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data: s, error } = await supabase.rpc('get_receipt_slip', { p_doc: id });
  if (error || !s) notFound();
  return (
    <>
      <div className="noprint-actions no-print">
        <PrintButton label="Print Slip and Label" />
        <Link className="nec-btn nec-btn--outline" href="/documents/incoming/new">Register Another</Link>
        {s.classification !== 'confidential' && <Link className="nec-btn nec-btn--outline" href={`/documents/${id}`}>Open Record</Link>}
        <Link className="nec-btn nec-btn--outline" href="/">Registry Desk</Link>
      </div>
      {isNew && <div className="notices no-print"><Notice kind="success" label="Registered and routed.">Give the person who delivered the document this slip. Stick the label on the paper original.</Notice></div>}
      <article className="slip">
        <div className="slip__head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/nec-emblem.svg" alt="" />
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18 }}>National Elections Commission</div>
            <div className="caption">{s.office} · Republic of South Sudan</div>
          </div>
        </div>
        <div className="nec-eyebrow">Acknowledgement of receipt</div>
        <div className="slip__ref">{s.reference_number}</div>
        <table>
          <tbody>
            <tr><th>Received</th><td>{fmtDateTime(s.received_at)} (South Sudan time)</td></tr>
            <tr><th>From</th><td>{s.sender}</td></tr>
            <tr><th>Delivered by</th><td>{s.delivered_by_name}{s.delivered_by_phone ? `, ${s.delivered_by_phone}` : ''} · ID seen: {s.delivered_by_id_seen ? 'Yes' : 'No'}</td></tr>
            <tr><th>Pages · attachments</th><td>{s.number_of_pages} · {s.number_of_attachments}</td></tr>
            <tr><th>Received by</th><td>{s.registered_by}</td></tr>
          </tbody>
        </table>
        <p className="caption" style={{ marginTop: 16 }}>Quote the reference number above in any follow-up. This slip confirms receipt only; it does not state the decision on the document.</p>
        <div className="label-box">
          <div className="nec-eyebrow">Receipt label · stick on the original</div>
          <div className="ref">{s.reference_number}</div>
          <div className="small">Received {fmtDateTime(s.received_at)} · {s.office}</div>
        </div>
        <div style={{ marginTop: 40, maxWidth: 360 }}><div className="sign-line" /><div className="caption">Signature of the person delivering ({s.delivered_by_name})</div></div>
      </article>
    </>
  );
}
