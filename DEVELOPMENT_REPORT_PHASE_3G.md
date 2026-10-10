# Phase 3G development report

**Status: complete — Dashboard, Notifications, Reports & Audit Review.** This extends the frozen architecture and completed Phases 3A–3F. Verification uses isolated PostgreSQL databases and local Docker containers with synthetic employees. The previous report is retained in `DEVELOPMENT_REPORT_PHASE_3F.md`. Phase 3H is not started.

## 1. Dashboard changes

Admin gets linked counts for total/active employees, approved leave today, employees with attendance today, incomplete sessions, pending leave/corrections, overtime needing review, approaching document expiry, draft performance reviews and unfinished salary closeout. Database aggregates use organization-local day boundaries, including carryover sessions. Five recent permitted audit events provide action links. Counts identify their units: incomplete sessions differ from attendance report employee/day rows.

HR gets operational cards and permitted recent events. Salary, commission and private warning dashboard summaries are excluded. Existing company-wide People permissions govern operational access; commission management remains an independent grant.

The personal dashboard uses the authenticated employee's existing schedule, attendance, overtime, leave, salary and commission services. It shows today's eligibility/actions, active attendance, up to ten recent sessions intersecting today (including overnight carryover), authoritative weekly totals, upcoming schedules, leave status, available finalized salary and notifications. Commission access requires the current employee feature flag. Other employees' records and company counts are absent.

## 2. Notifications implemented

Existing correction submission/decision/staff correction, leave submission/decision, overtime review/decision, commission actions, finalized salary, released performance review, warning receipt and asset issue/return events are reused. Added events cover salary calculation/review/approval, commission included in finalized salary, employee overtime staleness, document approaching expiry/expired and missing checkout. Safe messages reference sources rather than exposing private amounts or documents. Titles derive from the existing event type; no replacement table was added.

The page supports 25-row pagination, all/unread filtering, timestamps, source links, individual read, read-all and the shared unread badge. SQL applies recipient and current source visibility before counting or paging. Links repeat authorization and destination pages enforce their own permissions. Unknown, missing, private, unpublished, revoked and no-longer-permitted sources fail closed. Read-all affects only currently visible notifications for the signed-in recipient. The existing notification-array API remains a first-page array; the new page endpoint provides totals and pagination.

`npm run notifications:due` is an idempotent one-off using runtime credentials. It checks document milestones at 30 days before expiry and on expiry, catches missed milestones, detects missing scheduled checkout and pending overtime, and reuses source/revision or source/expiry/milestone deduplication. A session advisory lock prevents overlapping runs; existing transaction locks protect writes. No maintenance HTTP endpoint, queue, persistent worker or external delivery was added. A host scheduler can invoke this during deployment preparation; no production schedule was installed.

## 3. Reports and exports implemented

| Report | Data and behavior |
|---|---|
| Employees | Identifier, name, current/most recent department and position, directory-consistent status and earliest join date |
| Attendance | Employee/day, scheduled and required time, authoritative actual time, status, incomplete-session count and lateness |
| Weekly overtime | Workweek, eligible actual time, policy threshold, potential and currently approved overtime, review/stale status |
| Leave | Employee, category, local start/end dates, paid treatment, status and reviewer |
| Salary | Stored period/calculation amounts, base, approved overtime/commission, bonuses/adjustments, deductions, total and lifecycle status |
| Commission | Employee, pre-order reference, earned amount, status and salary inclusion, including retained history |
| Document expiry | Employee, type, expiry date and status; no contents or unnecessary identity fields |

All company reports require staff authorization. Commission reports and raw salary CSV require Admin or HR with commission-management permission. HR without that grant sees ordinary salary components and only the aggregate of commission-restricted snapshots. Unclassified snapshots fail closed for detail. Employees use existing own financial pages, never company reports. Later feature withdrawal does not erase historical earnings for authorized staff.

