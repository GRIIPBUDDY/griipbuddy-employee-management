# Phase 3E development report

**Status: complete — Salary, Compensation & Pre-order Commission.** This phase extends the frozen architecture and Phases 3A–3D and stops before Phase 3F. Verification used isolated PostgreSQL databases, local Docker containers and synthetic employees. No production VPS or real employee records were accessed.

1. **Features implemented**

   Staff compensation management supports Monthly, Hourly and Daily pay, inclusive effective starts/exclusive ends, organization currency and agreed overtime equivalents/multipliers. Replacing terms preserves the old version and unaffected ranges. Employees can read their own history but cannot edit it.

   Salary management creates calendar-month periods, calculates the complete roster, displays draft estimates and advances through Draft → Calculated → Under Review → Approved → Finalized. Statements separate base, regular quantities, approved overtime, commissions, bonuses/allowances, deductions and signed adjustments. Recorded daily inputs and authorized source links explain each result. Departed and zero-pay employees, plus employees with assigned earned claims/corrections, remain in the appropriate roster.

   Reviewed adjustments, fixed/percentage pre-orders, commission review/assignment, employee claim submission/withdrawal, own finalized salary history and later reconciliation are operational. Existing profile, document, schedule, attendance, correction, overtime, account and notification flows remain available. Navigation and labelled forms follow the existing shell and use employee selectors rather than editable UUID fields.

2. **Database and migration changes**

   Additive migration `202610100006_pay` adds `compensation_rates`, `salary_periods`, `salary_calculations`, `salary_adjustments` and `preorders`: **22 domain tables** plus Prisma metadata. Migrations 001–005 remain unchanged. Prisma retains scalar foreign-key fields; reviewed SQL supplies relationships, exclusions, ownership checks, indexes and triggers. There is no separate commission table, salary-line-item table, attendance copy or summary cache. Each calculation retains a structured input/breakdown snapshot.

   Guards enforce compensation non-overlap/employment coverage, exact calendar months, unique employee/period calculations, exact component sums, source ownership, normalized company-wide order uniqueness, commission arithmetic, one unsettled reconciliation per original, no hard deletion and immutable final results/included sources. Rehire resets commission eligibility, revokes old sessions and retains prior grant history.

   Relevant official source changes increment unfinished input revisions and reset review/approval. Dependencies include intersecting workweeks, adjacent months, the full target interval of pending long-session VOID corrections and later periods with unsettled historical corrections. Final records remain fixed. SQL audit hooks receive the actor through the established mutation boundary.

   Runtime receives SELECT/INSERT/UPDATE on **21 mutable tables**, SELECT/INSERT on audits, and no DELETE, audit UPDATE, schema CREATE or migration-history access. A populated Phase 3D upgrade preserves approved overtime, leave, holidays and notifications; earlier populated upgrade tests still pass. Architecture documents/revisions remain unchanged. No dependency was added. The previous report is retained as `DEVELOPMENT_REPORT_PHASE_3D.md`.

3. **Salary formulas and assumptions used**

   Frozen V1 uses exact organization-local calendar months with derived month labels. Rates and employment use inclusive/exclusive boundaries. Every intersecting workweek must finish before closeout, potentially delaying finalization by six days. Salary consumes authoritative Phase 3D facts and active approvals without a second attendance/overtime engine.

   | Component | Applied rule |
   |---|---|
   | Monthly base | Sum effective monthly rate × covered calendar days / calendar days in the month. No automatic attendance deduction. |
   | Hourly base | Effective hourly rate × (completed actual seconds − valid approved overtime seconds + eligible paid-absence seconds) / 3600. Rejected excess time remains ordinary worked time. |
   | Daily base | Effective daily rate × (regular scheduled coverage + eligible paid absence) / scheduled seconds on that date, capped at one unit per date. Split periods share a denominator. |
   | Paid absence | Union approved paid leave and normal-holiday scheduled portions, less unpaid leave and all actual work, including overtime. Required holiday work earns no automatic holiday credit. |
   | Overtime | Active approved chronological tail seconds × effective hourly base or agreed equivalent × multiplier / 3600, split at local date/rate/month boundaries. |
   | Final amount | Base + approved overtime + commission + bonuses/allowances + signed Other/Correction − deductions. |

   Arithmetic uses **Decimal precision 40**, half-up rounding and rates with up to four decimal places. Each component rounds once to two decimals; final total sums rounded components. Per-day displayed contributions use four decimals as explanatory values. Snapshots retain formula/rounding versions, effective rates, employment, sessions, schedules, absence facts, weekly review inputs/decisions, daily quantities, claims and adjustments.

   Hourly terms derive their overtime base from their hourly rate. Monthly/Daily terms require an explicitly agreed hourly equivalent when approved overtime exists. The configurable multiplier defaults to 1 and represents a company agreement. Missing terms/equivalents block closeout. Daily unscheduled work requires an approved Other adjustment explicitly reviewing that month's unscheduled work; its amount is added separately and no denominator is guessed. Negative final salary blocks review/approval. No automatic lateness/absence/leave deductions, tax rules or debt carry-forward are invented.

