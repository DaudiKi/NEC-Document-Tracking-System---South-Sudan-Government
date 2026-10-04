'use server';
import { revalidatePath } from 'next/cache';
import { guard, rpc, opt, need, bool } from '@/lib/actions';
import { requireUser } from '@/lib/auth';

export const saveOrganisation = guard(async (fd) => {
  await requireUser(['registry_officer', 'system_administrator']);
  await rpc('save_organisation', {
    p_id: opt(fd, 'id'), p_name: need(opt(fd, 'name'), 'Name'), p_type: opt(fd, 'type'), p_address: opt(fd, 'address'),
    p_phone: opt(fd, 'phone'), p_email: opt(fd, 'email'), p_is_active: !bool(fd, 'inactive'),
  });
  revalidatePath('/contacts');
  return 'Saved.';
});

export const saveContact = guard(async (fd) => {
  await requireUser(['registry_officer', 'system_administrator']);
  await rpc('save_contact', {
    p_id: opt(fd, 'id'), p_organisation: opt(fd, 'organisation_id'), p_full_name: need(opt(fd, 'full_name'), 'Name'),
    p_title: opt(fd, 'title'), p_phone: opt(fd, 'phone'), p_email: opt(fd, 'email'), p_is_active: !bool(fd, 'inactive'),
  });
  revalidatePath('/contacts');
  return 'Saved.';
});
