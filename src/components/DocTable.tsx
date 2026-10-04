import Link from 'next/link';
import type { Row } from '@/lib/constants';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { StatusBadge, PriorityBadge, ClassBadge, Empty } from '@/components/ui';

/** Results of public.search_documents(), as a register table. */
export default function DocTable({ rows, empty = 'No documents found.', showHolder = true }: { rows: Row[]; empty?: string; showHolder?: boolean }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Reference</th><th>Subject</th><th>From / To</th><th>Priority</th><th>Status</th>{showHolder && <th>Held by</th>}<th>Due</th><th>Registered</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="ref"><Link href={`/documents/${r.id}`}>{r.reference_number}</Link></td>
              <td style={{ minWidth: 220 }}>
                <Link href={`/documents/${r.id}`} style={{ textDecoration: 'none', color: 'var(--heading)', fontWeight: 600 }}>{r.subject}</Link>
                {r.classification !== 'open' && <> <ClassBadge c={r.classification} /></>}
                {r.is_voided && <> <span className="badge badge--ink">Voided</span></>}
                {r.snippet && <div className="caption" dangerouslySetInnerHTML={{ __html: '…' + sanitizeSnippet(r.snippet) + '…' }} />}
              </td>
              <td>{r.party}</td>
              <td><PriorityBadge p={r.priority} /></td>
              <td><StatusBadge status={r.status} overdue={r.is_overdue} />{r.is_overdue && <div className="caption">{r.days_overdue} day(s) late</div>}</td>
              {showHolder && <td>{r.holder_name ?? ''}</td>}
              <td className="nowrap">{r.direction === 'incoming' ? fmtDateTime(r.due_at) : ''}</td>
              <td className="nowrap">{fmtDate(r.registered_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** ts_headline wraps hits in <b>; keep only those tags. */
function sanitizeSnippet(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>');
}