4. **Commission rules and permission enforcement**

   Fixed commission is the recorded fixed amount; percentage commission is eligible order value × recorded percentage / 100. Both round half-up to two decimals on the server. Own submissions supply reference, applicable order value and evidence; identity, order instant, rule and calculated commission derive from trusted sources. Database order time retains milliseconds after mutation locks, avoiding same-second grant truncation errors.

   The existing combined employee flag controls own access and earning eligibility. The independent HR management grant controls staff access. Admin publishes the rule for new own claims; old claims retain their historical rule. Staff backfill requires an explicit historical rule, employment coverage and a retained eligibility grant valid at the order instant. Current eligibility alone is insufficient. Rehire requires a fresh grant.

   References are normalized and unique company-wide, including cancelled claims. Pending claims are approved/rejected by authorized staff, assigned to an open month, and become Included only at finalization. Employees may withdraw their own pending claims to Cancelled. Editing an unincluded claim resets approval. Unresolved unassigned earned claims block relevant unpaid months unless explicitly deferred to a later open month. HR cannot review their own claims.

   Every service, direct URL/API, timeline and notification source rechecks current permissions and ownership. Disabled employees receive no commission navigation or page/API access. If a finalized snapshot contains any commission source or related correction, revoked own access receives only month/currency/final total; breakdowns, sources, raw snapshots and restriction markers are suppressed, even for zero-value sources. HR without management access receives the permitted aggregate. Earned money is preserved.

5. **Finalization and audit behavior**

   HR/Admin prepares and reviews; **only Admin approves and finalizes**. Calculation captures facts under existing global/stable-user locks, performs arithmetic outside the lock, then reacquires it and verifies revision, complete roster and live authority before storing results. Recalculation reuses the unique employee/month row.

   Closeout verifies finished boundary weeks, current complete rates, active overtime decisions, approved assigned claims/adjustments, current reconciliation facts, absence of pending corrections/leave/source conflicts and nonnegative totals. Finalization claims approved sources and fixes all statements/periods atomically with finalizer/time, explicit inclusion audits, salary audits, source-linked timeline and safe notifications. Conflicts roll back the transaction. SQL prohibits silently changing final records or included sources.

   Bonus, Allowance, Deduction and signed Other proposals require review. Allowance maps to the bonus component. Editing an unincluded proposal resets approval. Correction amounts come only from server reconciliation and cannot be manually edited. HR cannot approve their own proposal. Ordinary employee breakdowns remove internal adjustment reasons.

   Later correction computes **desired corrected original total − original final total − already finalized signed corrections** in a later open month. One unsettled reconciliation is allowed per original. Historical source changes reset its approval and target-month review; refresh/reject resolves it. Approval/finalization reverify facts and remaining delta. Verified commission refunds use classified corrections while retaining original included claims. Original salaries are never reopened or overwritten.

   Existing append-only audits record compensation, settings/grants, periods, calculations, review/approval/finalization, adjustment proposals/changes/decisions/inclusion, pre-order creation/change/decisions/inclusion and reconciliation, with actor, record, timestamp and relevant before/after values. Passwords and authentication secrets are excluded.

