# EMPLOYEE INCIDENT & PERFORMANCE RECORDS IMPLEMENTATION REPORT

Local implementation and verification only. **Production was not accessed or modified** for this change; nothing was deployed.

## Features implemented
- **Module** "Incident & performance records" (switch in Settings → Modules, on by default): staff page `/manage/incidents`, record page `/manage/incidents/[id]`, an **Incidents** tab on every employee profile, and **Incident records** in the employee portal (`/me/incidents`). Dashboard card "Incidents awaiting review".
- **Record**: employee, date and optional time, category, short title, factual description, impact, severity (concerns only), internal staff notes, private evidence, optional links to a task, attendance session, work record, existing warning or performance review; reported-by and created timestamps; review status, decision note, reviewer and time; employee acknowledgement and response; corrective action, follow-up date, completion; resolution. Only employee, category, title, description, date and (for concerns) severity are required.
- **Categories**: Work quality / mistake, Attendance, Task or deadline, Customer service, Policy violation, Communication, Workplace conduct, Other; positive: Achievement, Excellent performance, Improvement, Successful resolution.
- **Overview**: open records, awaiting review, high/critical open, overdue follow-ups, resolved in 30 days; employees with three or more reviewed concerns in 90 days listed *for review only*; search by employee name/ID or reference (`INC-00012`); filters for category, severity, review status, open/resolved, date range and reporter; 25 per page.
- **Evidence** through the existing private document storage (new document category "Incident evidence", staff-only by default) — upload or link an existing private document; downloads use the existing authorized document routes.

## Database changes
Migration `202610150012_incident_records` (atomic, additive): one table `incident_records` with integrity checks and a history trigger, three indexes, one new document category row. No existing table or row changes. Runtime grants extended to the new table. No separate responses table (one response per record is sufficient; history lives in the audit log).

## Workflow and status model
Draft → Under review → Confirmed / Disputed / Unsubstantiated → Resolved or Closed. Positive records can be confirmed directly. Details are editable only in Draft or Under review; after a decision the database refuses changes to the facts until the record is reopened. Reopening requires a reason and returns the record to review; the earlier decision and resolution stay in the audit history. A record awaiting review is labelled as not a confirmed fault. Corrective actions (Coaching, Additional training, Process correction, Verbal discussion, Formal notice, Warning, Further review, Other) with optional follow-up date and completion; **no fine, deduction, commission change, compensation change or suspension is ever triggered** — a formal warning is linked, never created automatically.

## Permission and privacy controls
All checks are server-side in the service (pages, server actions and the evidence API share them). Admin: everything. HR/Manager: all employees except their own records (403 `SELF_RECORD`; excluded from their lists and counts). Employees: only their own records that staff explicitly shared — never drafts, internal notes, the reporter, staff history or other employees' records; direct URLs return not-found. Evidence linked to an unshared record is hidden from the employee's document list, notifications and timeline; notifications and timeline entries re-check the record's visibility at read time. The module switch also blocks pages and actions server-side.

## Employee-response behaviour
Employees acknowledge receipt (stated everywhere: acknowledgement is not agreement) and, when invited, respond once with "I accept" or "I dispute" plus an explanation. The database keeps the response and acknowledgement exactly as submitted (they cannot be erased or rewritten), the staff decision is unchanged by a dispute, and staff are notified of the response.

## Audit integration
Existing audit log: created, edited, submitted, review decision, visibility changed, evidence attached/removed, corrective action recorded, follow-up completed, resolved, closed, reopened, acknowledgement, response — with actor, time, record and before/after values. Audit history remains append-only for the application role; incident rows cannot be deleted (trigger).

## Tests executed and actual results
- Typecheck: **PASSED** · Lint: **PASSED** · Production build (webpack, as in the image): **PASSED**
- Unit: **105/105 PASSED**
- PostgreSQL integration: **267/267 PASSED**, including 12 new incident tests covering: create; edit draft; review/confirm; disputed and unsubstantiated; employee response; acknowledgement without agreement; corrective action and follow-up (incl. overdue); private evidence; no cross-employee access; employees cannot change records; internal notes hidden; audit of the full lifecycle; counts and date filters; search and pagination; timeline integration; preservation after deactivation; deletion prevented; HR self-restriction; module switch.
- HTTP acceptance: **338 checks PASSED**
- Brave E2E (Playwright 1.63, production build, fresh database): **38 passed, 1 skipped** (email change needs development mode), **0 failed** — including the new incident workflow: Admin creates, submits, uploads PDF evidence, confirms, records coaching and shares; the employee acknowledges and disputes (internal notes and evidence not shown); a colleague cannot see the record, its evidence or the staff page; HR sees the dispute, completes the follow-up, resolves, and finds it on the employee profile with filters.

## Known limitations
- One employee response per record (kept permanently); further statements can be added by staff in internal notes or a new record.
- One evidence document per record (replaceable; every change audited).
- Incident categories are a fixed short list by design.
- Employees see evidence only if the document itself has been released to them; incident evidence is staff-only by default.

## Formula and production confirmations
- Salary, overtime, attendance and compensation formulas were **not changed**; incidents never write to pay, compensation, commission or account-status data (asserted by tests).
- **Production was not accessed or modified** during this change. The migration and code exist only in the local repository and local test databases.
