# Running and deploying the application

The web application is a Next.js app (App Router, TypeScript) in `src/`. It talks only to Supabase: Auth for sign-in, Postgres for the registers, Storage for scans. The visual design is the **NEC South Sudan design system** (tokens, panel grid, logo), in `src/app/tokens.css`, `src/app/design-system.css` and `src/app/app.css`.

## 1. Environment variables

| Variable | Needed | What for |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public anon key (safe in the browser; Row Level Security protects the data) |
| `SUPABASE_SERVICE_ROLE_KEY` | for administration | **Server only, never expose.** Creating users and resetting passwords (Auth Admin API), the daily jobs, file integrity checks, failed-login counting. Without it, sign-in, registration, routing, search and reports all still work. |
| `CRON_SECRET` | for the daily jobs | Any long random string. Vercel Cron sends it as `Authorization: Bearer …` |
| `AUTH_HOOK_ENABLED` | optional | `true` only when the Supabase Auth hook "Password Verification Attempt" is pointed at `public.hook_password_verification_attempt`. Then the app does not count failed logins itself. |
| `NEXT_PUBLIC_DEMO_MODE` | demo only | `true` shows the demo account list on the sign-in screen. Anyone who can open the site can then sign in as any demo role, so switch it off for real use. |
| `DEMO_PASSWORD` | demo only | The shared password of the demo accounts. **Server only.** On the sign-in screen the password slot is filled automatically and locked; the server adds the real password when the form is submitted, so it never reaches the browser. |
| `MAX_UPLOAD_MB` | optional | Upload limit on a self-hosted server (default 25). On Vercel the limit is 4 MB, the platform's request size limit. |

## 2. Deploy to Vercel

1. Vercel → **Add New → Project** → import this GitHub repository. Framework: Next.js (detected). Production branch: `main`.
2. Add the environment variables above (Settings → Environment Variables), then redeploy.
3. `vercel.json` already schedules two daily jobs: `/api/cron/alerts` (04:00 UTC) and `/api/cron/integrity` (04:30 UTC). They need `CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY`.

## 3. Supabase settings (Dashboard)

- **Authentication → Sign In / Providers:** turn **off** "Allow new users to sign up". Minimum password length **10**.
- **Authentication → Multi-Factor:** enable TOTP (for remote access, Mode B).
- **Auth hook (plan permitting):** Password Verification Attempt → `public.hook_password_verification_attempt`, then set `AUTH_HOOK_ENABLED=true`.
- Users are created by the System Administrators in the app (**Administration → Users**). A login with no profile can see nothing.

## 4. Running locally

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev                  # http://localhost:3000
npm run build && npm start   # production build
```

## 5. What the application does, by role

| Role | Home | Can do |
|---|---|---|
| Registry Officer | Registry desk | Register incoming (with scan) and outgoing documents; route; change due dates (with a reason); add files and new scan versions; finalise, dispatch and confirm delivery; link feedback; request corrections; void; print the acknowledgement slip, receipt label and delivery book; maintain contacts |
| Action Officer | My work | Acknowledge receipt; record actions and comments; forward, return, put on hold, close with a note |
| Executive Viewer | Dashboard | See everything including Confidential; give instructions (minutes); close items |
| System Administrator | Dashboard | Users and roles; approve or reject corrections (not their own); lists and response times; integrity checks, alerts, restore tests; audit trail |
| Auditor | Overview | Read-only: records (not Confidential), reports, audit trail |

## 6. Known limits of this phase

- **Scanner integration.** The browser cannot drive an office scanner. Scan to PDF and attach it; direct scanner-to-record needs scanner software on the registry PC (office deployment).
- **OCR.** The system indexes the text layer of searchable PDFs. It does not OCR image-only scans; the document page warns when a scan has no text layer.
- **Upload size on Vercel** is 4 MB per file (platform limit). A self-hosted server has no such limit.
- **Two-factor login and email/SMS alerts** (Mode B) are not built yet. The database already enforces 2FA for remote access when that setting is switched on; the app has no 2FA enrolment screen yet, so keep `remote_access_enabled = false` for the demo.
- **Offline office deployment** (Mode A) and the backup scripts come after the demo.
