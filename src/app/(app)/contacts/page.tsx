import { requireUser } from '@/lib/auth';
import { PageHead } from '@/components/ui';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import { saveOrganisation, saveContact } from './actions';
import type { Row } from '@/lib/constants';

export const metadata = { title: 'Contacts' };
export const dynamic = 'force-dynamic';

export default async function Contacts() {
  const { supabase } = await requireUser(['registry_officer', 'system_administrator']);
  const [orgs, contacts] = await Promise.all([
    supabase.from('organisations').select('*').order('name'),
    supabase.from('contacts').select('*, org:organisations(name)').order('full_name').limit(300),
  ]);
  return (
    <>
      <PageHead eyebrow="Registry" title="Contacts">The organisations and people documents come from and go to. Picking from this list keeps spelling consistent in the registers and reports.</PageHead>
      <div className="nec-grid nec-grid--2">
        <section className="nec-panel">
          <h2 className="section-title">Add an organisation</h2>
          <ActionForm action={saveOrganisation} resetOnSuccess className="stack">
            <div className="field"><label htmlFor="oname">Name</label><input id="oname" name="name" type="text" required /></div>
            <div className="field"><label htmlFor="otype">Type<span className="req"> (optional)</span></label><input id="otype" name="type" type="text" placeholder="Government, Political party, Donor…" /></div>
            <div className="field"><label htmlFor="oaddr">Address<span className="req"> (optional)</span></label><input id="oaddr" name="address" type="text" /></div>
            <div className="fields" style={{ background: 'transparent', border: 0, gap: 'var(--space-40)' }}>
              <div className="field"><label htmlFor="ophone">Phone<span className="req"> (optional)</span></label><input id="ophone" name="phone" type="tel" /></div>
              <div className="field"><label htmlFor="oemail">Email<span className="req"> (optional)</span></label><input id="oemail" name="email" type="email" /></div>
            </div>
            <div><SubmitButton>Add Organisation</SubmitButton></div>
          </ActionForm>
        </section>
        <section className="nec-panel">
          <h2 className="section-title">Add a contact person</h2>
          <ActionForm action={saveContact} resetOnSuccess className="stack">
            <div className="field"><label htmlFor="corg">Organisation</label>
              <select id="corg" name="organisation_id" defaultValue=""><option value="">None</option>{(orgs.data ?? []).filter((o: Row) => o.is_active).map((o: Row) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
            <div className="field"><label htmlFor="cname">Full name</label><input id="cname" name="full_name" type="text" required /></div>
            <div className="field"><label htmlFor="ctitle">Title<span className="req"> (optional)</span></label><input id="ctitle" name="title" type="text" /></div>
            <div className="fields" style={{ background: 'transparent', border: 0, gap: 'var(--space-40)' }}>
              <div className="field"><label htmlFor="cphone">Phone<span className="req"> (optional)</span></label><input id="cphone" name="phone" type="tel" /></div>
              <div className="field"><label htmlFor="cemail">Email<span className="req"> (optional)</span></label><input id="cemail" name="email" type="email" /></div>
            </div>
            <div><SubmitButton>Add Contact</SubmitButton></div>
          </ActionForm>
        </section>
      </div>
      <section>
        <div className="block"><h2 className="section-title">Organisations ({(orgs.data ?? []).length})</h2></div>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Name</th><th>Type</th><th>Phone</th><th>Email</th></tr></thead>
          <tbody>{(orgs.data ?? []).map((o: Row) => <tr key={o.id}><td>{o.name}</td><td>{o.organisation_type}</td><td>{o.phone}</td><td>{o.email}</td></tr>)}</tbody>
        </table></div>
      </section>
      <section>
        <div className="block"><h2 className="section-title">People ({(contacts.data ?? []).length})</h2></div>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Name</th><th>Title</th><th>Organisation</th><th>Phone</th><th>Email</th></tr></thead>
          <tbody>{(contacts.data ?? []).map((c: Row) => <tr key={c.id}><td>{c.full_name}</td><td>{c.title}</td><td>{c.org?.name}</td><td>{c.phone}</td><td>{c.email}</td></tr>)}</tbody>
        </table></div>
      </section>
    </>
  );
}
