import type { SupabaseClient } from '@supabase/supabase-js';
import type { Row } from '@/lib/constants';

export type SearchParams = Record<string, string | string[] | undefined>;
export const PAGE_SIZE = 25;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export async function runSearch(supabase: SupabaseClient, sp: SearchParams, fixedDirection?: 'incoming' | 'outgoing') {
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const status = one(sp.status);
  const args = {
    p_q: one(sp.q) ?? null,
    p_direction: fixedDirection ?? one(sp.direction) ?? null,
    p_statuses: status ? [status] : null,
    p_priority: one(sp.priority) ?? null,
    p_classification: one(sp.classification) ?? null,
    p_office: one(sp.office) ? Number(one(sp.office)) : null,
    p_category: one(sp.category) ? Number(one(sp.category)) : null,
    p_from: one(sp.from) ?? null,
    p_to: one(sp.to) ?? null,
    p_holder: one(sp.holder) ?? null,
    p_overdue: one(sp.overdue) === 'on',
    p_voided: one(sp.voided) === 'on',
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  };
  const { data, error } = await supabase.rpc('search_documents', args);
  const rows = (data ?? []) as Row[];
  return { rows, total: Number(rows[0]?.total_count ?? 0), page, error: error?.message, args };
}

export function queryString(sp: SearchParams, extra: Record<string, string | number> = {}) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const val = one(v);
    if (val && k !== 'page') u.set(k, val);
  }
  for (const [k, v] of Object.entries(extra)) u.set(k, String(v));
  return u.toString();
}
