import { redirect } from 'next/navigation';
import { getAuth, passwordExpired } from '@/lib/auth';
import { changePassword } from './actions';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import { Notice } from '@/components/ui';

export const metadata = { title: 'Change password' };

export default async function ChangePasswordPage() {
  const a = await getAuth();
  if (!a) redirect('/login');
  if (!a.profile) redirect('/no-access');
  const p = a.profile;
  if (!p.must_change_password && !passwordExpired(p)) redirect('/');
  return (
    <main id="main" className="login" style={{ gridTemplateColumns: '1fr' }}>
      <section className="login__panel" aria-labelledby="cp">
        <div>
          <div className="nec-eyebrow" style={{ marginBottom: 6 }}>{p.full_name}</div>
          <h2 id="cp">Choose a new password</h2>
        </div>
        <Notice kind="warning" label={p.must_change_password ? 'First sign-in.' : 'Password expired.'}>
          {p.must_change_password ? 'Set your own password before you continue.' : 'Passwords are changed every 90 days.'} Use at least 10 characters. You will sign in again afterwards.
        </Notice>
        <ActionForm action={changePassword} className="stack">
          <div className="field"><label htmlFor="password">New password</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required /></div>
          <div className="field"><label htmlFor="confirm">Repeat the new password</label><input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required /></div>
          <div><SubmitButton>Change Password</SubmitButton></div>
        </ActionForm>
      </section>
    </main>
  );
}
