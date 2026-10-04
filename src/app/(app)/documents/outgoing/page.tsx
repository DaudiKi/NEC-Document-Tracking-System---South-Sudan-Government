import Link from 'next/link';
import { requireUser, loadLookups } from '@/lib/auth';
import { PageHead, Notice } from '@/components/ui';
import SearchForm from '@/components/SearchForm';
import DocTable from '@/components/DocTable';
import Pager from '@/components/Pager';
import { runSearch, type SearchParams } from '@/lib/search';

export const metadata = { title: 'Outgoing register' };
export const dynamic = 'force-dynamic';

export default async function OutgoingList({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireUser(['system_administrator', 'registry_officer', 'executive_viewer', 'auditor']);
  const [lookups, res] = await Promise.all([loadLookups(), runSearch(supabase, sp, 'outgoing')]);
  return (
    <>
      <PageHead eyebrow="Register" title="Outgoing documents" actions={profile.role === 'registry_officer' && <>
        <Link className="nec-btn nec-btn--primary" href="/documents/outgoing/new">Register Outgoing</Link>
        <Link className="nec-btn nec-btn--outline" href="/delivery-book">Delivery Book</Link>
      </>}>
        Registered before dispatch, scanned in final signed form, and tracked until delivery and any feedback.
      </PageHead>
      <SearchForm action="/documents/outgoing" sp={sp} lookups={lookups} direction="outgoing" />
      {res.error && <div className="notices"><Notice kind="danger" label="Search failed.">{res.error}</Notice></div>}
      <DocTable rows={res.rows} showHolder={false} />
      <Pager base="/documents/outgoing" sp={sp} total={res.total} page={res.page} />
    </>
  );
}
