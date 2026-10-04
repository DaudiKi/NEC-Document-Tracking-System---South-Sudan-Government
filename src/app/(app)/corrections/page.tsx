import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { PageHead, Empty } from '@/components/ui';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import { decide } from './actions';
import { fmtDateTime } from '@/lib/format';
import type { Row } from '@/lib/constants';

export const metadata = { title: 'Corrections' };
export const dynamic = 'force-dynamic';

const show = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export default async function Corrections() {
  const { supabase, profile } = await requireUser(['system_administrator', 'registry_officer', 'auditor']);
  const { data } = await supabase.from('correction_requests')
    .select('*, doc:documents(reference_number, subject), requester:profiles!correction_requests_requested_by_fkey(full_name), reviewer:profiles!correction_requests_reviewed_by_fkey(full_name)')
    .order('requested_at', { ascending: false }).limit(200);
  const rows: Row[] = data ?? [];
  const pending = rows.filter((r) => r.status === 'pending');
  const isAdmin = profile.role === 'system_administrator';
  return (
    <>
      <PageHead eyebrow="Locked records" title="Correction requests">
        Saved records are locked. A correction states the field, the new value and the reason; an Administrator approves or rejects it. An Administrator cannot approve their own request.
      </PageHead>
      <section>
        <div className="block"><h2 className="section-title">Waiting for a decision ({pending.length})</h2></div>
        {pending.length === 0 ? <Empty>No pending requests.</Empty> : pending.map((c) => (
          <div className="block" key={c.id} style={{ borderTop: '1px solid var(--hairline)' }}>
            <div className="row row--between">
              <div>
                <Link className="ref" href={`/documents/${c.document_id}`}>{c.doc?.reference_number}</Link> <span className="muted">{c.doc?.subject}</span>
                <div className="small"><strong>{String(c.field_name).replace(/_/g, ' ')}</strong>: {show(c.old_value)} → <strong>{show(c.new_value)}</strong></div>
                <div className="caption">Requested by {c.requester?.full_name} on {fmtDateTime(c.requested_at)}. Reason: {c.reason}</div>
              </div>
              {isAdmin && c.requested_by !== profile.id && (
                <ActionForm action={decide} className="stack" >
                  <input type="hidden" name="id" value={c.id} />
                  <div className="field"><label htmlFor={`n${c.id}`}>Note (required to reject)</label><input id={`n${c.id}`} name="note" type="text" /></div>
                  <div className="row">
                    <button className="nec-btn nec-btn--primary" name="decision" value="approve" type="submit">Approve</button>
                    <button className="nec-btn nec-btn--outline" name="decision" value="reject" type="submit">Reject</button>
                  </div>
                </ActionForm>
              )}
              {isAdmin && c.requested_by === profile.id && <span className="badge badge--warning">The other Administrator must decide</span>}
            </div>
          </div>
        ))}
      </section>
      <section>
        <div className="block"><h2 className="section-title">Decided</h2></div>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Document</th><th>Field</th><th>Old</th><th>New</th><th>Requested by</th><th>Decision</th></tr></thead>
          <tbody>{rows.filter((r) => r.status !== 'pending').map((c) => (
            <tr key={c.id}>
              <td className="ref"><Link href={`/documents/${c.document_id}`}>{c.doc?.reference_number}</Link></td>
              <td>{String(c.field_name).replace(/_/g, ' ')}</td><td>{show(c.old_value)}</td><td>{show(c.new_value)}</td>
              <td>{c.requester?.full_name}<div className="caption">{fmtDateTime(c.requested_at)}</div></td>
              <td><span className={`badge ${c.status === 'approved' ? 'badge--success' : 'badge--danger'}`}>{c.status === 'approved' ? 'Approved' : 'Rejected'}</span><div className="caption">{c.reviewer?.full_name} · {fmtDateTime(c.reviewed_at)}</div></td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>
    </>
  );
}
