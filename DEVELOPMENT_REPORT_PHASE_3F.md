# Phase 3F development report

**Status: complete — Leave, Performance, Warnings & Assets.** This phase extends the frozen architecture and completed Phases 3A–3E. Verification uses isolated PostgreSQL databases, local Docker containers and synthetic employees. Phase 3G is not started.

1. **Features implemented**

   Categorized leave requests, date-based submission, staff filters and approval/rejection, pending withdrawal, explained approval cancellation and prior decision history are implemented. Existing partial-day leave remains supported.

   Lightweight performance drafts, edits, finalization, employee release and explained official corrections are operational. Official notice drafts, publication, severity/date filters, private attachments, receipt acknowledgement, correction and revocation are implemented. Company inventory, issue/return forms, employee assignment history and outstanding offboarding returns are available.

   New management and own pages use the existing shell, fields, cards, pending/error/success states and 25-row pagination. Employee selectors and employment-period options avoid manual UUID entry. Existing account, people, private-document, time, review, pay and commission modules are retained.

2. **Database and migration changes**

   Additive migration `202610100007_people_operations` adds `performance_reviews`, `disciplinary_records`, `assets` and `asset_assignments`, and adds category/optional operation-key fields to `leave_requests`. The schema has **26 domain tables**, plus Prisma metadata. Migrations 001–006 are retained. Existing leave gets Other category and a null operation key without changing intervals, paid treatment or decisions.

   SQL supplies same-employee employment/document foreign keys, rating/date/status constraints, normalized unique asset codes, employee-scoped leave operation uniqueness, one outstanding assignment per asset, immutable ownership/issue facts and revision checks. Official review/warning changes require an explicit correction context. Warning corrections clear current receipt; original publication identities remain fixed. Returned assignment history and official records cannot be deleted. Duplicate leave protection applies to new inserts without making legacy duplicate proposals fail the upgrade.

   Runtime gets SELECT/INSERT/UPDATE on **25 mutable domain tables**, SELECT/INSERT on audits, and no DELETE, audit UPDATE, schema CREATE or migration-history access. The populated Phase 3E upgrade test retains finalized salary amounts/snapshots, compensation rates, existing leave and audit evidence; prior populated upgrade tests still pass. No new dependency, architecture revision, summary table, audit engine or notification service was added. The previous report is retained in `DEVELOPMENT_REPORT_PHASE_3E.md`.

3. **Leave workflow and attendance integration**

   Annual, Sick, Personal, Emergency, Unpaid and Other categories are separate from Paid/Unpaid treatment. Unpaid category requires Unpaid treatment. Employee dates include the last day and convert through the organization timezone to the existing exact interval representation. Same-key identical retries return the existing request; changed payload reuse and duplicate active exact intervals fail. Approval rejects conflicts with approved leave and rechecks employment coverage.

   Employees can submit/withdraw their own pending requests and read their own history. HR/Admin approves or rejects with an optional comment; HR self-review requires Admin. Cancellation requires an explanation. The UI shows submitted/review timestamps, reviewer, current response and prior review decisions from append-only audit evidence. Earlier review responses are retained when an approval is cancelled. Deactivation preserves history and revokes current session access.

   Approved leave uses the existing Phase 3D attendance sources, removing required scheduled portions without adding actual worked time or overtime. Existing weekly invalidation retains stale review evidence and requires refresh. Existing salary source hooks reset unfinished review and leave final statements fixed for later reconciliation. No leave balance, accrual or second attendance/overtime/pay calculation engine was introduced.

4. **Performance visibility rules**

   Draft fields include review dates, optional 1–5 overall and five dimension ratings, strengths, improvement areas, employee-facing comments and private staff notes. Finalization requires an overall rating and records the reviewer/time. Dates fit the selected employment period. Status derives from publication.

   HR/Admin manages company records. HR cannot publish/correct their own official review; Admin can, with audit. Employees see only their own finalized, explicitly released reviews. Staff notes are removed from own DTOs and never appear in employee timeline/notification text. Direct URLs/APIs apply the same checks. Publication withdrawal immediately suppresses source links and alerts.

   Corrections require the current revision and a reason. Audit retains prior content; reviewer and original publication time remain fixed. PostgreSQL rejects silent official edits.

5. **Disciplinary-record permissions**

   Notice, Warning, Serious warning and Final warning support issue date, reason, description, action, issuer, staff notes, optional existing private attachment and explicit release/receipt request. Company-wide Admin/HR People access follows the existing frozen model. HR self-publication/correction requires Admin; employees cannot create, edit, revoke or delete official notices.

   A document must belong to the same employee and cannot be their profile photo. Generic document release cannot bypass a linked draft/private/revoked warning: own document metadata, download, warning attachment links and document timeline events recheck current parent visibility. Own warning DTOs exclude staff notes and inaccessible attachment IDs.

   Only the subject may acknowledge a current released revision. The audit explicitly records `receiptOnly: true`; no acknowledgement means no assumed agreement. An explained official correction retains old text and receipt in audit and resets current acknowledgement. Revocation retains the record and hides own access. Safe timeline and in-app events resolve current permissions before displaying links.

