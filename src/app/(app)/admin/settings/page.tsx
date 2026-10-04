import { requireUser } from '@/lib/auth';
import { PageHead } from '@/components/ui';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import { saveLookup, setPriorityHours } from '../actions';
import type { Row } from '@/lib/constants';

export const metadata = { title: 'Lists and response times' };
export const dynamic = 'force-dynamic';

function LookupSection({ title, table, rows, offices }: { title: string; table: string; rows: Row[]; offices?: Row[] }) {
  return (
    <section className="nec-panel" style={{ padding: 0 }}>
      <div className="block"><h2 className="section-title">{title}</h2><p className="caption">Entries are deactivated, never deleted, so old records keep their category.</p></div>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Name</th>{offices && <th>Office</th>}<th>Active</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td colSpan={offices ? 4 : 3} style={{ padding: 0 }}>
                <ActionForm action={saveLookup} className="row" >
                  <input type="hidden" name="table" value={table} /><input type="hidden" name="id" value={r.id} />
                  <input name="name" type="text" defaultValue={r.name} required aria-label={`Name of ${r.name}`} style={{ flex: 1, minWidth: 160, margin: 8 }} />
                  {offices && <select name="office_id" defaultValue={r.office_id ?? ''} aria-label="Office" style={{ width: 160 }}><option value="">All offices</option>{offices.map((o) => <option key={o.id} value={o.id}>{o.code}</option>)}</select>}
                  <label className="check"><input type="checkbox" name="inactive" defaultChecked={!r.is_active} /> Inactive</label>
                  <SubmitButton className="nec-btn nec-btn--outline nec-btn--sm">Save</SubmitButton>
                </ActionForm>
              </td>
            </tr>
          ))}
          <tr>
            <td colSpan={offices ? 4 : 3} style={{ padding: 0, background: 'var(--surface-alt)' }}>
              <ActionForm action={saveLookup} resetOnSuccess className="row">
                <input type="hidden" name="table" value={table} />
                <input name="name" type="text" required placeholder={`New ${title.toLowerCase().replace(/s$/, '')}`} aria-label="New name" style={{ flex: 1, minWidth: 160, margin: 8 }} />
                {offices && <select name="office_id" defaultValue="" aria-label="Office" style={{ width: 160 }}><option value="">All offices</option>{offices.map((o) => <option key={o.id} value={o.id}>{o.code}</option>)}</select>}
                <SubmitButton className="nec-btn nec-btn--primary nec-btn--sm">Add</SubmitButton>
              </ActionForm>
            </td>
          </tr>
        </tbody>
      </table></div>
    </section>
  );
}

export default async function Settings() {
  const { supabase } = await requireUser(['system_administrator']);
  const [cats, types, deps, prio, offices, settings] = await Promise.all([
    supabase.from('categories').select('*').order('sort_order').order('name'),
    supabase.from('document_types').select('*').order('sort_order').order('name'),
    supabase.from('departments').select('*').order('name'),
    supabase.from('priority_rules').select('*').order('sort_order'),
    supabase.from('offices').select('*').order('code'),
    supabase.from('system_settings').select('*').order('key'),
  ]);
  return (
    <>
      <PageHead eyebrow="Administration" title="Lists and response times">NEC confirms the final lists and the response times before go-live. Changes are recorded in the audit trail.</PageHead>
      <section className="block">
        <h2 className="section-title">Response time by priority</h2>
        <p className="caption" style={{ marginBottom: 12 }}>The due date of an incoming document is set from its priority. Proposed: Urgent 24 hours, High 3 days, Normal 7 days, Low 14 days.</p>
        <div className="nec-grid nec-grid--4">
          {(prio.data ?? []).map((p: Row) => (
            <div className="nec-panel" key={p.priority}>
              <ActionForm action={setPriorityHours} className="stack">
                <input type="hidden" name="priority" value={p.priority} />
                <div className="field"><label htmlFor={`h${p.priority}`}>{p.label.replace(/ \(.*\)/, '')} (hours)</label><input id={`h${p.priority}`} name="hours" type="number" min={1} defaultValue={p.response_hours} required /><span className="hint">{Math.round(p.response_hours / 24 * 10) / 10} days</span></div>
                <div><SubmitButton className="nec-btn nec-btn--outline nec-btn--sm">Save</SubmitButton></div>
              </ActionForm>
            </div>
          ))}
        </div>
      </section>
      <div className="nec-grid nec-grid--2">
        <LookupSection title="Categories" table="categories" rows={cats.data ?? []} />
        <LookupSection title="Document types" table="document_types" rows={types.data ?? []} />
        <LookupSection title="Departments" table="departments" rows={deps.data ?? []} offices={offices.data ?? []} />
        <section className="nec-panel" style={{ padding: 0 }}>
          <div className="block"><h2 className="section-title">Offices</h2><p className="caption">The office code appears in reference numbers, for example NEC/<strong>CH</strong>/IN/2026/00123.</p></div>
          <table className="tbl"><thead><tr><th>Code</th><th>Name</th></tr></thead><tbody>{(offices.data ?? []).map((o: Row) => <tr key={o.id}><td className="ref">{o.code}</td><td>{o.name}</td></tr>)}</tbody></table>
        </section>
      </div>
      <section>
        <div className="block"><h2 className="section-title">System settings (read-only)</h2><p className="caption">Changed by the technician in the database during setup.</p></div>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Setting</th><th>Value</th><th>Meaning</th></tr></thead>
          <tbody>{(settings.data ?? []).map((s: Row) => <tr key={s.key}><td className="mono">{s.key}</td><td className="mono">{JSON.stringify(s.value)}</td><td>{s.description}</td></tr>)}</tbody></table></div>
      </section>
    </>
  );
}
