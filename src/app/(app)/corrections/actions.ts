'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { guard, rpc, need, opt } from '@/lib/actions';

export const decide = guard(async (fd) => {
  await requireUser(['system_administrator']);
  const approve = opt(fd, 'decision') === 'approve';
  await rpc('decide_correction', { p_id: need(opt(fd, 'id'), 'Request'), p_approve: approve, p_note: opt(fd, 'note') });
  revalidatePath('/corrections');
  return approve ? 'Approved and applied. Old and new values are kept.' : 'Rejected.';
});
