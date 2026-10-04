import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { PageHead } from '@/components/ui';
import { REPORTS } from '@/lib/reports';

export const metadata = { title: 'Reports' };

export default async function Reports() {
  const { profile } = await requireUser(['system_administrator', 'registry_officer', 'executive_viewer', 'auditor']);
  const list = REPORTS.filter((r) => !r.roles || r.roles.includes(profile.role));
  return (
    <>
      <PageHead eyebrow="Reporting" title="Reports">Every report can be exported to Excel and PDF. Exports are recorded in the audit trail, with the filters used.</PageHead>
      <div className="nec-grid nec-grid--2">
        {list.map((r) => (
          <Link key={r.slug} href={`/reports/${r.slug}`} className="nec-panel" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h2 className="section-title">{r.title}</h2>
            <p className="muted">{r.description}</p>
            <span className="nec-link" style={{ alignSelf: 'flex-start' }}>Open</span>
          </Link>
        ))}
        <Link href="/delivery-book" className="nec-panel" style={{ textDecoration: 'none', color: 'inherit' }}>
          <h2 className="section-title">Delivery book (dispatch register)</h2>
          <p className="muted">A printable page for messengers to collect recipient signatures.</p>
          <span className="nec-link" style={{ alignSelf: 'flex-start' }}>Open</span>
        </Link>
      </div>
    </>
  );
}
