'use client';
import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import type { FormState } from '@/lib/actions';

export function SubmitButton({ children, className = 'nec-btn nec-btn--primary', pendingLabel }: { children: React.ReactNode; className?: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-disabled={pending}>
      {pending ? pendingLabel ?? 'Working…' : children}
    </button>
  );
}

/** A form bound to a guarded server action. Shows the error or confirmation under the fields. */
export default function ActionForm({
  action, children, className = 'form', resetOnSuccess = false, encType,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  children: React.ReactNode; className?: string; resetOnSuccess?: boolean; encType?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className} encType={encType}>
      {children}
      {(state?.error || state?.ok) && (
        <div className="notices" style={{ paddingBottom: 'var(--pad-panel)' }} role="status" aria-live="polite">
          {state.error && <div className="notice notice--danger"><strong>Not saved.</strong>{state.error}</div>}
          {state.ok && (
            <div className="notice notice--success">
              <strong>Done.</strong>{state.ok}
              {state.secret && <div style={{ marginTop: 6 }}>Temporary password: <code style={{ fontSize: 16, fontWeight: 700 }}>{state.secret}</code><br /><span className="small">Give it to the user in person. It is shown once and they must change it at first sign-in.</span></div>}
            </div>
          )}
        </div>
      )}
    </form>
  );
}
