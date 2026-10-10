# GriipBuddy Employee Management — Phase 3H

Phase 4A release preparation is recorded in [RELEASE_SETUP_REPORT_PHASE_4A.md](RELEASE_SETUP_REPORT_PHASE_4A.md). Local Git is initialized; GitHub publication and read-only VPS inventory remain blocked by missing access. The application has not been deployed.

The internal employee workspace now includes employee creation, editing and deactivation; searchable profiles; department and position catalogs; private documents and photos; and a unified, permission-filtered work timeline. The frozen [architecture](ARCHITECTURE.md) applies with the narrow [Phase 3B catalog revision](ARCHITECTURE_REVISION_PHASE_3B.md). Accounts, authentication, authorization, settings and the application shell reuse Phase 3A. Phase 3C adds dated weekly work schedules, the employee schedule portal and actual check-in/check-out sessions. The [Phase 3C eligibility revision](ARCHITECTURE_REVISION_PHASE_3C.md) records the explicitly requested scheduled-end cutoff. Phase 3D adds attendance review, reviewed ADD/REPLACE/VOID corrections, source-aware leave/holiday exceptions, exact worked-time summaries, weekly overtime review and in-app notifications. The [Phase 3D policy revision](ARCHITECTURE_REVISION_PHASE_3D.md) records the initial week-start configuration and frozen mandatory approval. Phase 3E adds effective compensation history, monthly salary calculations, approved monetary overtime, reviewed adjustments, pre-order commissions, Admin finalization and later reconciled corrections. Phase 3F adds categorized leave requests, retained decision history, performance reviews, official warnings with receipt acknowledgement, and asset issue/return history. Phase 3G adds role dashboards, paginated source-authorized notifications, seven management reports with CSV export, and a centralized permission-filtered audit viewer. Phase 3H reviews security and prepares protected recovery and deployment procedures. No production VPS deployment is included.

## Stack and prerequisites

- Node **24.21.0**, Next.js **16.4.0**, React **19.3.0**, TypeScript, Tailwind CSS 4.
- Auth.js **5.0.0-beta.32** Credentials with encrypted JWT cookies; its published peer range includes Next.js 16 and React 19. This is a pinned prerelease, with production HTTP compatibility covered by the smoke test.
- PostgreSQL **18.4**, Prisma **7.10.0** with the PostgreSQL driver adapter, Zod, Argon2id.
- shadcn/ui-style source components in `src/components/ui`, Radix primitives and `components.json`; components are owned by the project rather than a separate UI framework runtime.
- Docker Engine/Desktop with Compose v2 or newer for the container workflow. Docker is a local prerequisite; this phase does not deploy to or inspect the production VPS.

Use `nvm use` if available, then `npm ci`. Exact dependency versions and the lockfile are project source inputs. Prisma tooling dependencies `deepmerge-ts` and `mysql2` have patched version overrides, verified by schema generation, migration and build tests.

## Environment

For Docker, copy `.env.example` to `.env.compose.local`; this filename is not automatically loaded by Next.js. Generate **different** random values for `AUTH_SECRET`, `POSTGRES_PASSWORD` and `POSTGRES_APP_PASSWORD` using `openssl rand -hex 32`; do not keep any `replace-` placeholder. Hex passwords avoid database URL encoding problems. Set a real bootstrap administrator email and a strong, unique temporary password. Environment files and `.local` are ignored by Git and Docker build context; no real operational secrets are included.

