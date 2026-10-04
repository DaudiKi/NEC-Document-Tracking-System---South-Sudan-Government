import { signIn } from './actions';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import { Notice } from '@/components/ui';
import DemoAccounts from './DemoAccounts';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const demo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  return (
    <main className="login">
      <section className="login__brand" aria-label="National Elections Commission">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/nec-logo-reversed.svg" alt="Republic of South Sudan, National Elections Commission. Free, Fair and Transparent Elections" />
        <div>
          <div className="nec-eyebrow" style={{ color: 'var(--nec-cyan)', marginBottom: 12 }}>Office of the Chairperson and Office of the Secretary General</div>
          <h1>Document Tracking System</h1>
          <p style={{ marginTop: 20 }}>Every incoming and outgoing document registered, scanned, routed and followed up, with a record that cannot be changed without a permanent trace.</p>
        </div>
        <ul>
          <li>A personal account for every officer</li>
          <li>Reference numbers issued at registration and never reused</li>
          <li>Every view, hand-over and correction written to the audit trail</li>
        </ul>
      </section>
      <section className="login__panel" aria-labelledby="signin-title">
        <div>
          <div className="nec-eyebrow" style={{ marginBottom: 6 }}>Authorised staff only</div>
          <h2 id="signin-title">Sign in</h2>
        </div>
        {reason === 'idle' && <Notice kind="warning" label="Signed out.">You were signed out after 15 minutes without activity. Sign in again to continue.</Notice>}
        {reason === 'changed' && <Notice kind="success" label="Password changed.">Sign in with your new password.</Notice>}
        <ActionForm action={signIn} className="stack">
          <div className="field">
            <label htmlFor="email">Email address</label>
            <input id="email" name="email" type="email" autoComplete="username" required autoFocus />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required />
            <span className="hint">At least 10 characters. Changed every 90 days. The account locks after 5 failed attempts.</span>
          </div>
          <div><SubmitButton pendingLabel="Signing in…">Sign In</SubmitButton></div>
        </ActionForm>
        {demo && <DemoAccounts />}
        <p className="login__foot">Accounts are created only by the two System Administrators: the Executive Director and the Secretary. Lost your password? Ask an administrator to reset it. Activity on this system is recorded.</p>
      </section>
    </main>
  );
}
