import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { PageHead, Empty } from '@/components/ui';
import { reportBySlug, describeParams, type Params } from '@/lib/reports';
import { cell } from '@/lib/export';
import { EVENT_LABEL } from '@/lib/constants';
import { todayCat } from '@/lib/format';

export const dynamic = 'force-dynamic';
const SHOW = 300;

const EVENTS = ['login', 'logout', 'login_failed', 'account_locked', 'document_viewed', 'document_downloaded', 'document_printed', 'document_created', 'document_updated', 'document_status_changed', 'document_routed', 'document_forwarded', 'document_returned', 'document_reassigned', 'document_acknowledged', 'document_closed', 'document_voided', 'minute_added', 'action_recorded', 'due_date_changed', 'file_version_added', 'correction_requested', 'correction_approved', 'correction_rejected', 'user_created', 'user_role_changed', 'user_suspended', 'user_reactivated', 'user_unlocked', 'password_reset', 'report_exported', 'integrity_check_failed'];

export default async function ReportPage({ params, searchParams }: { params: Promise<{ type: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { type } = await params;
  const sp = await searchParams;
  const def = reportBySlug(type);
  if (!def) notFound();
  const { supabase, profile } = await requireUser(['system_administrator', 'registry_officer', 'executive_viewer', 'auditor']);
  if (def.roles && !def.roles.includes(profile.role)) notFound();
  const p: Params = { from: sp.from, to: sp.to, q: sp.q, ref: sp.ref, month: sp.month, event: sp.event };
  const hasInput = def.params.length === 0 || def.params.some((k) => (k === 'range' ? true : k === 'org' ? true : k === 'month' ? true : k === 'ref' ? !!p.ref : k === 'event' ? true : false));
  const rows = hasInput && !(def.params.includes('ref') && !p.ref) ? await def.fetch(supabase, p) : [];
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <>
      <PageHead eyebrow="Report" title={def.title} actions={<>
        <a className="nec-btn nec-btn--primary" href={`/api/reports/${def.slug}?format=xlsx&${qs}`}>Export Excel</a>
        <a className="nec-btn nec-btn--outline" href={`/api/reports/${def.slug}?format=pdf&${qs}`}>Export PDF</a>
        <Link className="nec-btn nec-btn--outline" href="/reports">All Reports</Link>
      </>}>{def.description}</PageHead>
      <form method="get" className="filters" aria-label="Report filters">
        {def.params.includes('range') && (<>
          <div className="field"><label htmlFor="from">From</label><input id="from" name="from" type="date" defaultValue={sp.from} /></div>
          <div className="field"><label htmlFor="to">To</label><input id="to" name="to" type="date" defaultValue={sp.to} /></div>
        </>)}
        {def.params.includes('org') && <div className="field"><label htmlFor="q">Organisation contains</label><input id="q" name="q" type="text" defaultValue={sp.q} /></div>}
        {def.params.includes('ref') && <div className="field"><label htmlFor="ref">Reference number</label><input id="ref" name="ref" type="text" defaultValue={sp.ref} placeholder="NEC/CH/IN/2026/00001" required /></div>}
        {def.params.includes('month') && <div className="field"><label htmlFor="month">Month</label><input id="month" name="month" type="month" defaultValue={sp.month ?? todayCat().slice(0, 7)} /></div>}
        {def.params.includes('event') && <div className="field"><label htmlFor="event">Event</label><select id="event" name="event" defaultValue={sp.event ?? ''}><option value="">Any</option>{EVENTS.map((e) => <option key={e} value={e}>{EVENT_LABEL(e)}</option>)}</select></div>}
        {def.params.length > 0 && <div><button className="nec-btn nec-btn--primary" type="submit">Show</button></div>}
      </form>
      <div className="block caption">{describeParams(p)} · {rows.length} record(s){rows.length > SHOW ? `. Showing the first ${SHOW}; the export has all of them.` : ''}</div>
      {rows.length === 0 ? <Empty>{def.params.includes('ref') && !p.ref ? 'Enter a reference number to see its full history.' : 'No records for these filters.'}</Empty> : (
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr>{def.columns.map((c) => <th key={c.key} className={c.kind === 'num' ? 'num' : undefined}>{c.label}</th>)}</tr></thead>
          <tbody>{rows.slice(0, SHOW).map((r, i) => (
            <tr key={i}>{def.columns.map((c) => <td key={c.key} className={c.kind === 'num' ? 'num' : undefined}>{String(cell(r[c.key], c.kind))}</td>)}</tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}
