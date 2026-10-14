# Architecture

GriipBuddy Employee Management is deliberately small to run:
- one Next.js application;
- one PostgreSQL database;
- one private folder for uploaded documents;
- one daily background job for reminders.

There is no message queue, cache server or separate API service.

```text
Browser ──HTTPS──> Nginx ──> Next.js app (server components, server actions, API routes)
                                │
                                ├── PostgreSQL 18 (runtime role with least privilege)
                                └── Private document volume
Daily timer ──> one-off container: npm run notifications:due
```

## Stack

| Concern | Choice |
|---|---|
| Web app | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui-style components |
| Authentication | Auth.js v5 with credentials and encrypted session cookies; Argon2id password hashing |
| Database | PostgreSQL 18, Prisma 7 with the `pg` driver adapter, SQL migrations |
| Validation | Zod schemas. Inputs are strict: unknown fields are rejected. |
| Dates and money | Temporal (IANA timezones) and decimal arithmetic for all amounts |
| PDFs and images | pdf-lib (payslips, registers, reports) and sharp (image normalization) |
| Tests | Vitest (unit and integration with embedded PostgreSQL), an HTTP acceptance script, and Playwright |

## Code layout

```text
src/app/              Routes: (protected)/manage/* for staff, (protected)/me/* for employees, api/* route handlers
src/features/<area>/  Business logic: data access, rules and server actions for each area
  accounts, people, organization, time, review, pay, people-operations, tasks, insights, settings
src/components/       Presentation only; reusable primitives live in components/ui
src/lib/              Shared infrastructure: auth, authorization, db, documents, pdf, branding, validation, http
prisma/               schema.prisma and the numbered SQL migrations
scripts/              runtime-grants, bootstrap, the local demo workspace, the notification job, recovery tools
```

Pages, server actions and API routes all call the **same service functions** in `src/features`. Every rule and permission therefore lives in one place, whichever way a request arrives.

## Request security

1. **Identity.** `getIdentity()` reads the encrypted session cookie. Sessions expire after 12 hours, or 1–90 days with "remember me", at an absolute deadline.
2. **Actor.** Each operation runs inside `securityBoundary()`, which reloads the user from the database every time: role, account status, session version, employee link and employment. A role change, suspension or password reset therefore takes effect immediately.
3. **Permission.** Services call `assertRole(actor, ["ADMIN", "HR_MANAGER"])` for staff areas. Employee functions derive the employee from the session, never from the request, so changing an ID in a URL reveals nothing.
4. **Writes.** `authorizedMutation()` runs the change in a database transaction. It holds a global advisory lock, re-checks the actor and writes the audit entry in the same transaction. Mutating requests must come from the app's own origin.
5. **Responses.** Every response is `Cache-Control: private, no-store`, so one user's data is never cached for another.

Optional modules are switched on or off in Settings. A disabled module's navigation, pages and APIs disappear: its pages and APIs return "not found".

## Database

- **Two roles.** Migrations run as the owner. The app connects as `employee_runtime`, which `scripts/runtime-grants.ts` limits to the reads and writes it needs. It cannot change the schema, and it can only append to the audit log.
- **Constraints do the hard guarantees.** Examples:
  - one open attendance session per employee;
  - no overlapping sessions;
  - no overlapping employment periods;
  - unique employee numbers and emails.
- **Triggers protect history.** Official attendance times, finalized salaries, incident records and the audit log cannot be silently rewritten or deleted. Attendance changes only through an approved correction.
- **Migrations are additive.** They extend the schema and backfill values; data is never reset.

## Time and attendance

- **Official time** is the PostgreSQL clock (`databaseNow()`), never the browser. The organization timezone in Settings defines local dates. Times are stored in UTC.
- **Schedules** are versioned weekly patterns. An *occurrence* is one dated period: its start, its end and its check-in window.
- **Attendance sessions** keep a snapshot of the schedule they were recorded against, so later schedule changes never rewrite history.
- **The live "Currently working" view** (`src/features/time/live.ts`) reads open sessions with a fixed number of queries, whatever the headcount. The UI polls `GET /api/manage/live-workforce` every 15 seconds while the page is visible.
- **Worked time** is calculated on demand from completed sessions, clipped to local day and week boundaries. There is no summary table that could drift.

## Pay

- **Compensation** is effective-dated.
- **Salary months** move through Calculated → Reviewed → Approved → Finalized. A finalized statement keeps a full snapshot of its inputs and never changes; corrections become adjustments in a later month.
- **Overtime** becomes payable only after a reviewer approves it.
- **Amounts** use decimal arithmetic with half-up rounding.
- **Payslips and registers** are generated as PDFs with the organization's branding.

## Documents

Uploaded files are stored in a private volume under random identifiers; they are never public URLs.

On upload:
- the real file type is checked;
- images are re-encoded without metadata;
- PDFs are inspected in a time- and memory-limited worker.

Every download is authorized again. Deleting a document hides it but keeps the bytes for recovery.

## Notifications and jobs

In-app notifications are stored per recipient. Each time they are listed or opened, the user's permission for the source record is checked again.

The daily job `npm run notifications:due` adds date-based reminders: missing checkouts, expiring documents and pending overtime. It is safe to run twice, because an advisory lock and event keys prevent duplicates.

## Testing

| Layer | What it covers |
|---|---|
| Unit (`tests/unit`) | Pure rules: dates, time zones, pay formulas, policies |
| Integration (`tests/integration`) | Real services against a throwaway embedded PostgreSQL with the real migrations and runtime role |
| HTTP (`scripts/http-smoke.ts`) | The production build with real sign-ins, cookies, permissions and API behaviour |
| End-to-end (`tests/e2e`) | Playwright against the local demo workspace (`npm run qa:local`) |