6. **Security and authorization tests**

   Tests reject guests, employee management writes, foreign employee/statement/pre-order IDs, overposted actor/status/amount/time fields, invalid decimals, foreign origins and revoked/inactive sessions. Production HTTP checks use real Auth.js credentials, CSRF and encrypted cookies. Strict bounded API bodies, private/no-store responses and live service authorization supplement UI visibility.

   Coverage includes own compensation without writes, hidden drafts, own finalized history, independent HR commission management, HR self-review denial, Admin-only final approval, revoked-feature aggregate projections, zero-value restriction classification, source-linked history/alert privacy and historical eligibility. Database tests cover immutable final/source claims, exclusions/ownership, retained snapshots, duplicate references, append-only audit privileges and rehire reset.

7. **Other tests and actual results**

   | Check | Actual result |
   |---|---|
   | Prisma generation / TypeScript / final ESLint | Passed |
   | Unit tests | **54 passed**: 37 retained plus 17 pay cases |
   | PostgreSQL integration | **130 passed** across six files: 98 retained, 31 pay and one populated Phase 3D upgrade |
   | Final production HTTP regression | **186 checks passed**: 138 retained plus 48 pay |
   | Final native production build | Passed with `--webpack` |
   | Final Docker production build | Passed with default Turbopack |
   | Full / runtime dependency audits | **0 reported vulnerabilities** in both |
   | Docker six migrations / grants / bootstrap | Passed against a fresh disposable database |
   | Docker HTTP fixture preparation | **16 checks passed** |
   | Docker verification of browser-finalized records | **13 checks passed** |
   | Docker persistence after DB restart/final-image app recreation | **13 checks passed** |
   | Runtime / image hygiene | **13 checks passed**: UID 1000, read-only root, restricted capabilities, bounded writable temp, private 0700 storage, loopback app/unexposed DB, runtime role/new grants, no owner/bootstrap environment or packaged local/env/test files |
   | Browser staff workflow | Claim approval, bonus creation/review, recalculation, review, Admin approval and finalization passed |
   | Browser employee workflow | Own finalized list/breakdown, current claim submission and withdrawal passed |
   | Browser narrow layout | Own salary and pre-orders passed at **390px**; staff salary breakdown passed at **615px**; document width equals viewport |

   All **22 requested automated acceptance categories** are covered. Extra cases verify no double-paid overtime/absence, rounding, missing rules, complete roster insertion, neighboring-month dependencies, long-session pending VOID invalidation, stale overtime exclusion, explicit daily unscheduled-work review, negative-pay blocking, editing approved deductions, historical grants, rehire reset, final commission refunds and prevention of repeated finalized reconciliation deltas.

   The browser month finalized **BDT 15,600** for a monthly employee: base 15,000 + commission 100 + bonus 500. An hourly employee retained **BDT 300** for three regular hours at 100/hour. Both totals, source inclusion, foreign-record denial and immutability survived restart/recreation. Synthetic screenshots: `.local/phase3e-salary.jpg` and `.local/phase3e-my-salary.jpg`. Logs remain in ignored `.local/phase3e-*`. Native webpack and Docker default Turbopack passed; earlier native compiler-port restrictions do not affect the successful container build.

8. **Known limitations or unresolved business-rule decisions**

   V1 supports calendar months, derived labels and one organization currency. Custom cycles, conversion, commission tiers, e-commerce validation and automated pay jobs are absent. Staff must verify order evidence, agree terms/equivalents and review unscheduled daily work. Missing required rules or conflicting facts block closeout rather than being guessed.

   Calculation/weekly review refresh is explicit. Historical corrections use later reconciliation; negative results do not create debt. No advanced financial charts, audit viewer, payslip export or legal/tax policy is added. Lists paginate 25, rate history caps at 100, employee/grant pickers at 200, and recent month choices at 25/100 depending on the form. Selected period rosters are complete.

   Existing private-document backup/restore, orphan cleanup, deployment ingress and resource benchmarking remain deferred. Disposable QA containers/volumes/networks and generated credential configuration were removed after verification. Ignored toolchains, caches, logs and screenshots remain for development. No production deployment or production data migration occurred.

9. **Tax, accounting and payment boundary**

   **No tax calculations/filing, accounting ledger, bank transfer, payment processing, general incentive engine, e-commerce integration, automatic lateness/absence deductions or production VPS deployment was implemented.** Finalization records approved compensation and does not disburse money.

10. **Recommended next phase**

   Await the user's explicit **Phase 3F** specification and implement its stated scope against the existing frozen architecture and tested source model. Phase 3F has not been started automatically.
