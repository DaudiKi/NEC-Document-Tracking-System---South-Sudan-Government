import Link from 'next/link';
import { PAGE_SIZE, queryString, type SearchParams } from '@/lib/search';

export default function Pager({ base, sp, total, page }: { base: string; sp: SearchParams; total: number; page: number }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, page * PAGE_SIZE);
  return (
    <div className="pager">
      <span className="caption">{total === 0 ? 'No results' : `${from}–${to} of ${total}`}</span>
      <span className="row">
        {page > 1 && <Link className="nec-link" href={`${base}?${queryString(sp, { page: page - 1 })}`}>Previous</Link>}
        {page < pages && <Link className="nec-link" href={`${base}?${queryString(sp, { page: page + 1 })}`}>Next</Link>}
      </span>
    </div>
  );
}
