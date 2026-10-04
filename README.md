# NEC Document Tracking System — South Sudan

A secure, auditable system for registering, scanning, storing and tracking every incoming and outgoing document handled by the **Office of the Chairperson** and the **Office of the Secretary General** of the National Elections Commission (NEC), South Sudan.

> **Project status:** Phase 1 online demo. The database (Supabase), the workflow functions and the web application (Next.js, on the NEC design system) are built. The offline office deployment is designed after the demo.
>
> | Item | Location |
> |---|---|
> | Database schema documentation (import guide, roles, tables, rules, full SQL) | [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) |
> | Schema migration | [`supabase/migrations/20261004000000_initial_schema.sql`](supabase/migrations/20261004000000_initial_schema.sql) |
> | Function privileges fix | [`supabase/migrations/20261004000100_restrict_function_execute.sql`](supabase/migrations/20261004000100_restrict_function_execute.sql) |
> | Workflow functions, report views, search, dashboard | [`supabase/migrations/20261004000200_workflow_functions.sql`](supabase/migrations/20261004000200_workflow_functions.sql) |
> | Database tests (89 checks, run on a local PostgreSQL 16) | [`supabase/tests/`](supabase/tests/README.md) |
> | Running and deploying the application | [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) |

---

## Table of contents

1. [Purpose and scope](#1-purpose-and-scope)
2. [Platform and technology approach](#2-platform-and-technology-approach)
3. [Users, roles and access control](#3-users-roles-and-access-control)
4. [Incoming document register](#4-incoming-document-register)
5. [Outgoing document register](#5-outgoing-document-register)
6. [Workflow, tracking and alerts](#6-workflow-tracking-and-alerts)
7. [Document integrity, versioning and audit trail](#7-document-integrity-versioning-and-audit-trail)
8. [Search, reporting and dashboard](#8-search-reporting-and-dashboard)
9. [Deployment: offline first, online optional](#9-deployment-offline-first-online-optional)
10. [Security, backup and continuity](#10-security-backup-and-continuity)
11. [Non-functional requirements](#11-non-functional-requirements)
12. [Deliverables](#12-deliverables)
13. [Acceptance tests](#13-acceptance-tests)
14. [Decisions NEC must confirm before the build](#14-decisions-nec-must-confirm-before-the-build)
15. [Ownership](#15-ownership)

---

## 1. Purpose and scope

The system must register, scan, store and track every document that passes through the two offices. Records must not be alterable without leaving a permanent trace.

**In scope**

- Incoming correspondence
- Outgoing correspondence
- Internal memos between the two offices
- Scanned images of every document
- Routing and follow-up
- Reporting

**Out of scope for phase 1.** The design must allow these to be added later:

- Electronic signatures
- Integration with other NEC departments
- A public-facing portal

---

## 2. Platform and technology approach

### Why not Excel

The system **must not** be built in Excel. Excel:

- cannot enforce a personal password for each user,
- cannot stop a user deleting or overwriting a row,
- cannot keep a reliable change history,
- breaks when several people use it at the same time,
- cannot safely hold thousands of scanned files.

A tracking system for an elections body has to stand up to an audit.

### Accepted approaches

| Option | Description |
|---|---|
| **Build** | A database-backed web application on a central database (for example PostgreSQL or MySQL), installed on an office server and opened in a web browser on office computers. |
| **Configure** | An established open-source records system (for example Mayan EDMS or OpenKM), configured so that it meets **every** requirement in this document. |

Whichever option is chosen, every register and report must export to **Excel and PDF**, so staff can still work with the data in Excel.

The technician must state in the quotation which approach is proposed and why.

---

## 3. Users, roles and access control

### System Administrators

Only **two** people may create user accounts and issue passwords:

- the **Executive Director** (Office of the Chairperson)
- the **Secretary** (Office of the Secretary General)

No one else may hold administrator rights. This includes the technician after handover.

### Roles

| Role | Who | Can do | Cannot do |
|---|---|---|---|
| **System Administrator** | Executive Director; Secretary | Create, suspend and reset user accounts; assign roles; view the full audit trail; approve corrections; configure categories and departments | Delete documents or audit records |
| **Registry Officer** | Front-desk / registry staff | Register incoming and outgoing documents; scan and attach files; route documents | Edit a saved record without an approved correction; see Confidential documents not routed to them |
| **Action Officer** | Staff assigned documents | View documents routed to them; record actions, comments and feedback; mark tasks complete | Register documents; change routing set by the registry |
| **Executive Viewer** | Chairperson; Secretary General; Deputy | View all documents and dashboards; give instructions (minutes) on documents | Edit registers |
| **Auditor** (read-only) | Internal audit, when authorised | View records and the full audit trail; export reports | Make any change |

### Account rules

- Every user has a **personal account**. Shared or generic logins (for example `registry1`) are not allowed.
- **Passwords:** at least 10 characters, changed every 90 days, changed at first login, and the account locks after 5 failed attempts.
- Administrators can **suspend an account immediately** (for example when a staff member leaves). A suspended user's history stays intact.
- Sessions **log out automatically after 15 minutes** of inactivity.
- Every administrator action (new user, role change, password reset) is recorded in the audit trail, so each administrator can see what the other has done.

### Document classification

Each document carries one of three classifications:

- **Open**
- **Restricted**
- **Confidential**: visible only to Executive Viewers, Administrators and named recipients.

The specification defines visibility rules only for Confidential documents.

---

## 4. Incoming document register

Every document received is **registered and scanned on the day it arrives**. It gets a unique reference number before it leaves the registry.

### Reference numbers

- Generated automatically and **never reused**.
- Format: `NEC/<OFFICE>/IN/<YEAR>/<SEQUENCE>`, for example **`NEC/CH/IN/2026/00123`**.
- `CH` = Office of the Chairperson, `SG` = Office of the Secretary General.
- The sequence **restarts each calendar year**.

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| Reference number | Auto | Yes | Cannot be edited |
| Date and time received | Auto | Yes | Server time, not the PC clock |
| Receiving office | List | Yes | Chairperson / Secretary General |
| Registered by | Auto | Yes | Logged-in user |
| Sender organisation | List + free text | Yes | Taken from a contacts list to avoid spelling variations |
| Sender name and title | Text | Yes | |
| Delivered by | Text | Yes | Name, phone number, ID seen (yes/no) |
| Delivery method | List | Yes | Hand delivery, courier, post, email, fax |
| Sender's own reference and date | Text / date | No | As printed on the letter |
| Subject | Text | Yes | |
| Purpose / document type | List | Yes | Letter, request, invitation, report, complaint, legal notice, invoice, memo, other |
| Category | List | Yes | For example Operations, Finance, Legal, Partners/Donors, Political parties, Government, HR |
| Priority | List | Yes | Urgent (24 hrs), High (3 days), Normal (7 days), Low (14 days) |
| Classification | List | Yes | Open / Restricted / Confidential |
| Response required | Yes/No | Yes | If yes, a response due date |
| Routed to | User / department | Yes | One primary owner; optional copies |
| Instructions / minute | Text | No | For example the Chairperson's minute on the file |
| Number of pages and attachments | Number | Yes | Checked against the scan |
| Physical file location | Text | Yes | Cabinet, shelf, file number |
| Linked documents | Link | No | Earlier letters in the same matter |
| Status | Auto / List | Yes | See [Workflow](#6-workflow-tracking-and-alerts) |
| Scanned file | File | Yes | **The record cannot be saved without it** |

### Scanning requirements

- Scan **directly from the office scanner into the record**. Files are not saved to the desktop first and then uploaded.
- Format: **searchable PDF** (PDF/A with OCR text recognition) at **300 dpi**. Use colour where the original has stamps or signatures.
- A multi-page document is saved as **one file**. Attachments may be added as separate files.
- The system **stamps the reference number and receipt date** on the scan and prints a label or receipt stamp for the paper original.
- The system prints, or sends by SMS or email, an **acknowledgement slip** showing the reference number to the person who delivered the document.

---

## 5. Outgoing document register

Every outgoing document is **registered before dispatch**, **scanned in its final signed form**, and tracked until delivery is confirmed and any expected feedback has arrived.

### Reference numbers

- Generated automatically, for example **`NEC/SG/OUT/2026/00045`**.
- The number is issued **at registration**, so it can be typed on the letter before signature.

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| Reference number | Auto | Yes | Cannot be edited |
| Date registered / date dispatched | Auto / date | Yes | |
| Issuing office | List | Yes | Chairperson / Secretary General |
| Drafted by | User | Yes | Person who created it |
| Signed / approved by | List | Yes | Chairperson, SG, or delegated officer |
| Recipient organisation, name and title | List + text | Yes | Multiple recipients allowed |
| Copied to (cc) | List + text | No | |
| Subject | Text | Yes | |
| Document type and category | List | Yes | Same lists as incoming |
| Priority and classification | List | Yes | Same lists as incoming |
| In reply to | Link | No | Links to the incoming reference it answers, and closes that item |
| Dispatch method | List | Yes | Hand delivery, courier, post, email |
| Dispatched by | Text | Yes | Messenger or courier |
| Proof of delivery | File / text | Yes, once delivered | Signed delivery book page, courier receipt or email confirmation, plus date received |
| Feedback required | Yes/No | Yes | If yes: feedback due date and responsible follow-up officer |
| Feedback received | Link / date | When received | Links to the incoming reply and closes the follow-up |
| Scanned file (signed copy) | File | Yes | **The record cannot be closed without it** |

### Rules

- A document can be saved as a **Draft** (editable, with version history) and then marked **Final**. Once it is Final and signed, it is **locked** (see [Integrity](#7-document-integrity-versioning-and-audit-trail)).
- If feedback is required and has not arrived by the due date, the system **alerts the follow-up officer and the issuing office**.
- A **delivery book** (dispatch register) can be printed so messengers can collect recipient signatures.

---

## 6. Workflow, tracking and alerts

At any moment the system must show **where each document is, who holds it, how long they have held it, and whether it is overdue**.

### Statuses

**Incoming**

```
Registered → Routed → With action officer → Action taken / Reply drafted → Closed
```

Other statuses: *Returned for clarification*, *On hold*, *Filed (no action required)*.

**Outgoing**

```
Draft → Final (locked) → Dispatched → Delivered → Awaiting feedback → Closed
```

### Movement tracking

- Every hand-over, whether a routing in the system or a physical file movement, is recorded: **from whom, to whom, date and time, and reason**.
- The receiving officer must **acknowledge receipt** in the system. Items not acknowledged within **24 hours** are flagged.
- Officers can forward, return or comment on a document, but **cannot remove the history** of earlier steps.
- The Chairperson and Secretary General can add a **minute** (instruction), which the action officer sees first.
- Closing an item requires a **closing note**, for example *"replied by OUT/2026/00045"* or *"noted and filed"*.

### Due dates

The due date is set automatically from the priority:

| Priority | Response time |
|---|---|
| Urgent | 24 hours |
| High | 3 days |
| Normal | 7 days |
| Low | 14 days |

Only the routing officer can change a due date, and they must give a reason.

### Notifications

- **In-system notifications** for: new item assigned, due within 24 hours, overdue, and feedback overdue on outgoing documents.
- A **daily summary of overdue items** for each Administrator and Executive Viewer.
- **Optional email and SMS alerts** when internet access is enabled (Mode B, see [Deployment](#9-deployment-offline-first-online-optional)).

---

## 7. Document integrity, versioning and audit trail

**No user, including Administrators, can delete or overwrite a registered document or its history.** Every change creates a new version and an audit entry.

### Locking and corrections

- Scanned files are **read-only once saved**. A wrong or poor scan is fixed by adding a **new version**. The original stays visible in the version history.
- Register fields **lock when the record is saved**. To change one, the user submits a **correction request** stating the field, the new value and the reason. An Administrator approves or rejects it.
- The system keeps the old and new values, who requested the change, who approved it, and when.
- **"Delete" is replaced by Cancel / Void** with a reason. Voided records stay in the database and in reports, marked as voided.

### Tamper evidence

- Each stored file gets a **digital fingerprint (for example SHA-256)** at upload. The system checks fingerprints on a schedule and **alerts Administrators** if a file has been changed outside the system.
- Users **cannot access the storage folder or database directly**. Only the application can.

### Audit trail

| Event | Recorded detail |
|---|---|
| Login, logout, failed login | User, date/time, computer/IP address |
| View, download or print of a document | User, document, date/time |
| Create, route, forward, acknowledge, close | User, document, from/to, date/time |
| Correction requested / approved / rejected | Field, old value, new value, reason, approver |
| New file version | User, reason; both versions kept |
| User and role changes, password resets | Administrator, affected user, date/time |
| Export of reports | User, report, filters used |

The audit trail is **read-only**, **cannot be switched off**, and is **kept permanently**. Administrators and Auditors can search and export it.

---

## 8. Search, reporting and dashboard

Any document must be findable in **under 30 seconds** by reference number, sender, subject, date range, status, officer, or words inside the scanned text.

### Search

- A quick search box plus **advanced filters** on any field in the incoming and outgoing registers.
- **Full-text search inside scanned PDFs**, which depends on OCR at scanning.
- Results **respect classification**: users never see Confidential items they are not entitled to.

### Dashboard

The dashboard is the home screen for Executive Viewers and Administrators. It shows:

- Items received and dispatched this week and this month, by office
- Open items by status and by officer
- Overdue items, sorted by days overdue, with the responsible officer
- Outgoing documents still awaiting feedback after their due date
- Urgent items received in the last 24 hours

### Standard reports (exportable to Excel and PDF)

1. Incoming register for a date range
2. Outgoing / dispatch register for a date range
3. Overdue and pending actions by officer
4. Feedback tracker for outgoing documents
5. Full history (movement log) of a single document
6. Correspondence by sender or recipient organisation
7. Audit trail report (Administrators and Auditors only)
8. Monthly summary for management meetings

---

## 9. Deployment: offline first, online optional

The system must **run fully on the office network with no internet**, and must be able to switch on secure remote access later **without rebuilding anything**.

```
┌──────────────────────── Office network (LAN), works with internet off ──────────────────────┐
│                                                                                              │
│   Office PCs (web browser) ──HTTPS──►  Office server (application + database + file store)   │
│   Office scanner ─────────────────────►        │                                             │
│                                                └── UPS (battery backup, auto safe shutdown)  │
└──────────────────────────────────────────────────┬───────────────────────────────────────────┘
                                                   ┊  Mode B only (optional)
                                     Firewall + VPN or HTTPS with valid certificate
                                                   ┊
                              Remote users (laptop / phone browser, two-factor login)
                              Optional encrypted offsite / cloud backup copy
```

### Mode A — Offline (default, required at go-live)

- Application and database installed on a **dedicated server** (or small server PC) inside the office, on the local network (LAN).
- Office computers open the system in a **web browser**. Nothing is installed on each PC.
- **Every function in this document works without internet.** Email and SMS alerts are simply switched off.
- The server runs on a **UPS** (battery backup) with **automatic safe shutdown** during long power cuts. A generator connection is recommended.

### Mode B — Online / remote access (optional, switched on by an Administrator)

- Authorised users can open the system from outside the office (laptop or phone browser).
- Remote access only through a **secure channel**: a **VPN**, or **HTTPS with a valid certificate behind a firewall**. The database must **never** be exposed directly to the internet.
- **Two-factor login** (password plus a code from an authenticator app or SMS) is mandatory for every remote login.
- Administrators choose which users and roles may log in remotely. Confidential documents can be set as **office-only**.
- If the internet link drops, the office keeps working in Mode A without interruption.
- Optional: an encrypted offsite or cloud copy of backups.

The technician must specify the **server hardware, network equipment, scanner model and any licences** needed for both modes, with costs listed separately so Mode B can be bought later.

---

## 10. Security, backup and continuity

Losing the server must never mean losing records. Backups run automatically, are kept in at least two places, and are tested.

### Security

- Database and stored files are **encrypted at rest**. All connections are **encrypted (HTTPS)**, including on the office network.
- The server is kept in a **locked room or cabinet**. Access is limited to Administrators and the support technician.
- Operating system and application **security updates at least monthly**. In Mode A, updates are applied offline via USB.
- **Antivirus** on the server and on all scanning PCs.

### Backup (3-2-1 rule)

- **Automatic daily backup** of database and files, plus a **full weekly backup**.
- **Three copies, on two different media, with one copy kept outside the building.** The offsite copy is either an encrypted external drive rotated weekly to a secure location, or an encrypted cloud copy in Mode B.
- Backups are **encrypted**. A restore requires an Administrator password.
- A **restore test every 3 months**, recorded in the system.

| Backup type | Retention |
|---|---|
| Daily | 30 days |
| Weekly | 12 months |
| Monthly | Permanently |

### Continuity

- A **documented recovery procedure**: the system can be restored on replacement hardware **within 1 working day**.
- A printable **manual register form** for use during an outage. Entries are added to the system afterwards with the **original receipt time**.
- **No automatic deletion of records.** If disposal is ever required, it happens only under the NEC records retention policy and needs **both Administrators to approve**.

---

## 11. Non-functional requirements

| Area | Requirement |
|---|---|
| Usability | Simple screens in English. Registering a typical letter, including scanning, takes **under 3 minutes**. |
| Concurrency | At least **20 simultaneous users** without slowdown. |
| Capacity | 10 years of documents (estimated **50,000+ scanned files**), with room to expand storage. |
| Browsers | Current **Chrome, Edge and Firefox**; usable on a phone browser in Mode B. |
| Date format | **DD/MM/YYYY** |
| Time zone | South Sudan local time, **CAT (UTC+2)** |
| Ownership | NEC owns the system, data and source code (or holds a perpetual licence if an existing product is configured). No dependency on the technician's personal accounts. |

---

## 12. Deliverables

The technician must provide:

1. A **proposal** confirming the approach (build or configure), hardware list, timeline and itemised cost, with **Mode A and Mode B priced separately**.
2. An **installed and configured system** with categories, offices and priority rules set up.
3. **Migration of existing registers** (current Excel files or paper logbooks), if required.
4. **Documentation:** an administrator manual, a short user guide with screenshots, and the backup/restore procedure.
5. **Training:**
   - Administrators: half a day
   - Registry Officers: 1 day
   - Action Officers and Executives: 2 hours
6. **Handover** of all passwords, licences and source code to the two Administrators, signed for.
7. **Warranty and support** for at least **12 months**, with stated response times (for example same day when the system is down).

> **Payment is tied to passing the acceptance tests below, not to installation alone.**

---

## 13. Acceptance tests

All of these must pass before sign-off:

- [ ] Register, scan and route an incoming letter; the reference number is generated and the acknowledgement slip is printed.
- [ ] Register an outgoing letter with feedback required; the overdue feedback alert fires.
- [ ] A Registry Officer tries to edit a saved record and is blocked; a correction request is approved by an Administrator; old and new values are visible in the history.
- [ ] No user, including an Administrator, can delete a document or an audit entry.
- [ ] A user who is not entitled cannot find or open a Confidential document.
- [ ] The whole system works with the internet cable unplugged.
- [ ] Remote login works only with two-factor authentication (if Mode B is bought).
- [ ] A backup is restored onto a separate machine and documents open correctly.
- [ ] Full-text search finds a word inside a scanned letter.
- [ ] Registers export correctly to Excel and PDF.

---

## 14. Decisions NEC must confirm before the build

- [ ] Final list of document categories and departments
- [ ] Priority response times (proposed: 24 hrs / 3 days / 7 days / 14 days)
- [ ] Whether the two offices share one register, or keep separate registers with shared search
- [ ] Who may be granted remote access
- [ ] Budget ceiling and target go-live date

---

## 15. Ownership

The **National Elections Commission (NEC) of South Sudan** owns this system, its data and its source code. After handover, administrator rights belong only to the Executive Director (Office of the Chairperson) and the Secretary (Office of the Secretary General).
