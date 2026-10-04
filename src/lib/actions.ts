import { unstable_rethrow } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type FormState = { error?: string; ok?: string; secret?: string } | undefined;

export class UserError extends Error {}

/** Turns a database error into a message a registry clerk can act on. */
export function friendly(err: { message?: string; code?: string; details?: string; hint?: string }) {
  const m = err.message || 'Something went wrong.';
  if (err.code === 'P0001') return m;
  if (err.code === '42501') return m.includes('row-level') ? 'You are not allowed to do that.' : 'You are not allowed to do that.';
  if (err.code === '23505') return 'That already exists.';
  if (err.code === '23514') return 'A value was not accepted: ' + (m.match(/constraint "([^"]+)"/)?.[1]?.replace(/_/g, ' ') ?? m);
  if (err.code === '23503') return 'A linked record was not found.';
  if (err.code === '22P02') return 'One of the values has the wrong format.';
  return m;
}

export async function rpc<T = any>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new UserError(friendly(error));
  return data as T;
}

type Handler = (fd: FormData) => Promise<string | void | { ok?: string; secret?: string }>;

/** Wraps a server action so errors come back as form state instead of crashing the page. */
export function guard(handler: Handler) {
  return async (_prev: FormState, fd: FormData): Promise<FormState> => {
    try {
      const r = await handler(fd);
      if (typeof r === 'string') return { ok: r };
      if (r && typeof r === 'object') return r;
      return { ok: 'Saved.' };
    } catch (e) {
      unstable_rethrow(e);
      if (e instanceof UserError) return { error: e.message };
      console.error(e);
      return { error: e instanceof Error ? e.message : 'Something went wrong.' };
    }
  };
}

export const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};
export const opt = (fd: FormData, k: string) => str(fd, k) || null;
export const bool = (fd: FormData, k: string) => fd.get(k) === 'on' || fd.get(k) === 'true' || fd.get(k) === 'yes';
export const num = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return v === '' ? null : Number(v);
};
export function need(v: string | null | undefined, label: string) {
  if (!v) throw new UserError(`${label} is required.`);
  return v;
}
