import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { PageHead, Empty } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
import type { Row } from '@/lib/constants';

export const metadata = { title: 'Notifications' };
export const dynamic = 'force-dynamic';

async function markAllRead() {
  'use server';
  const { supabase, profile } = await requireUser();
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', profile.id).is('read_at', null);
  revalidatePath('/notifications');
  revalidatePath('/', 'layout');
}

export default async function Notifications() {
  const { supabase, profile } = await requireUser();
  const { data } = await supabase.from('notifications').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(100);
  const rows: Row[] = data ?? [];
  const unread = rows.filter((r) => !r.read_at).length;
  return (
    <>
      <PageHead eyebrow="Alerts" title="Notifications" actions={unread > 0 && <form action={markAllRead}><button className="nec-btn nec-btn--outline" type="submit">Mark All Read</button></form>}>
        New items assigned to you, items due within 24 hours, overdue items, and overdue feedback.
      </PageHead>
      {rows.length === 0 ? <Empty>Nothing yet.</Empty> : (
        <ul className="timeline">
          {rows.map((n) => (
            <li key={n.id} style={n.read_at ? undefined : { background: 'var(--sky)' }}>
              <span className="when">{fmtDateTime(n.created_at)}</span>
              <span>
                <span className="kind">{n.document_id ? <Link href={`/documents/${n.document_id}`}>{n.title}</Link> : n.title}</span>
                {!n.read_at && <> <span className="badge badge--info">New</span></>}
                {n.body && <><br />{n.body}</>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