Employee, department, date and status filters are validated server-side. Stored reports count/page matching rows in SQL; calculated reports reuse authoritative services over a bounded complete matching set. Pages contain 25 rows. CSV applies the same filters and an explicit column allowlist, exports at most 5,000 rows, quotes delimiters/newlines/quotes, adds a UTF-8 BOM and neutralizes formulas including whitespace/control prefixes. Filenames identify report/date scope: blank stored-report dates use `all`; calculated exports use resolved dates. Responses are private/no-store with attachment/nosniff headers.

## 4. Audit coverage added or repaired

Existing append-only audit covers accounts/roles/features, employee/employment/catalog changes, schedules/check-in/out, corrections, overtime, leave, compensation, commission, documents, activities, performance, warnings and assets. Added the missing salary-period calculation event and explicit commission-related classification on salary calculation/finalization evidence. Lifecycle transitions retain actor, record, timestamp and before/after state.

The centralized read-only list/detail supports date, actor, action, entity, employee, record and literal metadata search with 25-row SQL pagination. Admin sees full permitted coverage. HR is limited to existing People/time/ordinary compensation domains; account/security/policy events are excluded. HR without commission management cannot read commission or restricted/unclassified salary evidence. Historical classification and current source checks both apply.

Serialization recursively masks bank/account/identity/contact fields and excludes passwords, hashes, secrets, tokens, cookies, storage keys and file payloads. New writes use the same redaction; historical database evidence remains intact and is redacted on viewing. Actor labels use account display name or linked employee legal name, with an explicit user-ID fallback instead of incorrectly labelling employee actions System. Viewer/API are GET only; runtime credentials have no audit UPDATE/DELETE permission.

## 5. Timeline and integration changes

Existing source-linked timeline events and visibility services are reused. Tests retain private warning/document parent checks, publication withdrawal, own/foreign records, salary/commission restrictions, asset history and explained official corrections. No duplicate timeline engine or calculation policy was added.

Attendance/overtime reports are compared directly with existing services. Personal overtime staleness now checks the effective policy version consistently with reports. Final salary reports use immutable stored values; later source corrections retain final statements for reconciliation. Dashboard session counts and personal today-session lists include carryover. Notification attendance links open the employee day-review route; document/salary links resolve existing authorized destinations. Deactivated employees retain staff-accessible history while their current sessions/own access are revoked.

## 6. Database and migration changes

Migration `202610100008_insights` adds seven indexes for audit chronology/action, document expiry, leave status/date, salary-period status/date, performance drafts and incomplete attendance. It creates no table and changes no business data. All seven previous migrations remain unchanged. There are **26 domain tables**, plus Prisma metadata.

A populated Phase 3F upgrade compares users, employees, employment, documents, warnings, read notifications and audit evidence before/after, and verifies indexes/grants. Prior populated upgrades also pass. Runtime retains SELECT/INSERT/UPDATE on 25 mutable domain tables and SELECT/INSERT on audit, without DELETE, audit UPDATE, schema CREATE or migration-history access. No database reset, dependency change, policy revision, summary table or infrastructure service was needed.

## 7. Security and authorization test results

All 20 requested acceptance categories are covered by real PostgreSQL service tests, production HTTP checks and retained suites:

| Category | Evidence |
|---|---|
| 1. Admin counts | Compared with underlying fixtures and linked report data |
| 2. HR dashboard | Operational-only cards and permitted recent audit |
| 3. Own dashboard | Own records, feature withdrawal and overnight carryover |
| 4. Foreign notifications | Recipient/foreign record denials |
| 5. Single read | Correct recipient/record only |
| 6. Read-all | Current recipient and live visible sources only |
| 7. Deduplication | Repeated due processing and event/revision retries |
| 8. Destination authorization | Revoked/private/deleted sources and direct destination denials |
| 9. Attendance agreement | Existing summary comparison after actual corrections |
| 10. Potential versus approved OT | Partial approval, stale policy/source and pending totals |
| 11. Final salary | Immutable finalized stored components/total |
| 12. Financial access | Employee denial, HR grant checks, aggregate-only restricted snapshots |
| 13. CSV scope | Filters, columns, role denial, 5,000-row bound and private headers |
| 14. Formula injection | Actual exported malicious names plus control/whitespace unit cases |
| 15. Critical audit | New salary lifecycle events and retained mutation tests |
| 16. Audit isolation | Employee denial and HR domain/classification restrictions |
| 17. Audit immutability | Runtime UPDATE/DELETE rejection and absent mutation handlers |
| 18. Timeline privacy | Parent privacy, publication and feature withdrawal |
| 19. Deactivated history | Staff retains history; sessions revoked |
| 20. Regression suite | Every existing unit, integration and HTTP case passes |

