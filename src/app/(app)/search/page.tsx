import { requireUser, loadLookups } from '@/lib/auth';
import { PageHead, Notice } from '@/components/ui';
import SearchForm from '@/components/SearchForm';
import DocTable from '@/components/DocTable';
import Pager from '@/components/Pager';
import { runSearch, type SearchParams } from '@/lib/search';

export const metadata = { title: 'Search' };
export const dynamic = 'force-dynamic';

export default async function SearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const [lookups, res] = await Promise.all([loadLookups(), runSearch(supabase, sp)]);
  const searched = Object.keys(sp).length > 0;
  return (
    <>
      <PageHead eyebrow="Find any document" title="Search">
        By reference number, sender, subject, date range, status, officer, or words inside the scanned text. You only see what you are entitled to see.
      </PageHead>
      <SearchForm action="/search" sp={sp} lookups={lookups} showDirection />
      {res.error && <div className="notices"><Notice kind="danger" label="Search failed.">{res.error}</Notice></div>}
      <DocTable rows={res.rows} empty={searched ? 'No documents match.' : 'Type something above, or use the filters, to find a document.'} />
      <Pager base="/search" sp={sp} total={res.total} page={res.page} />
    </>
  );
}
