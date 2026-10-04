import { requireUser } from '@/lib/auth';
import Header from '@/components/Header';
import IdleLogout from '@/components/IdleLogout';
import { idleSignOut } from '@/app/login/actions';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile } = await requireUser();
  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', profile.id).is('read_at', null);
  return (
    <>
      <Header profile={profile} unread={count ?? 0} />
      <main id="main" className="app-main">{children}</main>
      <IdleLogout logoutAction={idleSignOut} />
    </>
  );
}
