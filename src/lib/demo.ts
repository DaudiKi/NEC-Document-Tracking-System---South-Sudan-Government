/** Demo accounts shown on the sign-in screen when NEXT_PUBLIC_DEMO_MODE=true.
 *  Only the email addresses live here. The shared demo password is read on the server from
 *  DEMO_PASSWORD and is never sent to the browser. */
export const DEMO_ACCOUNTS: [email: string, role: string][] = [
  ['administrator@nec-demo.gov.ss', 'System Administrator'],
  ['registry.officer@nec-demo.gov.ss', 'Registry Officer'],
  ['action.officer@nec-demo.gov.ss', 'Action Officer'],
  ['executive.viewer@nec-demo.gov.ss', 'Executive Viewer'],
  ['auditor@nec-demo.gov.ss', 'Auditor'],
];
export const isDemoEmail = (email: string) => DEMO_ACCOUNTS.some(([e]) => e === email.trim().toLowerCase());
