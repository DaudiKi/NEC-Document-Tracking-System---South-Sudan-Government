'use client';
import { useState } from 'react';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import { signIn } from './actions';
import { DEMO_ACCOUNTS, isDemoEmail } from '@/lib/demo';

/** Sign-in form. In demo mode, choosing (or typing) a demo account fills the password slot with a
 *  locked, masked value. The real password is not in the page: the server adds it on submit. */
export default function LoginForm({ demo }: { demo: boolean }) {
  const [email, setEmail] = useState('');
  const locked = demo && isDemoEmail(email);
  const block = (e: React.SyntheticEvent) => e.preventDefault();
  return (
    <>
      <ActionForm action={signIn} className="stack">
        <div className="field">
          <label htmlFor="email">Email address</label>
          <input id="email" name="email" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          {locked ? (
            <>
              <input type="hidden" name="demo" value="1" />
              <input
                id="password" type="text" value="••••••••••••" readOnly tabIndex={-1} autoComplete="off" spellCheck={false}
                aria-label="Demo password, filled in automatically and locked" aria-readonly="true"
                className="locked-secret"
                onCopy={block} onCut={block} onPaste={block} onDrag={block} onDragStart={block} onContextMenu={block} onSelect={block} onMouseDown={block} onDoubleClick={block}
              />
              <span className="hint">Demo account: the password is filled in automatically and cannot be viewed, copied or changed.</span>
            </>
          ) : (
            <>
              <input id="password" name="password" type="password" autoComplete="current-password" required />
              <span className="hint">At least 10 characters. Changed every 90 days. The account locks after 5 failed attempts.</span>
            </>
          )}
        </div>
        <div><SubmitButton pendingLabel="Signing in…">Sign In</SubmitButton></div>
      </ActionForm>
      {demo && (
        <details className="login__demo" open>
          <summary>Demo accounts: choose one, then Sign In</summary>
          <table>
            <tbody>
              {DEMO_ACCOUNTS.map(([e, role]) => (
                <tr key={e}>
                  <td>{role}</td>
                  <td><button type="button" onClick={() => { setEmail(e); document.getElementById('email')?.focus(); }} aria-pressed={email === e}>{e}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </>
  );
}
