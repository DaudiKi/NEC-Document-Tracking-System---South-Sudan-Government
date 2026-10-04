import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { PageHead } from '@/components/ui';

export const metadata = { title: 'Administration' };

const ITEMS = [
  ['/admin/users', 'Users and roles', 'Create accounts, assign roles, reset passwords, suspend, unlock. Only the two System Administrators can do this.'],
  ['/reports/audit-trail', 'Audit trail', 'Every sign-in, view, hand-over, correction and administrator action. Read-only and permanent.'],
  ['/corrections', 'Correction requests', 'Approve or reject corrections to locked records.'],
  ['/admin/settings', 'Lists and response times', 'Categories, document types, departments and the response time for each priority.'],
  ['/admin/integrity', 'Integrity, alerts and backups', 'Check that stored files match their fingerprints, send alerts now, and record restore tests.'],
];

export default async function Admin() {
  await requireUser(['system_administrator']);
  return (
    <>
      <PageHead eyebrow="System Administrators" title="Administration">Only the Executive Director and the Secretary hold administrator rights. Every administrator action is visible to the other in the audit trail.</PageHead>
      <div className="nec-grid nec-grid--2">
        {ITEMS.map(([href, title, text]) => (
          <Link key={href} href={href} className="nec-panel" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h2 className="section-title">{title}</h2><p className="muted">{text}</p><span className="nec-link" style={{ alignSelf: 'flex-start' }}>Open</span>
          </Link>
        ))}
      </div>
    </>
  );
}
