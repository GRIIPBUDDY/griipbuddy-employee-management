# WORKFORCE OPERATIONS & COMPENSATION CHANGE REPORT

Date: 11 October 2026. Scope: the existing local application and synthetic databases. Stages A–G implemented in one Next.js application, one PostgreSQL database and the existing Compose architecture. No new dependencies or external services were introduced.

## 1. Architecture and documentation changes — Passed

Added `ARCHITECTURE_REVISION_WORKFORCE.md` with authorization boundaries, additive database impact, frozen financial inputs, formula/cutover and the staged implementation. Added `WORKFORCE_OPERATIONS.md` covering staff/employee workflows, email adapter configuration, session policy, local recovery and historical compatibility. The owner's two confirmed choices are retained: calendar-day proration and approved paid leave/holiday coverage.

## 2. Database migrations — Passed

Added `202610110009_workforce` after the eight existing migrations. Five new entities support commission rechecks, verified email requests, independent tasks, frozen weekly statements and consented swaps. Existing account, compensation, commission, settings and salary tables receive additive fields. Foreign keys, ownership/state checks, revision guards, immutable history and financial inclusion claims remain enforced. Runtime grants include the new tables; logical whole-database backup tooling includes them automatically.

Fresh and populated migration checks passed in the integration suite. The persistent local database was backed up while PostgreSQL was cleanly stopped, then migrated without reset. Before and after counts match: 4 users, 2 employee profiles, 2 attendance sessions and 2 salary calculations. All local accounts retain Active status. A private physical backup contains database data, documents, configuration and verified SHA-256 metadata for 1,448 database/document/configuration files (Finder metadata excluded); its protected location is under `.local/development/backups/` and is excluded from Git/Docker context.

## 3. Commission confidentiality behavior — Passed

Ineligible employees receive generic 404s for commission and recheck reads/actions. Their profile, dashboard, notifications, timeline and salary responses omit commission hints, including nested zero-valued snapshot fields. A revoked employee retains an earned statement's aggregate total while restricted components disappear.

Only authorized staff grant access and create, edit, review, assign or cancel unincluded commissions. Employees cannot create entries or edit amounts; eligible employees can read only their own records and request rechecks. Staff corrections are audited. Included financial sources stay frozen; corrections require separately approved linked adjustments. Fixed/percentage calculations use server Decimal arithmetic and duplicate reference safeguards. Staff lists show workweek, salary assignment, creator/reviewer and timestamps.

## 4. Admin email-change flow — Passed; live provider Not Tested

Account settings require the current password and a unique new address. The old identifier stays active until a one-use, hashed, expiring token verifies the new address. Completion retains the original user/employee IDs, role and permissions, revokes prior sessions, and notifies the previous address. Failed old-address notices remain retryable. Authorized employee account management uses the same verification path; another administrator's email cannot be changed by that form.

Tests cover missing delivery configuration, invalid reauthentication, duplicate addresses, ownership verification, token reuse, identity preservation and a mocked HTTPS delivery adapter with old-address notification. Production preview fallback is blocked. Real outbound delivery was **Not Tested**: no live provider was configured or contacted. The exact HTTPS adapter contract is documented; local preview requires explicit enablement, a loopback origin and a non-production runtime.

## 5. Remember-me implementation — Passed

The existing encrypted Auth.js JWT cookie supports the optional checkbox. Normal lifetime remains twelve hours; remembered lifetime defaults to thirty days and is configurable from 1–90 days. Absolute deadlines do not roll on visits. Cookies are HttpOnly and SameSite=Lax, with Secure on production HTTPS. Passwords are never placed in browser storage or cookies. Server boundaries load current account status and grants; revocation and suspension invalidate remembered identities.

Real production HTTP tests verified both lifetimes, persistent cookie expiry, non-rolling identity, server revocation, suspension and logout. Local HTTP tests use the explicit loopback override; an external HTTPS proxy was **Not Tested**.

## 6. Account status controls — Passed

Staff employee profiles show Active, On hold and Suspended, with reasoned changes, actor/history audit and generic personal notifications. On hold retains permitted reads/login but blocks check-in/out, task progress and swap operations. Suspended blocks new login and rejects prior sessions. Employee self-changes, HR modification of staff/Admin targets, and last-active-Admin deactivation remain guarded. Historical records are retained.

