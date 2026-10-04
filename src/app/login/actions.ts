'use server';
import { headers, cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { IDLE_COOKIE } from '@/lib/supabase/middleware';
import { guard, str, UserError } from '@/lib/actions';
import { isDemoEmail } from '@/lib/demo';

async function clientInfo() {
  const h = await headers();
  return { ip: (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || null, user_agent: h.get('user-agent') };
}

export const signIn = guard(async (fd) => {
  const email = str(fd, 'email').toLowerCase();
  let password = String(fd.get('password') ?? '');
  // Demo mode: for the listed demo accounts the server supplies the shared password itself, so it
  // never reaches the browser. Outside demo mode the typed password is always used.
  if (fd.get('demo') === '1' && process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && isDemoEmail(email)) {
    if (!process.env.DEMO_PASSWORD) throw new UserError('The demo password is not configured on the server (DEMO_PASSWORD).');
    password = process.env.DEMO_PASSWORD;
  }
  if (!email || !password) throw new UserError('Enter your email address and password.');
  const supabase = await createClient();
  const admin = createAdminClient();
  const hookHandlesLockout = process.env.AUTH_HOOK_ENABLED === 'true';

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    // A network or service problem is not a wrong password: say so, and do not count it toward the lockout.
    if (error && error.code !== 'invalid_credentials' && (!error.status || error.status >= 500)) {
      throw new UserError('The sign-in service could not be reached. Check the connection and try again.');
    }
    // Count the failure (locks the account after 5) unless the Supabase Auth hook already does.
    if (admin && !hookHandlesLockout) {
      const { data: p } = await admin.from('profiles').select('id, locked_at, is_active').eq('email', email).maybeSingle();
      if (p) {
        if (p.locked_at || !p.is_active) throw new UserError('This account is locked or suspended. Contact a System Administrator.');
        await admin.rpc('hook_password_verification_attempt', { event: { user_id: p.id, valid: false } });
      }
    }
    throw new UserError('The email address or password is not correct. After 5 failed attempts the account is locked.');
  }
  const { data: profile } = await supabase.from('profiles').select('is_active, locked_at').eq('id', data.user.id).maybeSingle();
  if (!profile) {
    await supabase.auth.signOut();
    throw new UserError('Your account has no role yet. Ask a System Administrator to set it up.');
  }
  if (!profile.is_active || profile.locked_at) {
    await supabase.auth.signOut();
    throw new UserError('This account is locked or suspended. Contact a System Administrator.');
  }
  if (admin && !hookHandlesLockout) await admin.rpc('hook_password_verification_attempt', { event: { user_id: data.user.id, valid: true } });
  await supabase.rpc('log_client_event', { p_event: 'login', p_document_id: null, p_details: await clientInfo() });
  (await cookies()).set(IDLE_COOKIE, String(Date.now()), { httpOnly: true, sameSite: 'lax', secure: true, path: '/' });
  redirect('/');
});

export async function signOut() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) await supabase.rpc('log_client_event', { p_event: 'logout', p_document_id: null, p_details: await clientInfo() });
  await supabase.auth.signOut();
  (await cookies()).delete(IDLE_COOKIE);
  redirect('/login');
}

export async function idleSignOut() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) await supabase.rpc('log_client_event', { p_event: 'logout', p_document_id: null, p_details: { ...(await clientInfo()), reason: 'idle for 15 minutes' } });
  await supabase.auth.signOut();
  (await cookies()).delete(IDLE_COOKIE);
  redirect('/login?reason=idle');
}
