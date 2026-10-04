import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Role, Row } from '@/lib/constants';

export type Profile = {
  id: string; full_name: string; email: string; role: Role; office_id: number | null; job_title: string | null;
  is_active: boolean; locked_at: string | null; must_change_password: boolean; password_changed_at: string;
  remote_access_allowed: boolean;
};

const PASSWORD_MAX_AGE_DAYS = 90;

export const getAuth = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', data.user.id).maybeSingle();
  return { supabase, user: data.user, profile: (profile as Profile | null) };
});

export function passwordExpired(p: Profile) {
  return Date.now() - new Date(p.password_changed_at).getTime() > PASSWORD_MAX_AGE_DAYS * 86_400_000;
}

/** Signed-in user with a usable account. Redirects to login, the password change, or the "no access" page. */
export async function requireUser(roles?: Role[]) {
  const a = await getAuth();
  if (!a) redirect('/login');
  const p = a.profile;
  if (!p) redirect('/no-access');
  if (!p.is_active || p.locked_at) redirect('/no-access?reason=blocked');
  if (p.must_change_password || passwordExpired(p)) redirect('/change-password');
  if (roles && !roles.includes(p.role)) redirect('/?denied=1');
  return { supabase: a.supabase, user: a.user, profile: p };
}

export const isAdmin = (p: Profile) => p.role === 'system_administrator';

export function homeFor(role: Role) {
  return '/';
}

export type Lookups = {
  offices: Row[]; categories: Row[]; types: Row[]; priorities: Row[]; users: Row[]; organisations: Row[]; departments: Row[];
};

export const loadLookups = cache(async (): Promise<Lookups> => {
  const supabase = await createClient();
  const [o, c, t, p, u, org, d] = await Promise.all([
    supabase.from('offices').select('*').eq('is_active', true).order('code'),
    supabase.from('categories').select('*').eq('is_active', true).order('sort_order').order('name'),
    supabase.from('document_types').select('*').eq('is_active', true).order('sort_order').order('name'),
    supabase.from('priority_rules').select('*').order('sort_order'),
    supabase.from('profiles').select('id, full_name, role, office_id, job_title, is_active').eq('is_active', true).order('full_name'),
    supabase.from('organisations').select('id, name, organisation_type').eq('is_active', true).order('name'),
    supabase.from('departments').select('*').eq('is_active', true).order('name'),
  ]);
  return {
    offices: o.data ?? [], categories: c.data ?? [], types: t.data ?? [], priorities: p.data ?? [],
    users: u.data ?? [], organisations: org.data ?? [], departments: d.data ?? [],
  };
});
