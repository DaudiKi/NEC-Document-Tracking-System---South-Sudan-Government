import { createClient } from '@/lib/supabase/server';
import { UserError } from '@/lib/actions';

/** Resolves "NEC/CH/IN/2026/00012, NEC/SG/OUT/2026/00003" to document ids the user may see. */
export async function resolveRefs(raw: string): Promise<string[]> {
  const refs = raw.split(/[,;\n]/).map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!refs.length) return [];
  const supabase = await createClient();
  const { data } = await supabase.from('documents').select('id, reference_number').in('reference_number', refs);
  const found = new Set((data ?? []).map((d) => d.reference_number));
  const missing = refs.filter((r) => !found.has(r));
  if (missing.length) throw new UserError(`Reference not found: ${missing.join(', ')}.`);
  return (data ?? []).map((d) => d.id);
}

