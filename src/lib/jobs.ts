import 'server-only';
import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Re-hashes stored files and compares them with the fingerprint taken at upload. A mismatch or a
 *  missing file alerts the Administrators. Checks a rotating batch so a large archive is covered over time. */
export async function runIntegrityCheck(admin: SupabaseClient, batch = Number(process.env.INTEGRITY_BATCH || 100)) {
  const { count } = await admin.from('document_file_versions').select('id', { count: 'exact', head: true });
  const total = count ?? 0;
  const day = Math.floor(Date.now() / 86_400_000);
  const start = total > batch ? (day * batch) % total : 0;
  const { data: versions } = await admin.from('document_file_versions')
    .select('id, storage_bucket, storage_path, sha256').order('uploaded_at').range(start, start + batch - 1);
  let match = 0, mismatch = 0, missing = 0;
  for (const v of versions ?? []) {
    const { data: blob, error } = await admin.storage.from(v.storage_bucket).download(v.storage_path);
    if (error || !blob) {
      missing++;
      await admin.rpc('record_integrity_check', { p_version: v.id, p_sha256: null, p_result: 'missing' });
      continue;
    }
    const sha = createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex');
    if (sha === v.sha256) { match++; await admin.rpc('record_integrity_check', { p_version: v.id, p_sha256: sha, p_result: 'match' }); }
    else { mismatch++; await admin.rpc('record_integrity_check', { p_version: v.id, p_sha256: sha, p_result: 'mismatch' }); }
  }
  return { total, checked: (versions ?? []).length, match, mismatch, missing };
}
