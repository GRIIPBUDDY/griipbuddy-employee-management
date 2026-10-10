# Phase 3D development report

**Status: complete — Attendance Review, Corrections & Weekly Overtime.** The implementation extends Phases 3A–3C and stops before Phase 3E. Verification uses disposable local PostgreSQL databases, Docker containers and synthetic employee records. No production VPS or real employee data was accessed.

1. **Features implemented**

   Admin/HR attendance review supports employee, department, date range, exception, pending-correction and overtime-status filters. Day details expose all intersecting sessions, scheduled/required/actual quantities and late, early, absent, open and incomplete exceptions. Employees see their own summaries and completed history. Corrections use labelled session and assigned-period selectors, original/requested times, explanations and reviewer information.

   Reviewed ADD/REPLACE/VOID corrections, pending withdrawal, staff-origin proposals, source-linked timeline events, in-app notifications and weekly overtime review are operational. Simple paid/unpaid leave requests and company holidays supply authoritative absence excusals. Bounded temporary schedules may explicitly require holiday work. Organization settings expose future threshold versions, initial workweek selection and mandatory approval. Existing profile, private document, schedule, account and authorization flows remain available.

2. **Database and migration changes**

   Additive migration `202610090005_review` adds `attendance_corrections`, `overtime_reviews`, `calendar_days`, `leave_requests` and `notifications`: **17 domain tables** plus Prisma metadata. Existing migrations 001–004 are unchanged. The runtime role receives SELECT/INSERT/UPDATE on 16 mutable tables and SELECT/INSERT on audits; no hard-delete, audit-update, schema-create or migration-history privileges are granted.

   Database guards enforce correction ownership/positive completed intervals, one pending request per target, immutable proposals/decisions, unique employee-week overtime, approved bounds, preserved reviewed snapshots, non-overlapping approved leave, source ownership and recipient/event-key notification uniqueness. Attendance changes require a matching pending correction transaction context and revision. REPLACE marks the actual fact as CORRECTION while retaining its original source/timestamps in request and audit history. Published schedule, timezone/rules/early-window and operation-key snapshots remain protected. No summary cache, interval subtable or second audit engine is introduced.

   Populated upgrades from Phases 3A, 3B and 3C preserve identities, employment, audits, private-document metadata, source-linked history, schedules, attendance timestamps and rule snapshots. `ARCHITECTURE.md` remains intact. `ARCHITECTURE_REVISION_PHASE_3D.md` records the newer request's initial workweek configuration; prior revisions continue to apply. The Phase 3C report is retained as `DEVELOPMENT_REPORT_PHASE_3C.md`. No direct dependency was added.

3. **Attendance calculation rules**

   Completed, nonvoided sessions contribute integer **elapsed seconds** between actual UTC instants. Interval union prevents double counting; intersection clips quantities to organization-local day and week boundaries. Multiple sessions, overnight work, late checkout, split weeks and DST retain elapsed-time accuracy. Open sessions remain open and contribute zero finalized worked seconds; checkout is never inferred.

   Scheduled and required work remain distinct: approved paid/unpaid leave and normal holiday portions excuse required schedule time, while rest patterns require none. Explicit bounded holiday-work assignments keep their periods required. Full occurrence coverage is resolved before reporting-window clipping, so a prior-date overnight shift is not marked absent before its actual end, and next-date work can cover it. Ended uncovered occurrences require review. Late/early quantities use the first/last actual coverage of required portions. Pending corrections, missing checkout, invalid occurrences, employment conflicts and actual work overlapping approved leave block weekly review. Read-time summaries always use authoritative current sources.

4. **Weekly overtime calculation rules**

   Potential overtime is `max(0, completed eligible actual seconds − effective weekly threshold)`. Leave and unworked holidays never count as actual work. Initialization supplies an example **40-hour** threshold; Admin can append a different threshold for a future workweek. Old policy versions remain available and historical weeks resolve by their own start date, including an empty legacy policy's materialized baseline.

   Monday is the initial default. Admin may select another first weekday before any official schedule, attendance, overtime, leave or calendar source exists. Service and SQL guards freeze the boundary thereafter. This narrow revision avoids retroactively repartitioning historical weeks. Positive overtime always requires review under the frozen V1 architecture; there is no automatic approval option.

   Staff explicitly calculate a completed week. Zero potential becomes NOT_REQUIRED; positive potential becomes PENDING. One unique employee-week row is reused on repeated calculation. A reviewer approves between zero and potential seconds or rejects with zero. The review retains actual/potential/threshold/policy/timezone inputs and reviewer/time/comment. Deterministic partial approval selects the last approved seconds of chronological candidate intervals. Actual, potential and active approved quantities are displayed separately; no monetary value is calculated.

   Attendance/correction, pending-request, approved/cancelled leave and employment changes mark affected review rows STALE and audit/notify the change. Previous snapshots and approval remain inactive evidence. A refresh audits the previous inputs before storing a new calculation; a new authorized decision is required for active approval. Read-time comparisons also prevent stale or blocked inputs from exposing an active approved quantity. Page reads never create review records.