Additional coverage includes exact source-filtered notification pagination/counts, legacy unclassified salary audit denial, literal search, redaction, concurrent-job exclusion, invalid/overposted filters, missing checkout, calculated-report bounds and additive upgrades. HTTP checks use real Auth.js cookies and origin protection, verify direct page denials, and confirm no anonymous maintenance endpoint.

## 8. Other tests and actual results

| Check | Actual result |
|---|---|
| Prisma generation, TypeScript and ESLint | Passed |
| Unit suite | **58 passed** |
| PostgreSQL integration | **193 passed** across eight files, including 35 insights cases and populated Phase 3F upgrade |
| Production Next.js HTTP smoke | **298 checks passed** |
| Native production build | Passed with webpack |
| Docker production build | Passed with default Turbopack |
| Docker runtime/image hygiene | **13 checks passed** |
| Runtime-credential due command and repeat deduplication | **8 checks passed** |
| Docker recreation persistence | **27 table/file checks passed** |

Browser checks cover desktop Admin summary-to-report navigation, document employee/status filters and CSV download, finalized salary audit filtering/detail, mobile HR report permissions and contained table scrolling, own dashboard check-in/out, individual/read-all notifications and badge updates. Accounts and local QA volumes contain only synthetic data. Final-container actor labels were checked after rebuilding.

Validation found and fixed blank-date CSV filenames, misleading System actor labels, overnight session omission and streamed forbidden-page HTTP status. No test was disabled or weakened. An initial build/smoke overlap replaced the running standalone output; final HTTP verification ran after the completed build. Final Docker packaging initially exhausted local VM storage; clearing disposable build cache and unused earlier QA images allowed the rebuild to pass. Some retained tests emit the existing adapter's pg@9 future concurrent-query deprecation warning; all assertions pass.

## 9. Known limitations

- Calculated attendance/overtime reports require at most 31 days and 50 filtered employees. Larger requests explicitly ask for narrower filters; no rows are silently omitted. CSV is bounded at 5,000 rows.
- Employee selectors offer 200 choices plus any selected record; validated direct employee filters remain supported. Personal recent sessions are limited to ten. Existing document/timeline views retain the latest-100 limit.
- Department filtering uses current/most recent employment, not a historical dimension. Blank stored-report dates include matching history; calculated reports default to the current workweek. Until dates are exclusive; salary/leave use interval intersection.
- HR without commission management receives no raw salary CSV under the frozen permissions. Own finalized aggregates remain available through existing services.
- Date-driven alerts require invocation of the one-off command. Production scheduling/monitoring belong to deployment preparation. No external delivery or live push is provided.
- Reports remain basic operational views; no warehouse, advanced analytics, automatic leave balances or changed compensation/attendance/overtime formulas.

## 10. Confirmation that production deployment was not performed

No production VPS, database, credentials, public ingress, external delivery or production scheduler was configured or changed. Docker validation used loopback publication and synthetic data. After validation, the temporary QA project/disposable volumes, QA environment credentials, owned browser tab and viewport override were cleaned up.

## 11. Recommended next phase

Phase 3G stops here. Await a separate request for Phase 3H preparation/deployment: confirm host resources and domain/TLS, secret provisioning, database/private-file backups and restore drills, migration/runtime roles, operational health/log handling and host invocation of the due command. Preserve approved business policies during deployment.