| Variable | Purpose |
|---|---|
| `APP_BASE_URL` | Exact browser origin, including port. Local default `http://localhost:3000`. HTTPS is required outside explicit local loopback development. |
| `AUTH_URL` | Same origin as `APP_BASE_URL`; Compose sets it automatically. |
| `AUTH_SECRET` | At least 32 random characters; encryption key for Auth.js sessions. Changing it invalidates existing sessions. |
| `ALLOW_LOCAL_HTTP` | `true` only for local loopback Compose smoke/development. Production HTTPS cookies are Secure. |
| `DATABASE_URL` | Non-owner runtime database URL. Compose constructs the internal `employee-db` URL from runtime credentials. The example host URL is only for a separately supplied local PostgreSQL server. |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Dedicated database and privileged bootstrap/migration owner. Not injected into the normal application service. |
| `POSTGRES_APP_PASSWORD` | Password for the fixed non-owner `employee_runtime` database role. |
| `MIGRATION_DATABASE_URL` | Supplied only to one-off database tools, never the application. The tools override supplies it without putting passwords in commands. |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_PASSWORD` | Empty-database initialization only. Remove the temporary password from `.env.compose.local` after successful initialization. |
| `COMPOSE_PROJECT_NAME`, `APP_PORT` | Dedicated Compose project and loopback application port. |
| `PRIVATE_DOCUMENTS_DIR` | Host-only absolute private directory; Compose fixes it to `/app/private/documents` on a persistent named volume. Never use a public directory. |
| `TZ` | Process UTC; organization business timezone remains authoritative in the database. |

Private storage must be writable by the application user. Its directory is mode 0700 and generated immutable files are 0600. Host development defaults to ignored `.local/private/documents`; set a dedicated absolute directory outside the checkout for durable host use. Database and private files both require the later backup/restore deployment workflow; this phase does not implement backups or cleanup.

## Local Docker setup

Run from this directory after replacing environment placeholders:

```sh
docker compose --env-file .env.compose.local build employee-app
docker compose --env-file .env.compose.local up -d employee-db
docker compose --env-file .env.compose.local -f docker-compose.yml -f docker-compose.tools.yml run --rm --no-deps employee-app npm run db:migrate
docker compose --env-file .env.compose.local -f docker-compose.yml -f docker-compose.tools.yml run --rm --no-deps employee-app npm run db:runtime-grants
docker compose --env-file .env.compose.local -f docker-compose.yml -f docker-compose.tools.yml run --rm --no-deps employee-app npm run db:bootstrap
docker compose --env-file .env.compose.local up -d employee-app
docker compose --env-file .env.compose.local ps
```

Open the configured local origin. Sign in as the bootstrap administrator and change the temporary password. Bootstrap refuses to run once **any users exist**, and does not overwrite accounts. Subsequent accounts are provisioned from **User accounts**. Staff distribute temporary passwords through an existing verified company channel; there is no registration or email recovery service.

The main Compose file starts exactly two persistent services. PostgreSQL has **no published port** and connects only to the internal backend network. The app binds only to `127.0.0.1`. Database files persist in a project-specific volume at PostgreSQL 18's `/var/lib/postgresql` mount. Employee document bytes persist separately in the `employee-documents` named volume at `/app/private/documents`. Runtime runs as the image's non-root `node` user with a read-only filesystem, bounded temporary storage, pool/resources/logs and health checks. Initialization scripts only execute for a new database volume; rotating passwords later requires changing the existing database role credentials too.

The migration owner owns objects. Runtime may SELECT/INSERT/UPDATE the twenty-five mutable domain tables, SELECT/INSERT audit history, and cannot mutate audit rows, create schema objects, or read Prisma's migration table. Apply/review grants after each later migration. Audit triggers are additional protection; a trusted database owner can change them. Migrations and bootstrap are **one-off commands from the same application image**, not startup commands or a third permanent service.

Never use `docker-compose.tools.yml` with `up`; it grants privileged credentials solely to ephemeral tools. It is not a production runtime configuration. `docker compose --env-file .env.compose.local down` preserves database data; adding `-v` deletes database and document volumes and is not part of normal setup.

For container development, initialize the database first with the commands above, then run:

```sh
docker compose --env-file .env.compose.local -f docker-compose.yml -f docker-compose.dev.yml up --build employee-app
```

The development override mounts selected source/configuration paths read-only and uses separate writable dependency, build and generated-client volumes owned by the non-root application user. It excludes all environment files and local tooling so the application cannot load owner/bootstrap credentials. Database remains internal. Recreate the development dependency volume when the lockfile changes. The ordinary Compose file runs the production build locally. The later authorized VPS procedure is documented in [DEPLOYMENT.md](DEPLOYMENT.md), with protected configuration in `.env.production.example` and an explicit release-image override. No production deployment is performed in this phase.

## Host development with your own local PostgreSQL

If using `npm run dev` outside Docker, supply a dedicated PostgreSQL 18 database accessible locally, an object-owning migration account, and an `employee_runtime` login without SUPERUSER/CREATEDB/CREATEROLE privileges. Do not point development tools at a production database. The main Compose database is deliberately not exposed to host development.

Create a host `.env` containing only `DATABASE_URL`, `APP_BASE_URL`, matching `AUTH_URL`, `AUTH_SECRET`, `ALLOW_LOCAL_HTTP`, `PRIVATE_DOCUMENTS_DIR` and `TZ`. Do not copy the owner/bootstrap variables from `.env.example` into the Next.js environment. Set `DATABASE_URL` to the runtime URL. For the one-off commands, temporarily supply `MIGRATION_DATABASE_URL` and the three `BOOTSTRAP_ADMIN_*` variables from protected configuration, then:

```sh
npm ci
npm run db:generate
npm run db:migrate
npm run db:runtime-grants
npm run db:bootstrap
unset MIGRATION_DATABASE_URL BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_ADMIN_NAME BOOTSTRAP_ADMIN_PASSWORD
npm run dev
```

The server normally binds `127.0.0.1:3000`. Ensure the browser origin matches `APP_BASE_URL`. Do not leave migration credentials in the environment of the app; production startup explicitly rejects them. For a host production-build smoke check use `npm run build && npm start` with configured runtime environment; Next.js recommends its generated standalone `server.js` for packaged execution, which the Dockerfile uses.

## Security and data model

- Twenty-six domain tables: `users`, `employees`, `employment_periods`, `organization_settings`, `audit_logs`, `employee_documents`, `employee_activities`, `departments`, `positions`, `work_schedules`, `schedule_slots`, `attendance_sessions`, `attendance_corrections`, `overtime_reviews`, `calendar_days`, `leave_requests`, `notifications`, `compensation_rates`, `salary_periods`, `salary_calculations`, `salary_adjustments`, `preorders`, `performance_reviews`, `disciplinary_records`, `assets`, `asset_assignments` (plus Prisma's migration metadata). UUID identities, restrict-delete foreign keys, normalized email/employee-number/order-reference uniqueness and ownership constraints.
- Simple department/position catalogs use stable references, unique case-insensitive names and audited deactivation. Original employment labels remain historical snapshots; additive migration 003 backfills references. See the recorded catalog revision above. Roles are `ADMIN`, `HR_MANAGER`, `EMPLOYEE`; no generic RBAC tables. Employment intervals use inclusive start/exclusive end, with PostgreSQL exclusion and one-open-period constraints.
- Account creation, role/status/grant changes, temporary password resets and settings edits are Admin-only. Admin and HR manage employee personal/employment information, catalogs, private documents and work records. Only Admin can provision a new login; HR links an existing unlinked account. Employees read their own permitted profile/documents/timeline and update only their contact information, with identity derived from the session. Staff accounts may exist without an employee; Employee-role accounts require a profile.
- Data functions authorize independently of layouts/navigation, validate UUIDs and scope employee queries to ownership. Safe profile DTOs expose allowlisted linked-account details and exclude password hashes, bank details, storage identifiers and session metadata. The staff directory searches name/employee ID, filters department references across employment history and derived status, and paginates 25 records. Account lists remain capped at 100.
- The employee `preorder_commission_enabled` flag and HR `can_manage_commissions` grant govern different paths. Disabled commission links are absent; direct requests receive HTTP 403. The combined employee flag controls own access and earning eligibility; the separate HR grant controls management. Retained eligibility evidence is required for historical orders.
- Sessions have an immutable absolute **12-hour** lifetime. Every protected operation reads account status, role, employee ownership/employment/grants and session version from PostgreSQL. Role/grant changes, disabling, password resets and password changes invalidate old sessions.
- Temporary passwords expire in **24 hours** and force a change before all private pages/data. Argon2id uses 19 MiB, 2 iterations, parallelism 1, bounded to four concurrent operations. New passwords are 12–128 characters with a bounded common-password denylist. Five recent wrong passwords lock an account for 15 minutes. Unknown login identity uses equivalent hash work and a generic error.
- Auth.js CSRF checks remain enabled, mutation actions require the canonical Origin, auth HTTP handlers discard forwarded-host/protocol input and normalize to the configured origin. Production cookies are HttpOnly/SameSite/Secure on HTTPS. Trusted ingress IP limits and resource benchmarking still require the later deployment environment; arbitrary client IP headers are not used as authority.
- Sensitive writes acquire the frozen global transaction lock then user rows in stable ID order, recheck the acting account and commit audit facts with the mutation. Last active administrator cannot be disabled or demoted by these operations. Audit records omit passwords/hashes/tokens/bank values. Admin has the full audit viewer; HR has explicitly permitted operational-domain history, with commission details requiring the separate grant.
- Settings default to Asia/Dhaka, BDT, 10 early minutes, Monday threshold history at 40 hours, and zero fixed commission. Admin can edit company name and early allowance, append future overtime thresholds, and publish commission rules. Timezone, currency and workweek boundaries freeze once official time or pay sources exist. Future early-allowance changes affect new check-ins; existing sessions preserve the original rules and timezone.

## Documents, profiles and timeline

Use **Employees** to search, create or edit profiles. Create active departments and positions in their management pages before assigning them. Their names are unique even when inactive. Deactivation retains catalog references; an employee may keep an inactive assignment while other details are edited. Directory names reflect catalog renames, while employment history shows preserved label snapshots. Employment status derives from account state and dated employment periods in the organization's timezone. Employee deactivation immediately revokes the account and preserves linked records, documents and history.

Staff upload through a profile's document section. Supported types are PDF, JPEG and PNG, at most **10 MiB** before and after validation. The server checks actual format, normalizes images and strips metadata (maximum 16 million pixels, 8000 pixels per side, one frame). A memory/time-bounded PDF worker rejects encrypted, malformed, active/action-bearing, form-bearing and excessive-complexity PDFs. PDFs always download as attachments; normalized images support a protected inline view. These checks are file validation, not antivirus scanning.

Generated storage identifiers never derive from filenames and never appear in browser DTOs. Durable immutable bytes are published before the audited metadata transaction commits. Authorization runs on every list/view/download; there are no public document URLs. Uploaded files default to staff-only. Staff may explicitly release or withdraw employee visibility with an audited reason; withdrawing a profile photo also clears its profile reference. Employees cannot upload, delete or release documents. Removing document access soft-deletes metadata and retains immutable bytes; failed metadata commits can leave private orphan files. Physical garbage collection is deferred and must coordinate using the documented storage lock.

A profile timeline combines source-linked profile/employment/document events with staff-created achievements, notes, training, onboarding, important events and other records. Newest events appear first. Employees see only explicitly published own records and currently permitted sources; unknown future sources fail closed. Staff corrections retain previous content in audit history; removal is soft deletion with a reason. The timeline resolves the implemented attendance, leave, pay, commission and People operations sources through their existing permissions. Document and timeline lists currently show the latest 100 entries. Issue/expiry dates feed the daily one-off notification command described below. Manual records have no attachment field in this phase.

## Work schedules and attendance

Staff use **Schedule** to choose an employee, view their week, publish recurring periods and review previous assignments. Select the employment period and inclusive effective start; the optional end is **exclusive**. Add any number of periods per day, using “Next day” for overnight work. A period has a positive duration of at most 24 local hours. The server rejects weekly, cyclic Sunday/Monday and adjacent assignment overlaps. Assignments must fit the selected employee’s employment period.

Published periods cannot be edited in place. Use **Replace or cancel future dates** from tomorrow or later. Removing every period publishes a rest pattern. A temporary replacement splits the original assignment, and requires explicit confirmation of the pattern to restore after its end. Previous versions, immutable period IDs and existing attendance snapshots remain available. Normal changes are rejected if attendance has already started in the replacement range, including a tomorrow period checked into early tonight. Schedule reasons and changes use the existing audit log and source-linked employee timeline. Staff may read company attendance; personal check-in/out always operates on the signed-in employee.

**My Schedule** displays the organization date/timezone, today’s periods, availability, the next period, a navigable week and recent sessions. **My Attendance** provides 25-row paginated session history. An open session displays “Currently working”; after its scheduled end it also displays “Incomplete”. Checkout stays missing until actually submitted. Scheduled and completed actual weekly time are distinct factual totals clipped to week boundaries; open sessions are provisional. Weekly review keeps completed actual time, potential overtime and active approved overtime separate.

Check-in opens at scheduled start minus the organization’s `earlyCheckinMinutes` setting, initially **10** (allowed setting range 0–60). It remains eligible through the scheduled end inclusively. Late arrival before that cutoff is recorded; later attempts are rejected with a correction explanation. The server derives employee identity, validates the current assignment/date and records PostgreSQL clock time **after** mutation locks, truncated down to seconds. Runtime database connections use UTC; the clock query also explicitly converts its result to UTC to avoid host/session offset interpretation. IANA rules resolve local periods using the pinned Temporal polyfill: repeated local times use the earlier offset; nonexistent scheduled local times produce a clear issue instead of silently shifting. Calendar day boundaries use the first valid instant of that day.

Checkout must be strictly later than check-in and has no scheduled-end, midnight or duration cutoff. Multiple returns to one period are allowed, with one nonvoided open session per employee and no overlapping actual intervals. Employee-scoped check-in and checkout operation UUIDs make repeated/concurrent requests replay the same fact. Checkout selects the exact own session, so an old retry cannot close a newer one. Buttons prevent pending repeats, while transactions and PostgreSQL exclusion/partial uniqueness enforce the rules independently. Actual duration is derived from recorded timestamps, never stored redundantly.

Snapshots retain scheduled UTC start/end, timezone, rules version, early allowance and source. Official timestamps and published period identity are guarded against ordinary updates/deletion in PostgreSQL. Offboarding or shortening employment preserves actual facts and historical periods while ending future schedule coverage and revoking sessions. An open session on a revoked account requires an authorized staff correction; it does not bypass account authorization.

## Attendance review, corrections and overtime

**Attendance review** filters employee, department, date range (up to 31 days), exception, pending correction and overtime status. It shows scheduled, required and completed actual quantities plus late/early/missing/open exceptions. Day details list all intersecting sessions and correction links. **My Attendance** shows the signed-in employee's own summary. Staff access follows the existing Admin/HR role model; every service authorizes independently.

**My corrections** offers labelled attendance and schedule-period selectors. ADD proposes missing completed work, REPLACE proposes corrected times for an existing record, and VOID proposes excluding an erroneous record. Whole-second local timestamps use the organization timezone; ambiguous times use the earlier offset, and nonexistent times are rejected. Requests require an explanation and remain pending without modifying facts. Employees can withdraw pending requests. Staff can submit an employee correction from day details and approve/reject requests with a comment. HR cannot review their own correction; Admin reviews it. Approval rechecks ownership, employment coverage, target revision and actual overlap, then updates the fact, request, audit, timeline and notification in one locked transaction. Original timestamps/source and immutable schedule snapshots remain traceable. No direct timestamp editor exists.

**Leave & holidays** supplies the essential absence sources: employees request paid/unpaid intervals, staff approve/reject or cancel an approval, and staff publish full-day company holidays. Approved leave and normal holidays remove required schedule portions; rest patterns have no required work. A bounded, explained temporary assignment can require holiday work. Leave hours are never actual worked hours. Check-in uses the remaining required occurrence and its early window. Missing checkout remains incomplete. Absence review waits for the full occurrence to end, including overnight work.

Durations use integer elapsed seconds from completed, nonvoided attendance. Intervals are unioned and clipped to IANA organization-local day/week boundaries; midnight, multiple sessions and DST preserve elapsed time. Open sessions contribute no finalized worked time. Summaries derive from authoritative sources on each read; no summary cache or interval table exists. Pending corrections, incomplete sessions, invalid schedule occurrences and work/leave or employment conflicts block weekly review until resolved.

**Weekly overtime** uses `max(0, eligible completed actual seconds − configured threshold)`. Initialization provides a 40-hour example threshold, not a legal rule. Admin appends a future-week threshold version in **Organization settings**; historical weeks retain their effective policy. Choose the first weekday before publishing official time, leave or calendar records. The initial default is Monday; later boundary changes need a reviewed historical migration. Positive overtime always needs manager approval in V1, following the architecture freeze. The settings page shows this policy explicitly; no auto-approval switch is exposed.

After a week ends, staff explicitly calculate/refresh its single employee-week review. Repeated calculations reuse the row. Zero potential is `NOT_REQUIRED`; positive potential is `PENDING`. Reviewers approve 0 through potential time or reject; HR cannot review their own week. The review retains exact inputs, threshold, timezone, amount and decision. Approved time allocates to the latest eligible chronological overtime portions, deterministically. Current potential and active approved quantities remain distinct. Corrections, pending requests, approved/cancelled leave and employment changes mark affected reviewed results `STALE`, preserve their previous decision as inactive evidence and require fresh calculation/review. In-app notifications open the exact authorized request or week, are recipient-scoped and can be marked read. Phase 3E salary calculations consume the active approved quantities with the applicable effective compensation terms.


## Salary, compensation and pre-orders (Phase 3E)

**Compensation & history** on a staff employee profile supports Monthly, Hourly and Daily terms. Start is inclusive and end is exclusive. Select a current version to replace part or all of its effective range; the old version and untouched left/right ranges remain available. Terms must fit the employee's employment stint and use the organization currency. Employees can read their own history and cannot edit it. Monthly/Daily overtime requires an explicitly agreed hourly equivalent; Hourly derives it from its base rate. The configurable multiplier defaults to 1 and is a company agreement, not a legal rule.

**Salary periods** uses exact calendar months with a derived month label, following the freeze. HR/Admin creates and calculates the complete roster of employees whose employment overlaps the month, including departed and zero-pay employees, plus employees with assigned earned claims or later corrections. There is one calculation per employee/month. Calculations are estimates until the month advances through **Draft → Calculated → Under Review → Approved → Finalized**. HR/Admin prepares and reviews; only Admin approves and finalizes. All intersecting workweeks must finish first, so closeout may wait up to six days after month end.

The recorded Decimal formulas are:

| Component | Frozen V1 rule |
|---|---|
| Monthly base | Sum each effective monthly rate × covered calendar days / calendar days in that month. Attendance does not automatically reduce this base. |
| Hourly base | Effective hourly rate × (completed actual seconds − valid approved overtime seconds + eligible paid-absence seconds) / 3600. Rejected overtime remains ordinary worked time. |
| Daily base | Effective daily rate × covered regular scheduled seconds / scheduled seconds on that local date, capped at one unit per date. Multiple work periods share the denominator. |
| Paid absence | Union of approved paid leave and eligible holiday schedule coverage, less unpaid leave and **all actual work**, including overtime. Required holiday work receives no automatic holiday credit. |
| Overtime | Approved Phase 3D chronological tail allocation × effective hourly base or agreed equivalent × multiplier. Split at local date, rate and month boundaries; no second overtime engine. |
| Final total | Base + approved overtime + approved commission + approved bonuses/allowances + signed Other/Correction − approved deductions. |

Arithmetic uses Decimal precision 40 and half-up rounding. Base, overtime and each remaining component round once to two decimals; final total sums those rounded components. Rate inputs may have four fractional digits. No binary floating-point money arithmetic is used. Snapshots retain effective rate versions, employment, schedules, actual sessions, absence sources, weekly decisions, daily quantities, claims, adjustments, formula version and rounding rule. Daily contribution display uses four decimals while final components use two.

**Salary adjustments** creates Pending Bonus, Allowance, Deduction or signed Other proposals; Allowances contribute to the bonus component. Approval is required before inclusion. Editing an unincluded proposal resets approval and invalidates the target month. HR cannot approve their own financial proposal. Daily work without a scheduled denominator requires an approved Other adjustment with evidence explicitly reviewing the employee's unscheduled work for that month; its amount is added separately, and no daily rate is guessed. Missing rates/equivalents, open sessions, source conflicts, pending corrections/leave/adjustments, unresolved overtime or assigned commissions block closeout. Negative final amounts block review/approval; no debt is carried automatically.

**Pre-orders & commissions** uses one combined order/commission record, with fixed or percentage rules, server-calculated half-up amounts, company-wide normalized unique references (including cancelled claims), and Pending → Approved/Rejected → Included status. Admin publishes the rule for new employee submissions; existing claims retain their historical rule. Eligible employees submit their own current claims with a database-recorded order instant and may withdraw pending claims. Authorized staff may backfill historical orders only with an explicit historical rule, employment coverage and a retained eligibility grant valid at that order instant. A current flag does not prove historical eligibility. A new employment stint resets commission eligibility and requires a fresh Admin grant.

Authorized management verifies claims, approves/rejects them, and assigns or explicitly defers them to an open month. An unassigned unresolved earned claim blocks unpaid months on or after its order date. A pending claim explicitly deferred to a later open month does not block the earlier month. Editing an unincluded claim resets its approval. HR's commission-management grant is independent of personal earning/access eligibility; HR cannot review their own claims. Navigation, direct page/API requests, source links, timeline and notifications recheck current feature permissions.

**My Salary** shows only the authenticated employee's finalized statements. Draft calculations are staff estimates. Ordinary own breakdowns remove internal adjustment reasons. If a snapshot contains any commission source or related correction, an employee with revoked access receives only month/currency/final total; every breakdown, raw snapshot, source amount and restriction marker is suppressed, even for a zero-value commission or correction. HR without the management grant similarly receives the permitted aggregate. Revocation never erases earned money.

**Finalization & later corrections** claims approved adjustments and pre-orders, fixes every statement and closes the period in one locked transaction with audit, timeline and safe in-app alerts. Database guards prohibit changing finalized periods/statements and included source claims. Relevant source changes increment unfinished month input revisions and reset review/approval, including adjacent-month week dependencies and an outstanding historical correction's target month. Capture and arithmetic run separately; committing an estimate rechecks revision, roster and live authority under the shared mutation lock.

To fix finalized pay, resolve its historical sources and choose **Reconcile a later salary correction** on the staff salary statement. The server computes desired corrected total − original final total − already finalized signed corrections. One unsettled reconciliation is allowed per original statement. Review and finalization recheck its facts and remaining delta. Historical changes reset its approval; refresh or reject it before proceeding. Commission refunds use a classified reconciliation with a verified replacement source amount, preserving the original included claim. The target must be a later open month. The original salary is never reopened.

Lists paginate 25. Period details show the complete calculated roster. Compensation history caps at 100 versions; employee pickers at 200; month pickers and retained grant choices show the most recent 25/100 and 200 respectively. These are simple V1 workflows; no general commission engine, custom pay cycles, tax, accounting, payment processing, automatic absence deductions or production VPS deployment is included.

## Leave, performance, warnings and assets (Phase 3F)

**Leave** accepts Annual, Sick, Personal, Emergency, Unpaid and Other categories. Category is separate from the requested Paid/Unpaid treatment consumed by the existing attendance/pay sources; Unpaid category requires Unpaid treatment. First and last dates are inclusive in the employee form and become an exact exclusive-end interval in the organization timezone. Existing partial-day records remain unchanged. Requests use an employee-scoped operation UUID; identical retries replay the same request and another active exact-interval request is rejected. Pending requests can be withdrawn. HR/Admin approves or rejects with an optional comment; cancelling an approval requires a reason. HR cannot decide their own request. Approval rechecks employment coverage and approved-interval overlap. History shows reviewer, time, comment and earlier decisions from the append-only audit log. Staff can filter employee, dates, category and status.

Approved leave reuses the authoritative Phase 3D attendance sources. It removes required scheduled portions without adding worked time or overtime. Existing invalidation marks affected weekly decisions stale and resets unfinished salary review; finalized salary remains immutable and uses the existing later-correction workflow. There is no leave balance or accrual engine.

**Performance** starts as a draft with review dates, optional 1–5 overall and five dimension ratings, strengths, improvement areas, reviewer comments and private staff notes. Finalization requires an overall rating. HR/Admin manages company records; HR cannot finalize or correct their own official review. Admin may do so with audit evidence. Only finalized records explicitly released to an employee appear in their portal, timeline or notifications. Staff notes are excluded from own responses. Finalized corrections require a current revision and an explanation; prior content remains in audit. Publication time and original reviewer stay fixed. Reviews use inclusive starts and exclusive ends.

**Warnings** supports Notice, Warning, Serious warning and Final warning. HR/Admin creates drafts, chooses explicit employee release and optionally requests receipt acknowledgement. Issue date, reason, description, action, issuer, existing same-employee private attachment and staff notes are supported. Profile photos cannot be warning attachments. Generic document release does not override a draft/private/revoked warning: document lists, download handlers and timeline links recheck parent visibility. The subject alone acknowledges the current released revision; this confirms receipt and never agreement. An official correction requires a reason, retains the old contents and receipt in audit, and clears the current receipt. Revocation retains the row while removing own portal/source access. HR self-publication and self-correction require Admin.

**Assets** supplies a company register for laptops, phones, cameras, SIMs, access cards and other equipment. Codes are normalized and unique; inventory records availability, retirement/loss, serial, condition and private notes. Assigned status derives from the single outstanding assignment. HR/Admin records issue and return dates/conditions; one active holder is enforced under locks and by a PostgreSQL partial unique index. Returned assignments cannot be edited or deleted. Employee history retains the identification snapshot taken at issue, so later relabeling or another holder cannot alter or leak into it. Employees cannot assign, return or edit assets. Outstanding returns from inactive/departed employees are flagged, without automatic return on offboarding.

All four modules reuse the existing mutation authorization boundary, audit log, unified timeline and in-app notifications. Direct own URLs/APIs derive identity from the current account and reject foreign records. Lists paginate 25; management employee pickers cap at 200 and attachment options at 100. Migration **007** is additive, bringing the schema to **26 domain tables** and retaining migrations 001–006 and their data guards. There is no new dependency, permission engine or background service.

## Tests and commands

```sh
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
npm run test:http
npm audit
```

Unit tests exercise authorization/validation/business dates and IANA/DST schedule boundaries. Integration tests create **isolated real PostgreSQL 18.4** clusters via a dev-only embedded binary, run all committed Prisma migrations and use the non-owner runtime role. They test actual server data/mutation services, including tampered IDs, privacy DTOs, account administration denials, feature grants, login locks, forced password changes, expired/revoked/inactive identities, overlap/ownership constraints and audit privileges, plus catalog relationships/deactivation, optimistic edits, private file validation, ownership/publication, timeline corrections, historical preservation populated Phase 3A/3B/3C migration upgrades, precise attendance windows, midnight/overnight boundaries, scoped concurrent retries, immutable snapshots and real database-clock UTC round trips. Phase 3D covers all 21 requested calculation, excusal, correction, approval, staleness, privacy, audit and idempotency categories, including atomic rollback, DST, overnight coverage and historical notification links. Phase 3E adds salary formulas, rate changes, approved source inclusion, financial data isolation, historical eligibility, rehire reset, negative-pay blocking, complete rosters, immutable finalization and later-delta reconciliation tests. A populated Phase 3D upgrade retains approved overtime, leave, holidays and notifications. Phase 3F adds leave idempotency/decision history, published-review corrections, warning receipt reset and parent-document privacy, concurrent asset issue, immutable return snapshots and live timeline/alert isolation. A populated Phase 3E upgrade retains compensation, finalized salary, leave and audit facts. They do not connect to or wipe your configured application database.

The HTTP smoke script requires a prior production build. It starts a fresh isolated PostgreSQL cluster and the generated production standalone Next.js server, uses real Auth.js credentials/CSRF/encrypted cookies, and checks protected pages, roles, ownership, navigation, feature denial, account revocation, password-change gate, foreign origins and logout, plus catalog operations, profiles, parsed document upload/download, publication changes, timeline corrections, schedule publication/replacement, ownership, timestamp injection and concurrent attendance retries, plus correction decisions, future threshold policies, weekly overtime approval/staleness and recipient-scoped notifications, plus compensation, commission rules/claims, salary estimates, approved adjustments, Admin finalization, private historical salary statements and revocation projections. Phase 3F checks real leave, review, warning and asset APIs/pages with foreign-record, overposting, self-review and private-note denials. Phase 3G adds role dashboards, all report/CSV APIs and pages, current calculation agreement, formula injection, notification read-all/counts, audit filters/details/domain denials and absent mutation/maintenance endpoints. The portal clock is checked against PostgreSQL directly. Temporary servers/clusters stop when tests finish. Tests require local process/socket access and must run as a non-root user (PostgreSQL's requirement); initial package installation downloads the platform's test binary. These tests supplement, and do not claim to replace, Docker image/Compose startup validation.

| Command | Purpose |
|---|---|
| `npm run dev` | Local development server |
| `npm run build`, `npm start` | Build / run on host |
| `npm run db:generate` | Generate type-safe Prisma client |
| `npm run db:migrate` | Apply committed migrations with one-off owner credentials |
| `npm run db:runtime-grants` | Apply reviewed least-privilege grants |
| `npm run db:bootstrap` | Initialize the first admin and singleton settings |
| `npm run notifications:due` | One-off daily runtime notification catch-up |

## Dashboards, notifications, reports and audit review (Phase 3G)

**Dashboard** uses actual database aggregates for Admin/HR operations and links every card to its underlying management view. Today means the organization-local day and includes overnight sessions touching it, including earlier sessions still open. Incomplete attendance is a session count, distinct from the attendance report's employee/day rows; the report supplies the session count per row. Other pending queues cover all dates. HR receives operational cards and permitted recent audit activity, without salary/commission or disciplinary summary cards. Linked staff also have their personal workspace. Employees receive only their own current eligibility/actions, recent sessions, authoritative weekly worked/potential/approved time, leave status, safe alerts and finalized salary. Own commission access follows the current feature flag.

**Notifications** offers 25-row pagination, All/Unread/Read filters, an unread navigation badge, single-read and mark-all-read actions. Current source permissions filter rows before counting/pagination and are checked again before returning stored messages or following links. Unknown, deleted, unpublished/private-parent and now-ungranted sources fail closed. Recipient/event keys deduplicate retries. Titles derive from the existing event type; messages contain no financial amounts or private HR notes. New event coverage includes salary review/closeout, commission inclusion and own overtime staleness, retaining earlier attendance/leave/HR events. `/api/me/notifications/page` returns the paginated result; `/api/me/notifications` remains a compatible array of the current first page. `/api/me/notifications/read-all` is an origin-protected POST.

**Daily due reminders** are a one-off runtime command, never an HTTP maintenance endpoint or an additional service:

```sh
npm run notifications:due
# From the existing application image, with normal runtime credentials only:
docker compose run --rm --no-deps employee-app npm run notifications:due
```

The later deployment phase must schedule this command once daily on the host; no production scheduler is installed here. A nonblocking PostgreSQL advisory run lock (`73102303`) prevents overlapping invocations. Short 100-source transactions use the existing mutation lock (`73102301`), current database time and live publication/grants. Documents emit the 30-day and expiry milestones, keyed by document/expiry date/milestone; missed milestones catch up, including documents that expire on the current local date. Staff get metadata-only reminders; employees get only their released documents with permitted warning parents. Missing scheduled checkout and pending overtime use source/revision keys. Repeated commands do not duplicate alerts. No worker, queue, Redis or external delivery is introduced.

**Reports** is available to Admin/HR: Employees, Attendance, Weekly overtime, Leave, Salary, Commissions (separate grant) and Document expiry. Filters support employee, current/most-recent department, supported status and organization-local dates. Employee dates filter join date; leave/salary include intersecting periods; commissions filter local order date; document dates filter expiry. Stored reports show all dates when date inputs are blank. Attendance/overtime default to the current workweek. The Until date is exclusive. Overtime reports resolve the full workweeks intersecting the selected range. Documents reaching their expiry date count as Expired.

Report pages paginate 25 matching rows. Attendance/weekly overtime reuse the established calculations, including approved leave, holidays, overnight clipping and stale review rules; they accept at most 31 days and 50 filtered employees. Larger calculated requests return a clear filter-refinement error, rather than partial totals. Open work is excluded from completed eligible time. Stored financial reports use existing calculation/commission records; finalized amounts never recalculate. HR without the commission grant sees ordinary components and only the permitted total on restricted salary snapshots. Organization-wide commission data and raw salary CSV require Admin or the separate HR commission grant. Current grant revocation does not erase staff-accessible historical earnings.

CSV exports apply the same filters/authorization and explicit report columns, include a UTF-8 BOM, quote delimiters/newlines and neutralize formula prefixes through whitespace/control characters. Export filenames describe report/date filters. Exports contain the complete filtered result, not merely the current page, with a 5,000-row cap (calculated reports also retain their 31-day/50-employee bound). Refine filters when a cap is reached. No document bytes, filenames, identity numbers, bank details, private notes, hashes or storage references are exported. Excel/PDF reporting is outside this phase.

**Audit review** provides 25-row metadata pages, local date range, actor/action/entity/employee/record filters, literal metadata search and individual before/after details. Search covers action, entity, record ID and system source, not arbitrary payloads. Admin sees all domains. HR sees the frozen People/time/ordinary-compensation domains; account/security/policy events remain excluded, and commission events need the grant. Unclassified historical salary audit payloads fail closed for plain HR even if today's source snapshot is ordinary. New salary calculation/finalization audit facts carry explicit commission classification. Sensitive nested structured keys are masked/excluded both at new writes and historical display; historical rows and eligibility evidence remain unchanged. No audit mutation/export route exists; existing runtime grants and append-only triggers remain in force.

Migration 008 adds seven query indexes only, retaining all 26 domain tables, 25 mutable-table grants and append-only audit history. The populated Phase 3F upgrade compares retained user/profile/employment/document/warning/notification/audit records before/after; earlier populated upgrade tests retain finalized pay and attendance history. No summary cache, reporting warehouse or alternate history/calculation engine is added.

## Structure

```text
src/app/                  App Router pages, layouts, auth and health handlers
src/components/ui/        Reusable shadcn/ui source components
src/components/layout/    Responsive shell, navigation and profile menu
src/features/accounts/    Account services and server actions
src/features/people/      Profiles, employment, private documents and unified timeline
src/features/organization/ Department/position catalogs and audited management
src/features/time/        Dated schedules, occurrence eligibility, official clock and attendance
src/components/time/      Schedule forms/views and attendance display
src/features/review/      Corrections, absence sources, exact summaries, overtime and notifications
src/features/insights/    Role dashboards, filtered reports/CSV and permission-filtered audit review
src/components/review/    Review forms, labelled selectors and quantity views
src/features/pay/         Effective compensation, Decimal calculations, claims and reconciliation
src/components/pay/       Salary breakdowns and compensation/commission review forms
src/features/people-operations/ Reviews, warnings, asset register, assignments and authorization
src/components/people-operations/ Management forms, own records, filters and history
src/features/settings/    Settings data and mutations
src/lib/auth/             Credentials/passwords/request helpers
src/lib/authorization/    Live actors and simple role/ownership policy
src/lib/documents/        Bounded file validation, PDF worker and private storage
src/lib/db/               Prisma connection, audit, transaction boundary
src/lib/validation/       Shared Zod allowlists
src/lib/utils/            Safe errors, business dates and CSS classes
src/types/                Auth/session/action types
prisma/                   Schema and reviewed SQL migration
scripts/                  One-off DB tools and production HTTP smoke
tests/                    Unit and PostgreSQL-backed security tests
docker/                   Initial non-owner role provisioning
```

See [DEVELOPMENT_REPORT.md](DEVELOPMENT_REPORT.md) for validation evidence and remaining deployment-phase decisions. Phase 3H stops at review and preparation. Read [DEPLOYMENT.md](DEPLOYMENT.md) and [BACKUP_RECOVERY.md](BACKUP_RECOVERY.md); owner review and a separate deployment authorization are required.


## Phase 3H recovery and production preparation

The salary timeline now fails closed when a historical snapshot lacks commission classification, using the existing salary permission helper. Normal production startup validates canonical HTTPS origins, the non-owner runtime role and separation of owner/bootstrap secrets; invalid configuration terminates the process with redacted diagnostics. Admin settings displays the age of the last recorded verified offsite backup. A locally validated dump never marks that field successful.

`scripts/operations/recovery.mjs` is privileged host tooling for a protected database/document set, local checksum verification and restoration into a new disposable `griipbuddy-restore-*` project. It uses the existing image and private file deletion-lock protocol; no HTTP maintenance endpoint or new persistent service is introduced. The recovery runbook describes encryption/offsite verification, separately protected configuration, approved manual retention and session invalidation before any future disaster-recovery reopening.

The deployment runbook covers read-only inspection of the shared Hostinger VPS, free loopback-port selection, the existing reverse proxy, domain/SSL acceptance, one-off migrations/grants, first-install-only bootstrap, image rollback, health checks and later approved scheduling. GitHub/release identity, real offsite backup and target-host HTTPS/capacity checks remain prerequisites. Local test results are recorded in the current 18-section readiness report; prior Phase 3G evidence is archived in [DEVELOPMENT_REPORT_PHASE_3G.md](DEVELOPMENT_REPORT_PHASE_3G.md).
