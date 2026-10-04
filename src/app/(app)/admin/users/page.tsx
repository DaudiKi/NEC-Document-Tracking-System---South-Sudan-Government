import { requireUser, loadLookups } from '@/lib/auth';
import { PageHead, Notice, Field } from '@/components/ui';
import ActionForm, { SubmitButton } from '@/components/ActionForm';
import { createUser, updateUser, resetPassword, suspendUser, reactivateUser, unlockUser } from '../actions';
import { ROLE_LABEL, type Role, type Row } from '@/lib/constants';
import { fmtDateTime } from '@/lib/format';

export const metadata = { title: 'Users and roles' };
export const dynamic = 'force-dynamic';

export default async function Users() {
  const { supabase, profile } = await requireUser(['system_administrator']);
  const lookups = await loadLookups();
  const { data } = await supabase.from('profiles').select('*, office:offices(code)').order('role').order('full_name');
  const users: Row[] = data ?? [];
  const admins = users.filter((u) => u.role === 'system_administrator' && u.is_active).length;
  const hasKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  return (
    <>
      <PageHead eyebrow="Administration" title="Users and roles">Every user has a personal account. Shared logins are not permitted. Passwords are at least 10 characters, changed every 90 days and at first sign-in; accounts lock after 5 failed attempts.</PageHead>
      <div className="notices">
        <Notice kind="info" label={`${admins} of 2 System Administrators.`}>No one else, including the technician after handover, may hold administrator rights. The database refuses a third.</Notice>
        {!hasKey && <Notice kind="warning" label="Server key missing.">Creating users and resetting passwords needs the SUPABASE_SERVICE_ROLE_KEY environment variable on the server.</Notice>}
      </div>
      <section>
        <div className="block"><h2 className="section-title">Create an account</h2></div>
        <ActionForm action={createUser} resetOnSuccess>
          <div className="fields fields--3">
            <div className="fieldset"><Field label="Full name" required htmlFor="nfn"><input id="nfn" name="full_name" type="text" required /></Field><Field label="Email address" required htmlFor="nem"><input id="nem" name="email" type="email" required /></Field></div>
            <div className="fieldset">
              <Field label="Role" required htmlFor="nrole"><select id="nrole" name="role" required defaultValue=""><option value="">Select…</option>{(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
              <Field label="Office" htmlFor="noff"><select id="noff" name="office_id" defaultValue=""><option value="">None</option>{lookups.offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
            </div>
            <div className="fieldset"><Field label="Job title" htmlFor="njt"><input id="njt" name="job_title" type="text" /></Field><Field label="Phone" htmlFor="nph"><input id="nph" name="phone" type="tel" /></Field></div>
          </div>
          <div className="form-actions"><SubmitButton>Create Account</SubmitButton><span className="caption">A temporary password is shown once. The user must change it at first sign-in.</span></div>
        </ActionForm>
      </section>
      <section>
        <div className="block"><h2 className="section-title">Accounts ({users.length})</h2></div>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Name</th><th>Role</th><th>Office</th><th>Status</th><th>Last sign-in</th><th>Manage</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.full_name}</strong><div className="caption">{u.email}{u.job_title ? ` · ${u.job_title}` : ''}</div></td>
                <td>{ROLE_LABEL[u.role as Role]}</td><td>{u.office?.code ?? '—'}</td>
                <td>
                  {u.is_active ? <span className="badge badge--success">Active</span> : <span className="badge badge--ink">Suspended</span>}
                  {u.locked_at && <> <span className="badge badge--danger">Locked</span></>}
                  {u.must_change_password && <> <span className="badge badge--warning">Must change password</span></>}
                  {!u.is_active && u.suspension_reason && <div className="caption">{u.suspension_reason}</div>}
                </td>
                <td className="nowrap">{fmtDateTime(u.last_login_at) || 'Never'}</td>
                <td style={{ minWidth: 320 }}>
                  <details>
                    <summary className="linklike" style={{ display: 'inline-block' }}>Manage</summary>
                    <div className="stack" style={{ marginTop: 12 }}>
                      <ActionForm action={updateUser} className="stack"><input type="hidden" name="id" value={u.id} />
                        <Field label="Full name" required htmlFor={`fn${u.id}`}><input id={`fn${u.id}`} name="full_name" type="text" defaultValue={u.full_name} required /></Field>
                        <Field label="Role" required htmlFor={`r${u.id}`}><select id={`r${u.id}`} name="role" defaultValue={u.role} disabled={u.id === profile.id}>{(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
                        {u.id === profile.id && <input type="hidden" name="role" value={u.role} />}
                        <Field label="Office" htmlFor={`o${u.id}`}><select id={`o${u.id}`} name="office_id" defaultValue={u.office_id ?? ''}><option value="">None</option>{lookups.offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
                        <Field label="Job title" htmlFor={`j${u.id}`}><input id={`j${u.id}`} name="job_title" type="text" defaultValue={u.job_title ?? ''} /></Field>
                        <Field label="Phone" htmlFor={`p${u.id}`}><input id={`p${u.id}`} name="phone" type="tel" defaultValue={u.phone ?? ''} /></Field>
                        <label className="check"><input type="checkbox" name="remote_access" defaultChecked={u.remote_access_allowed} /> May sign in remotely (when remote access is switched on)</label>
                        <div><SubmitButton className="nec-btn nec-btn--outline nec-btn--sm">Save Changes</SubmitButton></div>
                      </ActionForm>
                      <div className="row">
                        <ActionForm action={resetPassword} className="inline"><input type="hidden" name="id" value={u.id} /><SubmitButton className="nec-btn nec-btn--outline nec-btn--sm">Reset Password</SubmitButton></ActionForm>
                        {u.locked_at && <ActionForm action={unlockUser} className="inline"><input type="hidden" name="id" value={u.id} /><SubmitButton className="nec-btn nec-btn--outline nec-btn--sm">Unlock</SubmitButton></ActionForm>}
                        {!u.is_active && <ActionForm action={reactivateUser} className="inline"><input type="hidden" name="id" value={u.id} /><SubmitButton className="nec-btn nec-btn--outline nec-btn--sm">Reactivate</SubmitButton></ActionForm>}
                      </div>
                      {u.is_active && u.id !== profile.id && (
                        <ActionForm action={suspendUser} className="stack"><input type="hidden" name="id" value={u.id} />
                          <Field label="Suspend immediately (reason)" required htmlFor={`s${u.id}`}><input id={`s${u.id}`} name="reason" type="text" placeholder="For example: left the commission" required /></Field>
                          <div><SubmitButton className="nec-btn nec-btn--danger nec-btn--sm">Suspend</SubmitButton></div>
                        </ActionForm>
                      )}
                    </div>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </section>
    </>
  );
}
