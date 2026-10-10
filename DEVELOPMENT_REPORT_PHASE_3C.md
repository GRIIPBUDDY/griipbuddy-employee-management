# Phase 3C development report

**Status: complete — Work Schedules & Check-in/Check-out.** No production VPS or real employee data was accessed or changed. Validation used disposable local PostgreSQL databases, Docker containers and synthetic accounts/files. Development stops after Phase 3C.

1. **Features implemented**

   Admin/HR schedule management, employee picker, weekly views and assignment history. Each employee has independent dated recurring patterns with multiple periods per day, overnight periods, optional exclusive effective end, future replacement and cancellation through a rest pattern. Temporary replacements require explicit confirmation of the restoring pattern. Published slots remain immutable and previous versions remain available.

   My Schedule shows the organization date/timezone, today’s periods, check-in availability, next period, a navigable week, active session and recent attendance. My Attendance shows 25-row paginated history, expected and actual timestamps, derived duration, late arrival, source and clear completed/open/incomplete states. Scheduled and completed actual weekly totals remain separate factual time. Staff attendance views are read-only. Responsive employee and manager layouts were checked at desktop and 390px mobile widths.

   Schedule creation/change/cancellation and check-in/out use the existing append-only audit log and source-filtered employee timeline. Correction integration is a clear contact-HR/Phase-3D placeholder; no direct timestamp editor or second correction/request engine exists.

2. **Database and migration changes**

   Additive migration `202610090004_time` adds `work_schedules`, `schedule_slots` and `attendance_sessions`, bringing the current implementation to twelve domain tables plus Prisma migration metadata. Existing migrations 001–003 remain intact. Schedule versions themselves are the employee/stint assignments; no assignment, override or shift-instance table was added.

   Composite stint/employee ownership, active effective-range exclusion, cyclic weekly and adjacent-version overlap guards, positive bounded local periods, one nonvoided open session, actual-interval exclusion, scoped operation-key uniqueness and immutable history/provenance guards protect the new records. Slots must be published with a new version in the same transaction. Sessions preserve expected UTC timestamps, timezone/rules/early-window snapshots and source/revision/void foundations. Actual duration is derived, not stored redundantly. Runtime grants include eleven mutable domain tables and append-only audits, without hard-delete/DDL/migration-history privileges.

   Timezone/currency changes are blocked once official time records exist. New early-window policies apply to subsequent check-ins; existing facts retain snapshots. Employment changes/offboarding preserve actual attendance and historical slots, end future coverage and revoke account sessions. Runtime and bootstrap connections explicitly use UTC. The database clock query also returns an explicit UTC timestamp, preventing the pinned adapter from misinterpreting a non-UTC SQL-session offset. A real-clock and timestamp round-trip regression covers this.

   The frozen `ARCHITECTURE.md` is unchanged. `ARCHITECTURE_REVISION_PHASE_3C.md` records the newer request’s inclusive scheduled-end check-in cutoff. The prior Phase 3B report is archived as `DEVELOPMENT_REPORT_PHASE_3B.md`. New code is in `src/features/time`, `src/components/time` and the protected time pages/APIs. The only new direct dependency is pinned `@js-temporal/polyfill` 0.5.1 for IANA/DST resolution.

3. **Check-in/check-out rules implemented**

   The server derives the employee from the authenticated account. It acquires the existing global mutation lock, ordered user locks and employee row lock, then reads PostgreSQL `clock_timestamp()` truncated down to seconds. Browser timestamps, employee identities and rule overrides are rejected.

   Check-in is eligible from scheduled start minus the configured early allowance (initially 10; setting range 0–60) through scheduled end inclusively. Late arrival before cutoff is recorded; later attempts require a reviewed correction/exception. Current slot, effective date and employment ownership are validated. Previous-day overnight work and tomorrow’s near-midnight early window are supported. Ambiguous local times use the earlier offset; nonexistent scheduled local times produce an explicit issue. Calendar day boundaries use the first valid instant.

   Checkout is strictly later than check-in with no scheduled-end, duration or midnight cutoff. Missing checkout remains nullable and visibly open; after expected end it is also incomplete. Multiple returns to one occurrence are allowed. Only one nonvoided open session exists per employee, and actual sessions cannot overlap. Employee-scoped operation keys replay concurrent/repeated requests without duplicate facts/audits. Checkout targets the exact own session, so an old retry cannot close a newer session. Revoked accounts cannot bypass authorization to close attendance; later reviewed corrections handle those facts.