## 7. Task assignment functionality — Passed

Staff assign one task to up to 100 distinct active employees in one operation. Each assignee gets an independent record with dates, priority, provenance, status and server completion time/note. Idempotent bulk retries do not duplicate records. Employees retrieve and progress only their own assignments; completed history cannot be silently rewritten. Staff can edit uncompleted proposals with an audit reason.

Lists and CSV reports support assigned, due and organization-local completion dates, employee/status filters and exclusive range ends. Tests verify independent completion, altered IDs, replay keys, immutable completion and Hold/Suspended enforcement.

## 8. Weekly earnings and month-end payment workflow — Passed

Weekly calculation produces stored inputs, component amounts, potential/approved overtime and month-boundary allocations. Staff review and finalize current, resolved snapshots. Frozen statements cannot be recalculated or edited. A draft is the pre-calculation state; the first saved calculation is Calculated. Weekly source inclusion claims and later monthly inclusion prevent duplicate settlement.

Monthly statements aggregate finalized weekly portions plus approved month-end adjustments. Review, approval and finalization validate the entire roster and all intersecting workweeks. Payment remains Unpaid until a separate authorized recording supplies its actual timestamp and optional reference/note. Replays of identical evidence are safe; changing recorded evidence is rejected. The system performs no bank transfer. HR cannot review or record their own pay.

Integration evidence includes a fully attended monthly salary summing to exactly 1,000.00 across five frozen weeks, source edits leaving those snapshots unchanged, complete monthly finalization, explicit payment, immutable payment evidence and a linked later correction. The personal dashboard separates finalized earnings from estimates awaiting review and omits ineligible commission labels.

## 9. Attendance-proportional salary calculation — Passed

For each effective monthly rate/employment segment:

`segment base = monthly basic × eligible segment calendar days / month calendar days × credited regular seconds / planned payable seconds`

Credit is the union of verified scheduled ordinary work and approved paid leave/holiday coverage, capped at planned time and excluding approved payable overtime. Unpaid leave has no credit. Full eligible attendance earns the full configured basic; missing coverage reduces it. Unscheduled sessions generate no automatic ordinary base. Zero/invalid planned hours and missing compensation coverage block finalization.

Tests cover full and half attendance, mid-month employment/rate segments, paid absence without double counting, separation of approved overtime, unscheduled base zero, retained legacy formulas, precise half-up rounding and cumulative weekly cents. No tax or labor-law compliance calculation was introduced.

## 10. Overtime hourly-rate and approval behavior — Passed

The new formula uses approved seconds ÷ 3,600 × the effective individual overtime hourly rate. Legacy equivalents/multipliers remain historical only. Missing individual rates are disclosed blockers; no rate is invented.

Late checkout and unscheduled work update an unapproved weekly candidate and notify staff. Review retains factual time, potential seconds, approved seconds and decision evidence separately; employee self-approval is denied. Rejected time generates no premium. Integration tests verify a one-hour late candidate pays exactly 20.00 after approval and that an unresolved effective rate blocks finalization. Existing workweek invalidation/re-review coverage remains passing.

## 11. Recurring schedules and shift swaps — Passed

The default helper creates two four-hour sessions with a four-hour unpaid gap, configurable weekdays/start times and overnight support. Six days yield 48 working hours. Expected hours are separately versioned from overtime thresholds; existing threshold history remains intact and new organizations start at 48 hours.

One-week, indefinite and bounded assignment, occurrence-only restoration, future replacement/cancellation and safe future-series edits preserve prior versions. Swaps require partner consent, then distinct staff approval with fresh authority, employment, attendance, revision and overlap checks. Both employees' dated exceptions commit atomically. Tests cover successful exchange/restoration, competing requests, missing consent, stale assignments, overlapping recipient rollback, overnight boundaries and retained historical inputs.

## 12. Attendance-report date-filter fix — Passed

Default attendance reports and own attendance views use today's organization-local date. From alone selects one date; From/Until selects an exclusive-ended range. Recurrence is expanded only inside the requested range. Tests cover local-midnight behavior, exact-day results, explicit ranges and consistent task report date meanings. Production HTTP checks confirm default and single-date behavior.

## 13. Security and data-isolation test results — Passed

