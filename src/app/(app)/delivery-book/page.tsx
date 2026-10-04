import { requireUser } from '@/lib/auth';
import PrintButton from '@/components/PrintButton';
import { fmtDate, fmtDateTime, todayCat } from '@/lib/format';
import { METHOD_LABEL, type Row } from '@/lib/constants';

export const metadata = { title: 'Delivery book' };
export const dynamic = 'force-dynamic';

export default async function DeliveryBook({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireUser(['registry_officer', 'system_administrator', 'executive_viewer', 'auditor']);
  const { data } = await supabase.from('v_outgoing_register').select('*').eq('is_voided', false).in('status', ['final', 'dispatched']).order('registered_at');
  const rows: Row[] = data ?? [];
  await supabase.rpc('log_client_event', { p_event: 'document_printed', p_document_id: null, p_details: { what: 'delivery book', rows: rows.length } });
  return (
    <>
      <div className="noprint-actions no-print"><PrintButton label="Print Delivery Book" /><span className="caption" style={{ alignSelf: 'center' }}>Documents that are Final or Dispatched and still need a recipient signature.</span></div>
      <article className="slip" style={{ maxWidth: 1000 }}>
        <div className="slip__head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/nec-emblem.svg" alt="" />
          <div><div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 20 }}>Delivery book (dispatch register)</div>
            <div className="caption">National Elections Commission · printed {fmtDateTime(new Date())} by {profile.full_name}</div></div>
        </div>
        <table style={{ fontSize: 13 }}>
          <thead><tr><th style={{ width: '14%' }}>Reference</th><th style={{ width: '24%' }}>Recipient and subject</th><th style={{ width: '12%' }}>Method</th><th style={{ width: '12%' }}>Messenger</th><th style={{ width: '14%' }}>Date delivered</th><th>Recipient name and signature</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="muted">Nothing is waiting for delivery.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.reference_number}</strong><div className="caption">{r.office}</div></td>
                <td>{r.recipients}<div className="caption">{r.subject}</div></td>
                <td>{r.dispatch_method ? METHOD_LABEL[r.dispatch_method] : '—'}</td>
                <td>{r.dispatched_by_name ?? '—'}<div className="caption">{r.dispatched_at ? fmtDate(r.dispatched_at) : ''}</div></td>
                <td><div className="sign-line" style={{ height: 40 }} /></td>
                <td><div className="sign-line" style={{ height: 40 }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </>
  );
}