4. **Authorization and security tests**

   Guests, ordinary employees, malformed/overposted requests, foreign origins and inactive/revoked accounts are denied. Employees cannot manage schedules, select another employee through queries, check into foreign slots, read foreign sessions or reach management time pages by altering URLs. Admin/HR company-wide scope follows the frozen role model; personal attendance still derives the signed-in employee even for staff. Safe DTOs exclude credentials, operation keys and unnecessary actor/account metadata.

   Tests cover single-open/actual-overlap constraints, same-key and different-key concurrency, exact-session checkout retries, immutable published slots and timestamps, SQL ownership, timezone freezing, stale future edits, snapshots after replacements and retained open facts on offboarding. A blocked transaction is observed in `pg_locks` before advancing the controllable clock and releasing the lock, proving official time is acquired after the wait. There is no production clock override or test endpoint.

5. **Other tests and actual results**

   | Check | Actual result |
   |---|---|
   | Prisma generation / TypeScript | Passed |
   | ESLint | Passed |
   | Unit tests | **22 passed**: existing 10 plus 12 time/IANA/DST/boundary cases |
   | PostgreSQL integration tests | **65 passed**: 13 foundation, 25 people, 25 time, 2 populated upgrade tests |
   | Native standalone production build | Passed |
   | Production HTTP / real Auth.js cookies | **100 checks passed** |
   | Full and runtime dependency audits | **0 reported vulnerabilities** |
   | Docker production image, migrations, grants, bootstrap | Passed |
   | Production Docker bootstrap / roles | **5 + 13 checks passed** |
   | Production Docker Phase 3C / existing people flows | **17 + 23 checks passed**; final image recheck **14 time checks passed** |
   | Database restart / app recreation persistence | **8 time + 9 people checks passed** |
   | Production runtime / image hygiene | Passed: non-root, read-only app, private storage permissions, runtime grants, no owner secrets or packaged local/environment/private files |
   | Development Docker build / health / mounts | Passed |
   | Development attendance / roles / retained people reads | **14 + 13 + 9 checks passed** |
   | Browser employee forms | Passed: real check-in, immediate active session, checkout, completed history |
   | Browser manager forms | Passed: overlap rejection and publication of two daily periods; next-week view and superseded history verified |
   | Browser responsive checks | Passed: manager schedule, My Schedule and My Attendance at 390px with document width 390px |

   All nineteen requested acceptance categories are covered by the time integration suite: multi-period schedules, independent assignments, overlap/effective dates, exactly 10 minutes early versus 11 minutes early, late/after-cutoff arrivals, late/next-day checkout, duplicate/no-active actions, foreign slot/read isolation, timestamp injection, concurrent requests, historical snapshots, audits and incomplete sessions. Additional coverage includes real overnight assignments, Sunday/Monday and version transitions, near-midnight eligibility, repeated returns, stale retries, backward/equal-second checkout clocks, policy changes, DST and offboarding.

   Populated upgrade checks preserve Phase 3A identities/hashes/bank data/employment/audits and Phase 3B document metadata/publication/source-linked timeline. Existing tests were retained. Browser proof uses synthetic data in ignored `.local/phase3c-schedule.jpg` and `.local/phase3c-manager.jpg`.

6. **Known limitations**

   Attendance corrections are placeholders until the approved reviewed ADD/REPLACE/VOID workflow in Phase 3D revises the current immutable-fact guards through a reviewed migration. No missed-session request database or timestamp override is exposed. Calendar/leave excusals are not active; their future source-aware eligibility integration must extend the shared resolver before activation.

   Assignment history shows the latest 100 versions; recent schedule attendance shows ten sessions; full attendance history paginates 25. Availability and provisional elapsed time reflect page load and refresh; each submitted action rechecks official time. Existing document/storage/backup/deployment limitations from Phase 3B still apply. QA resources and credentials are disposable and were removed after verification; ignored toolchains, build caches and screenshots remain for local development.

7. **Scope confirmation**

   No salary, compensation, payroll, commission calculations/workflows, weekly overtime, multipliers, payable-hour approvals, complex leave, biometric/GPS/face tracking, workforce optimization or production VPS deployment was implemented. Existing later-module placeholders remain inactive. Extra actual attendance time is a fact, with no automatic overtime or pay approval.

8. **Recommended next phase**

   Await an explicit Phase 3D request. Implement its reviewed attendance-correction and overtime approval/calculation workflow in the approved architecture order, including required calendar/source-aware excusals and existing snapshot/revision/lock/audit rules. Do not begin automatically.
