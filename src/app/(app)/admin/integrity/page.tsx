import { requireUser } from '@/lib/auth';
import { PageHead, Notice, Field } from '@/components/ui';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import { runAlertsNow, runIntegrityNow, recordRestoreTest } from '../actions';
import { fmtDateTime } from '@/lib/format';
import type { Row } from '@/lib/constants';

export const metadata = { title: 'Integrity, alerts and backups' };
export const dynamic = 'force-dynamic';

export default async function Integrity() {
  const { supabase } = await requireUser(['system_administrator']);
  const [checks, problems, tests, files] = await Promise.all([
    supabase.from('file_integrity_checks').select('id', { count: 'exact', head: true }),
    supabase.from('file_integrity_checks').select('*, v:document_file_versions(storage_path, document_id)').neq('result', 'match').order('checked_at', { ascending: false }).limit(20),
    supabase.from('backup_restore_tests').select('*, who:profiles!backup_restore_tests_performed_by_fkey(full_name)').order('tested_at', { ascending: false }).limit(20),
    supabase.from('document_file_versions').select('id', { count: 'exact', head: true }),
  ]);
  const last = tests.data?.[0];
  const hasKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  return (
    <>
      <PageHead eyebrow="Administration" title="Integrity, alerts and backups">Stored files carry a fingerprint taken at upload. The system re-checks them and alerts the Administrators if any file was changed outside the system.</PageHead>
      {!hasKey && <div className="notices"><Notice kind="warning" label="Server key missing.">These jobs need the SUPABASE_SERVICE_ROLE_KEY environment variable on the server.</Notice></div>}
      <div className="nec-grid nec-grid--3">
        <section className="nec-panel"><div className="stat"><span className="stat__value">{files.count ?? 0}</span><span className="stat__label">Stored file versions</span></div>
          <ActionForm action={runIntegrityNow} className="stack"><SubmitButton className="nec-btn nec-btn--outline nec-btn--sm" pendingLabel="Checking…">Check Files Now</SubmitButton></ActionForm></section>
        <section className="nec-panel"><div className="stat"><span className="stat__value">{checks.count ?? 0}</span><span className="stat__label">Integrity checks recorded</span></div>
          <p className="caption">A scheduled job checks a batch every day.</p></section>
        <section className="nec-panel"><div className="stat"><span className="stat__value" style={{ fontSize: 24 }}>{last ? fmtDateTime(last.tested_at) : 'Never'}</span><span className="stat__label">Last restore test (every 3 months)</span></div>
          <ActionForm action={runAlertsNow} className="stack"><SubmitButton className="nec-btn nec-btn--outline nec-btn--sm">Send Alerts Now</SubmitButton></ActionForm></section>
      </div>
      <section>
        <div className="block"><h2 className="section-title">Problems found</h2></div>
        {(problems.data ?? []).length === 0 ? <div className="empty">No altered or missing files have been found.</div> : (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>When</th><th>Result</th><th>File</th></tr></thead>
            <tbody>{(problems.data as Row[]).map((c) => <tr key={c.id}><td className="nowrap">{fmtDateTime(c.checked_at)}</td><td><span className="badge badge--danger">{c.result === 'mismatch' ? 'Altered' : 'Missing'}</span></td><td className="mono">{c.v?.storage_path}</td></tr>)}</tbody></table></div>
        )}
      </section>
      <section>
        <div className="block"><h2 className="section-title">Backup restore tests</h2><p className="caption">Restore a backup onto a separate machine every 3 months, open some documents, and record it here.</p></div>
        <ActionForm action={recordRestoreTest} resetOnSuccess>
          <div className="fields fields--3">
            <div className="fieldset"><Field label="Backup taken on" required htmlFor="rt"><input id="rt" name="taken" type="datetime-local" required /></Field><Field label="Restored onto (machine)" required htmlFor="ro"><input id="ro" name="onto" type="text" required /></Field></div>
            <div className="fieldset"><Field label="Documents opened and checked" htmlFor="rd"><input id="rd" name="docs" type="number" min={0} defaultValue={0} /></Field>
              <Field label="Result" required htmlFor="rr"><select id="rr" name="result" required defaultValue=""><option value="">Select…</option><option value="pass">Pass</option><option value="fail">Fail</option></select></Field></div>
            <div className="fieldset"><Field label="Notes" htmlFor="rn"><textarea id="rn" name="notes" /></Field></div>
          </div>
          <div className="form-actions"><SubmitButton>Record Restore Test</SubmitButton></div>
        </ActionForm>
        {(tests.data ?? []).length > 0 && (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Tested</th><th>By</th><th>Backup from</th><th>Restored onto</th><th className="num">Documents</th><th>Result</th></tr></thead>
            <tbody>{(tests.data as Row[]).map((t) => <tr key={t.id}><td className="nowrap">{fmtDateTime(t.tested_at)}</td><td>{t.who?.full_name}</td><td className="nowrap">{fmtDateTime(t.backup_taken_at)}</td><td>{t.restored_onto}</td><td className="num">{t.documents_checked}</td><td><span className={`badge ${t.result === 'pass' ? 'badge--success' : 'badge--danger'}`}>{t.result === 'pass' ? 'Pass' : 'Fail'}</span></td></tr>)}</tbody></table></div>
        )}
      </section>
    </>
  );
}