6. **Asset assignment/return behavior**

   Inventory supports laptop, phone, camera, SIM, access card and Other; normalized unique code, name, serial, condition, private notes and Available/Retired/Lost state. Assigned display state derives from the outstanding assignment. Staff filters status/type/employee history and records audited inventory changes.

   HR/Admin issues an available asset to an active employee with employment covering the local issue date. Existing mutation locks plus the asset row lock and partial unique index prevent conflicting holders. Future issues, issues before a previous return and unavailable inventory fail. Return is one-time, cannot predate issue or be future-dated, and retains issue identity/actor/condition and return facts.

   Own history exposes only identification captured at issue plus dates and conditions. Private inventory/assignment/return notes, staff actors and later holders are omitted. Later inventory edits cannot rewrite the employee snapshot. Offboarding flags outstanding returns without recording an automatic return or removing historical assignments.

7. **Security and authorization test results**

   Automated tests cover all **25 requested acceptance categories**. Denials include employee management writes, own approval, HR self-publication, foreign URL/API/query IDs, client-selected own identity, invalid ratings/dates/attachments, private drafts/records/notes, stale edits/acknowledgements, inactive sessions, silent official changes, assignment conflicts and deletion/tampering. Retained HTTP checks cover real credentials/CSRF/cookies, origin protection, feature grants, password-change gate, account revocation, bounded uploads and private financial projections.

   Additional assertions cover generic-document parent privacy, inaccessible attachment suppression, receipt reset with old receipt evidence, live timeline/alert withdrawal, immutable inventory snapshots after relabeling/reissue, concurrent issue attempts, least-privilege grants and historical migration preservation. These tests exercise real non-owner PostgreSQL services and authenticated production handlers.

8. **Other tests and actual results**

   | Check | Actual result |
   |---|---|
   | Prisma generation / TypeScript / ESLint | Passed |
   | Unit tests | **54 passed**, retaining all prior cases |
   | PostgreSQL integration | **157 passed** across seven files: 130 retained, 26 People operations and one populated Phase 3E upgrade |
   | Production HTTP regression | **233 checks passed**: 186 retained plus 47 Phase 3F checks |
   | Native production build | Passed with webpack |
   | Docker production build | Passed with default Turbopack |
   | Dependency audit | **0 reported vulnerabilities** |
   | Fresh Docker migrations / runtime grants / bootstrap | Passed |
   | Docker browser-created record verification | **13 checks passed** |
   | Database restart + app recreation | **14 checks passed**; all compared domain/history/audit facts retained |
   | Runtime/image hygiene | **13 checks passed**: UID 1000, read-only root, restricted capabilities, private 0700 storage, loopback app/unexposed DB, runtime role/new-table grants, append-only audits and no owner/bootstrap environment or packaged local/env/test files |
   | Browser leave | Employee submission, HR approval without comment, explained cancellation and both previous decisions passed |
   | Browser performance | Draft creation, staff finalization and own released view without private notes passed |
   | Browser warnings | Publication, subject receipt, explained correction, receipt reset and new subject receipt passed; both receipts retained in audit |
   | Browser assets | Staff create/issue/return and own immutable return history without management notes passed |
   | Narrow employee layouts | Review, warning and asset views passed at **390px**; document width equals viewport |

   Browser verification used only synthetic records. The corrected notice and receipt remained visible after app recreation. Screenshots are `.local/phase3f-my-review.jpg`, `.local/phase3f-my-warning.jpg` and `.local/phase3f-my-assets.jpg`. Logs remain in ignored `.local/phase3f-*`. Native webpack and container Turbopack both passed; no production build blocker remains.

9. **Known limitations or unresolved business-rule decisions**

   There is no leave balance/accrual. Paid treatment is requested by the employee and reviewed by staff; staff can reject a misclassified request for resubmission. The UI creates full-day leave, while existing exact partial-day records/API compatibility remain available. Review/leave filter ends and performance period ends are exclusive; employee leave last date is inclusive.

   Official corrections preserve earlier versions in audit rather than adding a new version table or general audit viewer. Receipt is recorded by the subject, not impersonated by staff. All official warning edits reset receipt conservatively. Inventory assignments support one holder; shared assets are excluded. Incorrect completed assignments require an explained management process outside this simple issue/return model; completed issue facts have no silent editor.

   Lists paginate 25, management employee pickers cap at 200 and attachment choices at 100. Workweek and salary refresh remain explicit. Existing document backup/restore, orphan cleanup, deployment ingress and resource benchmarking remain for a later authorized phase. Disposable QA containers, volumes, networks and generated credential configuration were removed after verification. Ignored toolchains, caches, logs and synthetic screenshots remain for development.

10. **Confirmation of out-of-scope boundaries**

   No payroll redesign, salary/overtime formula changes, pre-order commission changes, recruitment, employee chat, biometric attendance, complex leave accrual, advanced performance analytics, email/SMS infrastructure, new RBAC engine or production VPS deployment was implemented. Existing source invalidation and calculation services are reused. No production records or operational secrets were used in verification.

11. **Recommended next phase**

   Await the user's explicit Phase 3G specification, then inspect its scope against the frozen architecture and completed modules. Phase 3G has not been started automatically.
