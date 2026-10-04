import 'server-only';
import { createClient } from '@supabase/supabase-js';

/** Service-role client. Server only; bypasses Row Level Security. Used for user creation,
 *  scheduled jobs and file integrity checks. Returns null when the key is not configured. */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function requireAdminClient() {
  const c = createAdminClient();
  if (!c) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured on the server. Add it in the hosting environment settings.');
  return c;
}
