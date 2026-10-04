import { getAuth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { signOut } from '@/app/login/actions';
import { PageHead, Notice } from '@/components/ui';

export const metadata = { title: 'No access' };

export default async function NoAccess({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const a = await getAuth();
  if (!a) redirect('/login');
  const { reason } = await searchParams;
  return (
    <main id="main" className="app-main" style={{ maxWidth: 720, margin: '0 auto' }}>
      <PageHead title="You cannot use the system yet" />
      <div className="block stack">
        {reason === 'blocked'
          ? <Notice kind="danger" label="Account blocked.">This account is locked or suspended. Contact a System Administrator to unlock it.</Notice>
          : <Notice kind="warning" label="No role assigned.">You are signed in as {a.user.email}, but a System Administrator has not given this account a role. Ask the Executive Director or the Secretary to set it up.</Notice>}
        <form action={signOut}><button className="nec-btn nec-btn--outline" type="submit">Sign Out</button></form>
      </div>
    </main>
  );
}