5. **Correction and approval workflow**

   An active employee proposes own ADD, REPLACE or VOID facts with work date, related record/period where applicable, complete requested timestamps where required and an explanation. Staff can propose a correction from an employee's day details. A scoped operation key replays the same proposal without duplicates and rejects changed payload reuse. Pending proposals do not change attendance; employees may withdraw them.

   Approval reacquires the established global mutation lock and ordered authorization/employee locks, then rechecks live permissions, employment coverage, positive past timestamps, same-employee selectors, actual overlap and target revision. Attendance creation/change/void, original/corrected audit, request approval, source-linked timeline and employee notification commit together. A conflict rolls the entire transaction back. Rejection preserves facts and stores the decision/comment. HR cannot review their own correction, leave or overtime; Admin reviews it. Admin self-review follows the frozen audited permission model.

   Local input times use the organization's IANA timezone. Ambiguous wall times choose the earlier offset; nonexistent times are rejected. Official self-service clock timestamps still come from PostgreSQL after locks. No direct employee/staff timestamp editor or second correction engine exists.

6. **Authorization and security tests**

   Every read/write service independently loads a live authorized actor. Employee subject identity derives from the signed-in account. Guest, ordinary employee management access, foreign subject/session/slot/request/notification identifiers, overposted actor/status fields, foreign origins and revoked/inactive credentials are tested. HR own-review denial and Admin review are tested. Safe DTOs omit passwords, storage identifiers, operation keys, recipient lists and unnecessary actor/account metadata.

   API mutations authenticate and validate canonical origin before parsing bounded strict bodies. UI visibility is supplementary. Notification lists and read actions reauthorize their recipient and current source; links open the exact correction/leave request or historical employee-week. Unknown or inaccessible sources fail closed. Database ownership, immutable proposal/decision history, retained approval snapshots, no hard deletion, unique operations and audit privileges are covered. Concurrent approvals commit one fact/audit; changed targets and intervening actual overlap cannot approve stale proposals.

7. **Other tests and actual results**

   | Check | Actual result |
   |---|---|
   | Prisma generation / TypeScript / ESLint | Passed |
   | Unit tests | **37 passed**: 22 retained plus 15 calculation/policy/DST cases |
   | PostgreSQL integration tests | **98 passed**: 13 foundation, 25 people, 25 time, 3 populated upgrades, 32 review |
   | Native production HTTP / real Auth.js cookies | **138 checks passed** |
   | Native production build | Passed with supported `--webpack` builder |
   | Production Docker build | Passed with default Turbopack builder |
   | Full / runtime dependency audits | **0 reported vulnerabilities** |
   | Docker migrations, runtime grants, bootstrap / startup | Passed |
   | Docker bootstrap / roles / Phase 3D HTTP | **5 / 13 / 29 checks passed** |
   | Docker persistence | **11 checks passed** after database restart and final app recreation; browser-approved three hours, attendance identity, threshold, privacy and historical alert retained |
   | Production runtime / image hygiene | Passed: non-root UID 1000, read-only app, writable bounded tmp/private 0700 storage, all new runtime grants, append-only audits, no owner secrets or packaged local/environment/test files |
   | Browser correction and overtime decisions | Passed: employee ADD submission, HR approval, stale detection, refresh and partial 3-hour approval with deterministic allocation |
   | Browser notifications | Passed: employee alert opens the historical approved week |
   | Browser responsive layouts | Passed at **390px**: employee correction, staff correction, attendance review and overtime review; document width equals viewport width |

   All **21 requested acceptance categories** are covered: completed-session duration; daily and weekly sums; configured threshold and zero/positive overtime; local week/timezone and midnight; unioned overlaps; missing checkout and ended absence; approved leave/holiday/rest excusals; correction submit/approve/reject; dependent recalculation; official timestamp protection and foreign-record isolation; overtime approve/reject; stale approval; audited changes; repeated-calculation uniqueness. Controlled database-time fixtures cover time-dependent decisions. Extra tests cover real SELF-record replacement, rollback without approval/audit/notification, concurrent decisions, full overnight coverage, bounded required holiday work, partial-leave early-window anchoring, HR self-review, empty policy history and authorized historical notification links.

   Native Turbopack compilation cannot bind its internal compiler port in this host's restricted environment. The supported native webpack build passed, and the Docker default Turbopack build passed. This is a host execution limitation, not an unresolved application build failure. Browser screenshots use synthetic data: `.local/phase3d-overtime.jpg` and `.local/phase3d-corrections.jpg`.

8. **Known limitations**

   This is a small-company V1 review workflow, without absence balances/accrual, additional-information correction states, holiday multipliers or advanced policy/analytics. Holidays can be added/renamed; calendar removal is not exposed. Work overlapping approved leave requires source resolution before overtime approval. Weekly review is explicit after the week ends; current-page summaries remain provisional until refresh. No background job or summary cache exists.

   Correction/leave/session histories paginate 25; overtime queue paginates 25; staff attendance review paginates 10 employees with a 31-day maximum filter. Pickers cap employees at 200 and schedule versions at 100; recent correction session choices cap at 25, with an explicitly selected older target included. Notifications and holiday lists show the latest 100. Existing private-document backup/restore, orphan-file cleanup and deployment limitations remain deferred. Disposable QA databases/containers/volumes and credentials were removed after verification; ignored toolchains, caches and screenshots remain for local development.

9. **Salary and commission boundary**

   **No salary, payroll finalization, monetary overtime, multiplier, bonus/deduction or pre-order commission calculation was implemented.** This phase supplies authoritative attendance and approved overtime quantities through the existing application data model. No separate API service, biometric/GPS/face tracking or production VPS deployment was added.

10. **Recommended next phase**

   Await an explicit **Phase 3E** request to connect approved work/overtime sources to compensation under the frozen salary, rate-version, boundary-week, locking, input-revision, approval and audit rules. Phase 3E was not started automatically.
