'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { guard, UserError } from '@/lib/actions';

export const changePassword = guard(async (fd) => {
  const pw = String(fd.get('password') ?? '');
  const confirm = String(fd.get('confirm') ?? '');
  if (pw.length < 10) throw new UserError('The password must be at least 10 characters.');
  if (pw !== confirm) throw new UserError('The two passwords are not the same.');
  if (/^(.)\1+$/.test(pw) || /password/i.test(pw)) throw new UserError('Choose a password that is harder to guess.');
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login');
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) throw new UserError(error.message.includes('different') ? 'Choose a password different from the current one.' : error.message);
  const { error: e2 } = await supabase.rpc('complete_password_change');
  if (e2) throw new UserError(e2.message);
  await supabase.auth.signOut();
  redirect('/login?reason=changed');
});
