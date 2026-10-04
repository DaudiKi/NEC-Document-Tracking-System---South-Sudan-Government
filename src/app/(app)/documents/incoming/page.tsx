import Link from 'next/link';
import { requireUser, loadLookups } from '@/lib/auth';
import { PageHead, Notice } from '@/components/ui';
import SearchForm from '@/components/SearchForm';
import DocTable from '@/components/DocTable';
import Pager from '@/components/Pager';
import { runSearch, type SearchParams } from '@/lib/search';

export const metadata = { title: 'Incoming register' };
export const dynamic = 'force-dynamic';

export default async function IncomingList({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireUser(['system_administrator', 'registry_officer', 'executive_viewer', 'auditor']);
  const [lookups, res] = await Promise.all([loadLookups(), runSearch(supabase, sp, 'incoming')]);
  return (
    <>
      <PageHead eyebrow="Register" title="Incoming documents" actions={profile.role === 'registry_officer' && <Link className="nec-btn nec-btn--primary" href="/documents/incoming/new">Register Incoming</Link>}>
        Every document received by the Office of the Chairperson and the Office of the Secretary General.
      </PageHead>
      <SearchForm action="/documents/incoming" sp={sp} lookups={lookups} direction="incoming" />
      {res.error && <div className="notices"><Notice kind="danger" label="Search failed.">{res.error}</Notice></div>}
      <DocTable rows={res.rows} />
      <Pager base="/documents/incoming" sp={sp} total={res.total} page={res.page} />
    </>
  );
}