The complete integration and production HTTP suites pass ownership, current authorization, generic feature denial, hidden fields, foreign IDs, mutation origins/CSRF, session revocation, status limits, frozen history and safe report/notification/audit projections. The production HTTP suite uses real Auth.js cookies, the non-owner runtime role and disposable PostgreSQL.

Native smoke verification **Passed** after the Mac became available: the preserved local app was started in a fresh VS Code terminal and returned readiness 200; Brave visibly loaded `localhost:3000/login` with the Remember me checkbox. This was a native startup/login-page smoke check; exhaustive manual execution of every staff form was **Not Tested**. Production HTTP tests rendered the new staff and employee pages and exercised their authenticated API boundaries.

## 14. Other test results

- **Passed:** 81 unit tests across 9 files.
- **Passed:** 206 integration tests across 9 files, including fresh/populated migrations and new workforce workflows.
- **Passed:** 331 production HTTP smoke assertions using real Auth.js cookies and PostgreSQL.
- **Passed:** TypeScript, ESLint and `git diff --check`.
- **Passed:** Host standalone production build using Next's supported Webpack builder. Host Turbopack's worker port was blocked by the environment; Docker's Turbopack compilation passed.
- **Passed:** Local migration preservation and HTTP health/live, readiness and login responses, all 200.
- **Passed:** Final Docker image build, Compose validation, all nine migrations, runtime grants, synthetic bootstrap and live/readiness/login responses (200). Runtime UID 1000, private documents mode 0700, and no owner/bootstrap secrets in the app environment were verified. The disposable QA project and volumes were removed.

No existing tests were disabled. Fixtures for historical payroll explicitly keep the legacy cutover; assertions were updated where the new request changes staff commission entry, non-disclosing 404s and authorized HR financial approval. One resource-contention database setup timeout was rerun successfully. The existing pg concurrent-query deprecation warnings remain nonfatal and unrelated to new behavior.

## 15. Outstanding assumptions or unresolved issues

- **Passed / confirmed:** Calendar-day hire/leaver proration and paid leave/holiday coverage are retained; unpaid leave contributes no regular coverage.
- **Passed / documented:** Weekly review waits for closed workweeks. A month crossing an open week closes after that week ends.
- **Passed / documented:** Payment records represent staff-recorded payment evidence, not an actual transfer.
- **Not Tested:** Real email provider delivery and external HTTPS reverse-proxy behavior. Production email changes remain unavailable until the documented trusted adapter is configured.
- **Passed:** VS Code local startup and Brave login-page smoke check. **Not Tested:** exhaustive manual interaction with every form; authenticated workflow coverage is automated.

## 16. Backward-compatibility concerns — Passed with documented cutover

Existing finalized salaries, attendance provenance, compensation versions and audit evidence are preserved. Existing salary periods keep their legacy method; the stored organization effective month governs newly created attendance-method periods. Historical overtime threshold policy is not overwritten merely to change defaults. Old compensation rows retain their original equivalents/multipliers and require an explicitly configured individual rate before new payable overtime can finalize.

Raw clients that formerly submitted employee-created commissions now receive read-only or generic not-found responses as required. Revoked feature access removes confidential projections immediately. Remembered identities using a different configured lifetime are invalidated if the lifetime setting changes. The single current application and additive migration must be released together using the existing owner/runtime separation; no database reset is needed.

## 17. Confirmation that the live VPS was not modified — Passed

No Hostinger VPS was accessed or modified. No production DNS, firewall, reverse proxy, credentials or deployment was changed. All database writes, builds, backups, tests and runtime checks targeted local synthetic environments. This change request stops at local implementation and verification.

## Currency configuration

The default organization currency is BDT. Payroll, compensation, overtime rates, weekly earnings, adjustments, commissions, dashboards and report previews format exact decimal strings with ৳ and Bangladesh grouping. CSV exports keep precise numeric strings and an explicit recorded currency column. Finalized statements use their captured period currency.

Only Admin can change the organization default. Changes require closed monthly/weekly payroll, no unsettled commission claims and ended compensation terms; service checks and PostgreSQL guards enforce the same boundary. The change never converts or rewrites amounts. Weekly/monthly aggregation and corrections reject mixed currencies.

Validation: exact rounding and amounts beyond floating point precision; Admin/HR permission checks; SQL guard bypass attempts; preserved finalized BDT report/export after a prospective USD default change. Historical timezone protections remain intact. Bootstrap and the overtime-policy form use a 48-hour default.
