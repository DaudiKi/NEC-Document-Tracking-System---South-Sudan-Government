import Link from 'next/link';
import type { Lookups } from '@/lib/auth';
import { STATUS_LABEL, PRIORITY_LABEL, CLASS_LABEL } from '@/lib/constants';
import type { SearchParams } from '@/lib/search';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** Quick search box plus the advanced filters (GET form, so results are linkable). */
export default function SearchForm({ action, sp, lookups, direction, showDirection }: {
  action: string; sp: SearchParams; lookups: Lookups; direction?: 'incoming' | 'outgoing'; showDirection?: boolean;
}) {
  const statuses = direction === 'incoming'
    ? ['registered', 'routed', 'with_action_officer', 'action_taken', 'returned_for_clarification', 'on_hold', 'filed', 'closed']
    : direction === 'outgoing'
      ? ['draft', 'final', 'dispatched', 'delivered', 'awaiting_feedback', 'closed']
      : Object.keys(STATUS_LABEL);
  return (
    <form method="get" action={action} role="search" aria-label="Search documents">
      <div className="filters">
        <div className="field" style={{ gridColumn: 'span 2' }}>
          <label htmlFor="q">Search</label>
          <input id="q" name="q" type="search" defaultValue={one(sp.q)} placeholder="Reference, sender, subject or words inside the scan" />
        </div>
        {showDirection && (
          <div className="field"><label htmlFor="direction">Direction</label>
            <select id="direction" name="direction" defaultValue={one(sp.direction)}><option value="">Incoming and outgoing</option><option value="incoming">Incoming</option><option value="outgoing">Outgoing</option></select></div>
        )}
        <div className="field"><label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={one(sp.status)}><option value="">Any</option>{statuses.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></div>
        <div className="field"><label htmlFor="priority">Priority</label>
          <select id="priority" name="priority" defaultValue={one(sp.priority)}><option value="">Any</option>{Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label htmlFor="classification">Classification</label>
          <select id="classification" name="classification" defaultValue={one(sp.classification)}><option value="">Any</option>{Object.entries(CLASS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label htmlFor="office">Office</label>
          <select id="office" name="office" defaultValue={one(sp.office)}><option value="">Both</option>{lookups.offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
        <div className="field"><label htmlFor="category">Category</label>
          <select id="category" name="category" defaultValue={one(sp.category)}><option value="">Any</option>{lookups.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label htmlFor="holder">Officer holding it</label>
          <select id="holder" name="holder" defaultValue={one(sp.holder)}><option value="">Anyone</option>{lookups.users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></div>
        <div className="field"><label htmlFor="from">Registered from</label><input id="from" name="from" type="date" defaultValue={one(sp.from)} /></div>
        <div className="field"><label htmlFor="to">Registered to</label><input id="to" name="to" type="date" defaultValue={one(sp.to)} /></div>
        <label className="check"><input type="checkbox" name="overdue" defaultChecked={one(sp.overdue) === 'on'} /> Overdue only</label>
        <label className="check"><input type="checkbox" name="voided" defaultChecked={one(sp.voided) === 'on'} /> Include voided</label>
        <div className="row"><button className="nec-btn nec-btn--primary" type="submit">Search</button><Link className="nec-link" href={action}>Clear</Link></div>
      </div>
    </form>
  );
}
