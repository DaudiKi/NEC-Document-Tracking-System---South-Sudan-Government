'use server';
import { revalidatePath } from 'next/cache';
import { randomInt } from 'crypto';
import { guard, rpc, str, opt, need, bool, num, UserError, friendly } from '@/lib/actions';
import { requireUser } from '@/lib/auth';
import { requireAdminClient, createAdminClient } from '@/lib/supabase/admin';
import { runIntegrityCheck } from '@/lib/jobs';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function tempPassword() {
  const part = () => Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `${part()}-${part()}-${randomInt(10, 99)}`;
}
const admin = () => requireUser(['system_administrator']);

export const createUser = guard(async (fd) => {
  const { supabase } = await admin();
  const sb = requireAdminClient();
  const email = need(opt(fd, 'email'), 'Email address').toLowerCase();
  const password = tempPassword();
  const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new UserError(error?.message.includes('already') ? 'A login with that email already exists.' : error?.message ?? 'The login could not be created.');
  const { error: e2 } = await supabase.rpc('admin_create_profile', {
    p_user: data.user.id, p_full_name: need(opt(fd, 'full_name'), 'Full name'), p_role: need(opt(fd, 'role'), 'Role'),
    p_office: num(fd, 'office_id'), p_department: null, p_job_title: opt(fd, 'job_title'), p_phone: opt(fd, 'phone'),
  });
  if (e2) { await sb.auth.admin.deleteUser(data.user.id); throw new UserError(friendly(e2)); }
  revalidatePath('/admin/users');
  return { ok: `Account created for ${email}.`, secret: password };
});

export const updateUser = guard(async (fd) => {
  await admin();
  await rpc('admin_update_user', {
    p_user: need(opt(fd, 'id'), 'User'), p_full_name: need(opt(fd, 'full_name'), 'Full name'), p_role: need(opt(fd, 'role'), 'Role'),
    p_office: num(fd, 'office_id'), p_department: null, p_job_title: opt(fd, 'job_title'), p_phone: opt(fd, 'phone'), p_remote_access: bool(fd, 'remote_access'),
  });
  revalidatePath('/admin/users');
  return 'Saved.';
});

export const resetPassword = guard(async (fd) => {
  await admin();
  const sb = requireAdminClient();
  const id = need(opt(fd, 'id'), 'User');
  const password = tempPassword();
  const { error } = await sb.auth.admin.updateUserById(id, { password });
  if (error) throw new UserError(error.message);
  await rpc('admin_mark_password_reset', { p_user: id });
  revalidatePath('/admin/users');
  return { ok: 'Password reset. The account is unlocked.', secret: password };
});

export const suspendUser = guard(async (fd) => {
  await admin();
  const id = need(opt(fd, 'id'), 'User');
  await rpc('admin_suspend_user', { p_user: id, p_reason: need(opt(fd, 'reason'), 'Reason') });
  await createAdminClient()?.auth.admin.updateUserById(id, { ban_duration: '876000h' });
  revalidatePath('/admin/users');
  return 'Suspended immediately. Their history stays intact.';
});

export const reactivateUser = guard(async (fd) => {
  await admin();
  const id = need(opt(fd, 'id'), 'User');
  await rpc('admin_reactivate_user', { p_user: id });
  await createAdminClient()?.auth.admin.updateUserById(id, { ban_duration: 'none' });
  revalidatePath('/admin/users');
  return 'Reactivated.';
});

export const unlockUser = guard(async (fd) => {
  await admin();
  await rpc('admin_unlock_user', { p_user: need(opt(fd, 'id'), 'User') });
  revalidatePath('/admin/users');
  return 'Unlocked.';
});

export const saveLookup = guard(async (fd) => {
  await admin();
  await rpc('admin_save_lookup', {
    p_table: need(opt(fd, 'table'), 'List'), p_id: num(fd, 'id'), p_name: need(opt(fd, 'name'), 'Name'),
    p_is_active: !bool(fd, 'inactive'), p_sort: num(fd, 'sort'), p_office: num(fd, 'office_id'),
  });
  revalidatePath('/admin/settings');
  return 'Saved.';
});

export const setPriorityHours = guard(async (fd) => {
  await admin();
  await rpc('admin_set_priority_hours', { p_priority: need(opt(fd, 'priority'), 'Priority'), p_hours: num(fd, 'hours') });
  revalidatePath('/admin/settings');
  return 'Saved. New documents use the new response time; existing due dates are unchanged.';
});

export const runAlertsNow = guard(async () => {
  await admin();
  const sb = requireAdminClient();
  const { data, error } = await sb.rpc('run_alerts');
  if (error) throw new UserError(error.message);
  revalidatePath('/admin/integrity');
  return `Alerts sent: ${data.due_soon} due soon, ${data.overdue} overdue, ${data.unacknowledged} unacknowledged, ${data.feedback_overdue} feedback overdue, ${data.daily_summaries} daily summaries.`;
});

export const runIntegrityNow = guard(async () => {
  await admin();
  const r = await runIntegrityCheck(requireAdminClient());
  revalidatePath('/admin/integrity');
  return `Checked ${r.checked} of ${r.total} stored file(s): ${r.match} match, ${r.mismatch} altered, ${r.missing} missing.`;
});

export const recordRestoreTest = guard(async (fd) => {
  const { supabase, profile } = await admin();
  const { error } = await supabase.from('backup_restore_tests').insert({
    performed_by: profile.id, backup_taken_at: need(opt(fd, 'taken'), 'Backup date'), restored_onto: need(opt(fd, 'onto'), 'Machine restored onto'),
    documents_checked: num(fd, 'docs') ?? 0, result: need(opt(fd, 'result'), 'Result'), notes: opt(fd, 'notes'),
  });
  if (error) throw new UserError(friendly(error));
  revalidatePath('/admin/integrity');
  return 'Restore test recorded.';
});
