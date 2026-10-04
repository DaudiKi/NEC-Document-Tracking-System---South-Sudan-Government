import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { PageHead, Notice, StatusBadge, PriorityBadge } from '@/components/ui';
import DocTable from '@/components/DocTable';
import { STATUS_LABEL, type Row } from '@/lib/constants';
import { fmtDateTime, fmtSince } from '@/lib/format';

export const metadata = { title: 'Home' };
export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { denied } = await searchParams;
  const { supabase, profile } = await requireUser();
  const deniedNote = denied ? <div className="notices"><Notice kind="warning" label="Not available.">That page is not available for your role.</Notice></div> : null;

  if (profile.role === 'action_officer') return <MyWork supabase={supabase} profile={profile} note={deniedNote} />;
  if (profile.role === 'registry_officer') return <RegistryDesk supabase={supabase} note={deniedNote} />;
  return <Dashboard supabase={supabase} profile={profile} note={deniedNote} />;
}

async function Dashboard({ supabase, profile, note }: { supabase: any; profile: any; note: React.ReactNode }) {
  const { data } = await supabase.rpc('dashboard_summary');
  const d: Row = data ?? {};
  const sum = (rows: Row[], k: string) => (rows ?? []).reduce((a, r) => a + Number(r[k] ?? 0), 0);
  const openTotal = sum(d.open_by_status ?? [], 'count');
  const maxStatus = Math.max(1, ...(d.open_by_status ?? []).map((r: Row) => Number(r.count)));
  return (
    <>
      <PageHead eyebrow="Both offices" title={profile.role === 'auditor' ? 'Overview' : 'Dashboard'}>
        What came in, what went out, and what is late. Figures follow what you are allowed to see.
      </PageHead>
      {note}
      {(d.unacknowledged ?? 0) > 0 && <div className="notices"><Notice kind="warning" label="Not acknowledged.">{d.unacknowledged} hand-over(s) have waited more than 24 hours for the receiving officer to acknowledge.</Notice></div>}
      <div className="nec-grid nec-grid--4">
        <div className="nec-panel"><div className="stat"><span className="stat__value">{sum(d.received ?? [], 'week')}</span><span className="stat__label">Received this week</span></div></div>
        <div className="nec-panel"><div className="stat"><span className="stat__value">{sum(d.received ?? [], 'month')}</span><span className="stat__label">Received this month</span></div></div>
        <div className="nec-panel"><div className="stat"><span className="stat__value">{sum(d.dispatched ?? [], 'week')}</span><span className="stat__label">Dispatched this week</span></div></div>
        <div className="nec-panel"><div className="stat"><span className="stat__value">{sum(d.dispatched ?? [], 'month')}</span><span className="stat__label">Dispatched this month</span></div></div>
      </div>
      <div className="nec-grid nec-grid--2">
        <section className="nec-panel">
          <h2 className="section-title">By office</h2>
          <table className="tbl" style={{ margin: '0 calc(-1 * var(--pad-panel))', width: 'calc(100% + 2 * var(--pad-panel))' }}>
            <thead><tr><th>Office</th><th className="num">Received (week)</th><th className="num">Received (month)</th><th className="num">Dispatched (week)</th><th className="num">Dispatched (month)</th></tr></thead>
            <tbody>
              {(d.received ?? []).map((r: Row) => {
                const o = (d.dispatched ?? []).find((x: Row) => x.office === r.office) ?? {};
                return <tr key={r.office}><td>{r.office === 'CH' ? 'Chairperson (CH)' : r.office === 'SG' ? 'Secretary General (SG)' : r.office}</td><td className="num">{r.week}</td><td className="num">{r.month}</td><td className="num">{o.week ?? 0}</td><td className="num">{o.month ?? 0}</td></tr>;
              })}
            </tbody>
          </table>
        </section>
        <section className="nec-panel">
          <div className="panel-head"><h2 className="section-title">Open items by status</h2><span className="caption">{openTotal} open</span></div>
          {openTotal === 0 ? <p className="muted">Nothing is open.</p> : (
            <div className="bars">
              {(d.open_by_status ?? []).map((r: Row) => (
                <div className="bar" key={r.status}>
                  <span>{STATUS_LABEL[r.status] ?? r.status}</span>
                  <div className="bar__track"><div className="bar__fill" style={{ width: `${(Number(r.count) / maxStatus) * 100}%` }} /></div>
                  <span className="right mono">{r.count}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      <section className="block">
        <div className="panel-head" style={{ marginBottom: 12 }}><h2 className="section-title">Overdue incoming items</h2><Link className="nec-link" href="/reports/overdue-by-officer">Full report</Link></div>
        {(d.overdue ?? []).length === 0 ? <p className="muted">Nothing is overdue.</p> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Reference</th><th>Subject</th><th>Responsible officer</th><th>Priority</th><th>Due</th><th className="num">Days overdue</th></tr></thead>
            <tbody>{(d.overdue as Row[]).map((r) => (
              <tr key={r.id}><td className="ref"><Link href={`/documents/${r.id}`}>{r.reference}</Link></td><td>{r.subject}</td><td>{r.holder}</td><td><PriorityBadge p={r.priority} /></td><td className="nowrap">{fmtDateTime(r.due_at)}</td><td className="num"><span className="badge badge--danger">{r.days_overdue}</span></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      <div className="nec-grid nec-grid--2">
        <section className="nec-panel">
          <h2 className="section-title">Outgoing documents past their feedback date</h2>
          {(d.feedback_overdue ?? []).length === 0 ? <p className="muted">No feedback is overdue.</p> : (
            <table className="tbl" style={{ margin: '0 calc(-1 * var(--pad-panel))', width: 'calc(100% + 2 * var(--pad-panel))' }}>
              <thead><tr><th>Reference</th><th>Follow-up officer</th><th className="num">Days overdue</th></tr></thead>
              <tbody>{(d.feedback_overdue as Row[]).map((r) => <tr key={r.id}><td className="ref"><Link href={`/documents/${r.id}`}>{r.reference}</Link><div className="caption">{r.subject}</div></td><td>{r.officer}</td><td className="num"><span className="badge badge--danger">{r.days_overdue}</span></td></tr>)}</tbody>
            </table>
          )}
        </section>
        <section className="nec-panel">
          <h2 className="section-title">Urgent items received in the last 24 hours</h2>
          {(d.urgent_24h ?? []).length === 0 ? <p className="muted">No urgent items in the last 24 hours.</p> : (
            <table className="tbl" style={{ margin: '0 calc(-1 * var(--pad-panel))', width: 'calc(100% + 2 * var(--pad-panel))' }}>
              <thead><tr><th>Reference</th><th>Held by</th><th>Status</th></tr></thead>
              <tbody>{(d.urgent_24h as Row[]).map((r) => <tr key={r.id}><td className="ref"><Link href={`/documents/${r.id}`}>{r.reference}</Link><div className="caption">{r.subject}</div></td><td>{r.holder}</td><td><StatusBadge status={r.status} /></td></tr>)}</tbody>
            </table>
          )}
        </section>
      </div>
      <section className="block">
        <h2 className="section-title" style={{ marginBottom: 12 }}>Open items by officer</h2>
        {(d.open_by_officer ?? []).length === 0 ? <p className="muted">No open items.</p> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Officer</th><th className="num">Open</th><th className="num">Overdue</th></tr></thead>
            <tbody>{(d.open_by_officer as Row[]).map((r) => <tr key={r.officer}><td>{r.officer}</td><td className="num">{r.open}</td><td className="num">{r.overdue > 0 ? <span className="badge badge--danger">{r.overdue}</span> : 0}</td></tr>)}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}

async function RegistryDesk({ supabase, note }: { supabase: any; note: React.ReactNode }) {
  const [incoming, outgoing] = await Promise.all([
    supabase.rpc('search_documents', { p_direction: 'incoming', p_limit: 10 }),
    supabase.rpc('search_documents', { p_direction: 'outgoing', p_limit: 10 }),
  ]);
  const { data: dispatchReady } = await supabase.rpc('search_documents', { p_direction: 'outgoing', p_statuses: ['final', 'dispatched', 'awaiting_feedback'], p_limit: 50 });
  return (
    <>
      <PageHead eyebrow="Registry" title="Registry desk" actions={<>
        <Link className="nec-btn nec-btn--primary" href="/documents/incoming/new">Register Incoming</Link>
        <Link className="nec-btn nec-btn--outline" href="/documents/outgoing/new">Register Outgoing</Link>
      </>}>Register every document on the day it arrives, scan it, and route it before it leaves the registry.</PageHead>
      {note}
      <div className="nec-grid nec-grid--2">
        <section className="nec-panel" style={{ padding: 0 }}>
          <div className="block panel-head"><h2 className="section-title">Latest incoming</h2><Link className="nec-link" href="/documents/incoming">All incoming</Link></div>
          <DocTable rows={incoming.data ?? []} empty="Nothing registered yet." />
        </section>
        <section className="nec-panel" style={{ padding: 0 }}>
          <div className="block panel-head"><h2 className="section-title">Latest outgoing</h2><Link className="nec-link" href="/documents/outgoing">All outgoing</Link></div>
          <DocTable rows={outgoing.data ?? []} empty="Nothing registered yet." showHolder={false} />
        </section>
      </div>
      <section className="block">
        <div className="panel-head" style={{ marginBottom: 12 }}><h2 className="section-title">Outgoing in progress</h2><Link className="nec-link" href="/delivery-book">Print delivery book</Link></div>
        <DocTable rows={dispatchReady ?? []} empty="No outgoing documents are waiting for dispatch, delivery or feedback." showHolder={false} />
      </section>
    </>
  );
}

async function MyWork({ supabase, profile, note }: { supabase: any; profile: any; note: React.ReactNode }) {
  const [mine, unack] = await Promise.all([
    supabase.rpc('search_documents', { p_holder: profile.id, p_limit: 100 }),
    supabase.from('document_movements').select('id, moved_at, reason, document_id, documents(reference_number, subject, priority)')
      .eq('to_user_id', profile.id).is('acknowledged_at', null).order('moved_at'),
  ]);
  const open = (mine.data ?? []).filter((r: Row) => !['closed', 'filed'].includes(r.status));
  const late = open.filter((r: Row) => r.is_overdue).length;
  return (
    <>
      <PageHead eyebrow={profile.full_name} title="My work">Documents routed to you. Acknowledge receipt, record what you did, and close the item with a note.</PageHead>
      {note}
      <div className="nec-grid nec-grid--3">
        <div className="nec-panel"><div className="stat"><span className="stat__value">{(unack.data ?? []).length}</span><span className="stat__label">Waiting for you to acknowledge</span></div></div>
        <div className="nec-panel"><div className="stat"><span className="stat__value">{open.length}</span><span className="stat__label">Open items with you</span></div></div>
        <div className="nec-panel"><div className="stat"><span className="stat__value">{late}</span><span className="stat__label">Overdue</span></div></div>
      </div>
      {(unack.data ?? []).length > 0 && (
        <section className="block">
          <h2 className="section-title" style={{ marginBottom: 12 }}>Acknowledge receipt</h2>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Reference</th><th>Subject</th><th>Priority</th><th>Handed over</th><th>Reason</th></tr></thead>
            <tbody>{(unack.data as Row[]).map((m) => (
              <tr key={m.id}>
                <td className="ref"><Link href={`/documents/${m.document_id}`}>{m.documents?.reference_number}</Link></td>
                <td>{m.documents?.subject}</td><td>{m.documents && <PriorityBadge p={m.documents.priority} />}</td>
                <td className="nowrap">{fmtDateTime(m.moved_at)} <span className="caption">({fmtSince(m.moved_at)} ago)</span></td><td>{m.reason}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>
      )}
      <section>
        <div className="block"><h2 className="section-title">Items with you</h2></div>
        <DocTable rows={mine.data ?? []} empty="Nothing is routed to you at the moment." showHolder={false} />
      </section>
    </>
  );
}
