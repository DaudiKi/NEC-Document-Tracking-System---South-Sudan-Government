'use client';
const ACCOUNTS = [
  ['administrator@nec-demo.gov.ss', 'System Administrator'],
  ['registry.officer@nec-demo.gov.ss', 'Registry Officer'],
  ['action.officer@nec-demo.gov.ss', 'Action Officer'],
  ['executive.viewer@nec-demo.gov.ss', 'Executive Viewer'],
  ['auditor@nec-demo.gov.ss', 'Auditor'],
];

export default function DemoAccounts() {
  const fill = (email: string) => {
    const el = document.getElementById('email') as HTMLInputElement | null;
    if (el) { el.value = email; el.dispatchEvent(new Event('input', { bubbles: true })); }
    document.getElementById('password')?.focus();
  };
  return (
    <details className="login__demo">
      <summary>Demo accounts (one per role)</summary>
      <table>
        <tbody>
          {ACCOUNTS.map(([email, role]) => (
            <tr key={email}><td>{role}</td><td><button type="button" onClick={() => fill(email)}>{email}</button></td></tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
