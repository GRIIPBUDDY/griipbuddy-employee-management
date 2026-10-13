# EMPLOYEE MANAGEMENT SYSTEM — MASTER OVERHAUL & LOCAL QA REPORT

Prepared 13 October 2026 on branch `claude/employee-management-overhaul-b14b69` (git worktree). **Local only.** Production was not accessed. Changes are uncommitted in the worktree for your review.

Legend: **PASSED** · **FAILED** · **NOT TESTED** · **BLOCKED**. Automated results and real-browser (Brave) results are reported separately.

---

## 1. Project state before changes

- Branch clean at `f8ec017` ("Fix schedule conflict handling and preserve recurring drafts"). Earlier commits had already fixed the service-level causes of Bug A (unmapped `P2039` exclusion error → generic message; weekday/period desync) and Bug B (rejection submitting positive approved seconds). Both were **re-verified, not assumed**.
- Baseline with the project's Node 24 runtime (`.local/tooling` in the main checkout): typecheck **PASSED**, lint **PASSED**, unit **96/96 PASSED**, PostgreSQL integration **228/228 PASSED**, production build **PASSED**. No pre-existing failures.
- Reproduced before changing anything (Brave, synthetic data):
  - **Bug C (confirmed):** date filters used *exclusive* "Until" dates (picking the same start and end date produced a 400 → **404 page**); the per-employee attendance page **ignored its date parameters entirely** (always showed today); attendance lists emitted a row for **every date in range**, including rest days and employees with no schedule.
  - **My tasks defaulted to tasks assigned *today* only** — an older overdue task was invisible to the employee.
  - Raw UTC ISO timestamps in shift-swap pickers, notifications, payments and records; raw ID text boxes for salary corrections; no confirmation before suspending an account; payment time parsed with `new Date(text)` (server timezone; malformed input → generic error); missing favicon caused a 404 on every page.
  - UI: basic, oversized repetitive forms (the schedule form rendered 12+ five-field fieldsets), inconsistent links/headings.

## 2. Modules and pages inspected

All 59 pages, 63 API routes, 70 feature/service modules, the Prisma schema (35 models) and 10 migrations, auth/session (Auth.js JWT, remember-me, session-version revocation), authorization policy, attendance/schedule/occurrence services, overtime, weekly/monthly pay engine, commissions/rechecks, tasks, leave, performance, warnings, assets, documents, notifications, audit, reports, settings, Docker/Compose files and the existing test suites. Feature inventory matched the requested scope; no navigation was created for nonexistent features.

## 3. Design system changes

Single token set in `src/app/globals.css` (restrained indigo primary, neutral slate surfaces, semantic success/warning/danger/info pairs always shown with text labels), consistent type scale, card/table/field density, focus rings, reduced-motion support. New/updated shared primitives in `src/components/ui/`:
`page-header` (title, description, breadcrumbs, actions), `card` (header actions), `field` (`Field`, `SelectField`, `TextAreaField`, `CheckboxField`, `FormSection`, `FieldGrid`), `input`, `button` (hierarchy: primary/outline/secondary/ghost/destructive/link), `status-badge` (tone map + readable labels), `table` (overflow-owning container), `pagination` (filter-preserving), `filter-bar` (URL-based GET filters), `date-range-filter`, `dialog` (modal/sheet progressive disclosure; closes only on server-confirmed success), `row-actions`, `tabs` (segmented in-page tabs + route `TabNav`), `stat`/`metric`, `alert`, `description-list`/`avatar`, `skeleton`, `empty-state`, `toasts`, `confirm-dialog`, `action-form` (pending state, duplicate-submit guard, inline errors, value restoration, compact inline mode).

## 4. Pages redesigned

Every page. Shell: white grouped sidebar (Overview · People · Workforce · Compensation · HR records · Insights · collapsible My workspace for staff; employees get My work · My pay · My records), active indicator, page search, header breadcrumbs, notification dropdown (loads own unread items from the existing scoped API), profile menu, mobile drawer, on-hold banner, favicon.
Highlights: management dashboard (KPIs, needs-attention queues, recent audit activity, quick actions); employee dashboard (today + check-in, this week, earnings, tasks, notifications, leave, salary, commission card only when permitted); employee directory table with row actions and account-status column; employee profile with shared identity header + section tabs (Overview/Schedule/Attendance/Compensation/Edit); grouped create/edit forms; **schedule editor rebuilt as a weekday-row grid** (default 4h/4h/4h pattern buttons, per-day periods, +1-day toggle, live weekly hours/validation) with a single primary action — *Publish schedule* or *Change schedule* — and a versions table; attendance review, corrections, overtime, leave as tables with review dialogs; tasks (multi-employee picker, filters, per-employee completion); weekly earnings, salary months with a status stepper and payment dialog, adjustments, commissions and rechecks; performance, warnings, assets; reports hub + report tables; audit log with person/employee selectors; notifications; settings; user accounts; account settings; split-screen sign-in, password and email-verification pages; designed 403/404/error states.

## 5. Functional bugs found

| # | Defect | Status |
|---|---|---|
| C1 | Exclusive "Until" dates; same-day range → 404 page | Fixed |
| C2 | Per-employee attendance page dropped `from/until` (always today) | Fixed |
| C3 | Attendance lists/reports emitted rows for unscheduled, unworked dates | Fixed (Active-days option, default in UI) |
| D1 | Employee task list hid older open/overdue tasks | Fixed |
| D2 | Payment time parsed in server timezone; bad input → generic error | Fixed |
| D3 | Dialog reused across re-render: after publishing, the publish dialog became an open "Change schedule" dialog | Found in Brave E2E; fixed |
| D4 | Account suspension/status change without confirmation | Fixed (confirmed dialog + explanation) |
| D5 | Raw UTC ISO times / raw UUID inputs (swaps, payments, notifications, audit filters, weekly correction target month) | Fixed (org-local times, selects) |
| D6 | Cryptic stale-weekly-statement message | Reworded (actionable) |
| D7 | Missing favicon → 404 on every page | Fixed |
| D8 | Mobile horizontal overflow (screen-reader-only labels escaped table scroll containers; header actions couldn't wrap) | Fixed |
| D9 | Selects styled as read-only (CSS `:read-only` matches `<select>`) | Fixed |

## 6. Root causes and fixes

- **C1–C3:** UI and services had no shared date semantics. Added `src/lib/utils/date-range.ts` (`today | date | week | month | custom | all`, inclusive `to`, legacy `until` still accepted, 31-day cap, explicit errors). Services (`review/data.ts`, `time/data.ts`, `insights/reports.ts`, `tasks/service.ts`) resolve ranges through it; invalid ranges still raise `400 DATE_RANGE` (existing contract) and pages now show an inline alert instead of a 404. `days=ACTIVE` omits dates with no scheduled occurrence, attendance, open session, absence or pending correction — recurring definitions therefore cannot add unrelated dates. Service defaults are unchanged (existing tests confirm).
- **D1:** task list with no date parameters now covers all dates; employees default to *Open*; `OVERDUE` and search (title, description, employee) added. "Due/Completed" without dates means tasks that have that date (preserves existing test semantics).
- **D2:** `src/features/pay/payment-time.ts` interprets `datetime-local` as organization wall time (explicit ISO offsets still accepted) with a specific validation message.
- **D3:** `ActionForm` now signals success to its dialog as soon as the server confirms, before the revalidated page commits; schedule dialogs are keyed.
- Pre-existing behaviour preserved: no schema change, no migration, no dependency change other than the Playwright dev dependency.

## 7. Schedule publishing results (Bug A)

| Check | Automated | Brave (real UI) |
|---|---|---|
| Mon–Sat, 08:00–12:00 + 16:00–20:00, reason "Weekly Work Hour", 12 periods/48h | PASSED (existing + new integration) | **PASSED** |
| Sunday checked → 14 periods/56h; unchecked → Sunday periods removed, 12/48h, DB has no Sunday slots | PASSED | **PASSED** |
| Repeat publication → "existing assignment covers these dates", 0 new rows | PASSED | **PASSED** (DB count stays 1) |
| Atomic rollback on audit failure; concurrent duplicates → one assignment | PASSED (existing integration) | NOT TESTED in browser |
| Change current schedule from tomorrow (new editor field names), history kept | PASSED (new integration) | **PASSED** (2 versions, contiguous) |

Root cause recap: an overlapping create hit the database exclusion constraint whose adapter error code was unmapped (fixed earlier); the remaining UX trap — the create form being the obvious path for an employee who already has a schedule — is resolved by making *Change schedule* the primary action.

## 8. Overtime rejection results (Bug B)

Brave, HR account: queue → Review → **Reject** (amount fields hidden, zero approved) → reason → confirm. **PASSED**: toast; status *Rejected* persists after reload; review button gone; DB `REJECTED`, `approved_seconds=0`, reason stored; exactly one `OVERTIME_REJECTED` audit; one `OVERTIME_DECIDED` notification; attendance session count unchanged; employee sees "Overtime rejected" and the reason. Weekly earnings: rejected employee's approved overtime **৳0.00**; approved employee's overtime = approved seconds × individual rate (11h × ৳150 = ৳1,650.00). Duplicate/stale/concurrent decisions, finalized-snapshot protection and rollback: existing integration suite **PASSED**.

Note: potential overtime in the seed is 11h, not 6h, because the existing approved policy counts the weekly-threshold tail **plus** time worked outside scheduled periods. This is the established engine behaviour; it was not changed.

## 9. Attendance-filter verification (Bug C)

Automated (new `tests/integration/overhaul.test.ts`): single date, inclusive range, default today, Active-days exclusion of Sunday, employee without schedule (0 vs 7 rows), reversed/oversized ranges → `DATE_RANGE`, per-employee/own history, own summary, report — **PASSED**.
Brave: specific date shows only that date; Saturday–Monday range excludes the unscheduled Sunday and includes it only with "Every date in range"; reversed range shows an inline explanation; per-employee week shows 12 sessions and an unscheduled Sunday shows none; report filtered to one date — **PASSED**. Bulk task assignment dates do not appear in attendance (tasks are a separate filter) — PASSED (integration).

## 10. Employee feature-permission testing (commission confidentiality)

| Check | Result |
|---|---|
| Non-eligible employee: 12 portal pages scanned — visible text **and raw HTML/RSC payload** contain no "commission"/"pre-order" (production build) | **PASSED** (Brave) |
| Direct `/me/commissions` → generic 404; `/api/me/commissions` → 404 with no feature wording | **PASSED** (Brave). Only residue: the router echoes the URL segments the user typed, identical to any nonexistent path |
| Eligible employee sees only own records; foreign IDs → 404 | **PASSED** (Brave) |
| HR without grant: no nav item, `/manage/commissions` → 403 | **PASSED** (Brave) |
| Admin approves pre-order; employee requests recheck; staff resolve (audited, amount unchanged) | **PASSED** (Brave) |
| Revocation, notifications, timeline, salary/report projection, CSV | PASSED (existing integration + HTTP suites) |

## 11. Salary and commission test results

- Weekly calculation, review, finalization (not payment) — **PASSED** (Brave). Salary month create + roster calculation + statement in ৳ — **PASSED** (Brave).
- Fixed and percentage commission, half-up rounding, Decimal arithmetic, reconciliation, no double counting, finalized immutability, payment recording — existing integration **PASSED**.
- Monthly **finalize → record payment** in the browser — **NOT TESTED** (the local month cannot close without finalizing every employee's weekly statements; covered by integration `weekly snapshots … record payment separately`). Payment time parsing — unit **PASSED**.

## 12. Task assignment and recurring schedule results

Bulk assignment to 3 employees creates 3 rows; one employee completes with a note; the other two stay *Assigned*; a colleague's API attempt on a foreign task → 404 and the row is unchanged — **PASSED** (Brave). Older overdue task visible by default — **PASSED** (Brave). Recurring schedules, one-day overrides, future changes, cancellation, overnight periods — existing integration **PASSED**; future change via new editor — **PASSED** (Brave + integration).

## 13. Authentication and account-status results

| Check | Result |
|---|---|
| Wrong password: generic message | **PASSED** (Brave) |
| Normal session ≈12h; *Remember me* ≈30 days; HttpOnly; sign-out clears access | **PASSED** (Brave) |
| Suspended account cannot sign in | **PASSED** (Brave) |
| On hold: banner, no check-in or task actions, personal records readable | **PASSED** (Brave) |
| Admin: Active → On hold → Suspended (sign-in blocked) → Active, 3 audits | **PASSED** (Brave) |
| Admin email change: wrong password rejected; verified change; sign-in with new email; admin role kept; changed back | **PASSED** (Brave, **development mode**). Production builds refuse the dev preview by design → skipped there |
| First sign-in temporary-password change | **PASSED** (Brave) |
| HR cannot suspend administrators; last-admin protection; session revocation | PASSED (existing integration) |

## 14. Security and data-isolation results

Server-side authorization unchanged and re-verified by the suites; employee-ID manipulation returns generic 404s (tasks, documents, notifications, commissions — Brave); private document downloaded only by its owner, colleague → 404, signed-out → redirect (Brave). New server code exports no additional server actions (the payment parser was deliberately kept out of the `"use server"` module). The QA launcher deletes any inherited `DATABASE_URL`/`POSTGRES_*`/bootstrap variables and builds only loopback URLs. Secrets and generated credentials live only in ignored `.local/qa/`.

## 15. Automated test summary

| Suite | Result |
|---|---|
| Unit (Vitest) | **104/104 PASSED** (96 existing + 8 new) |
| PostgreSQL integration incl. migrations, authorization, concurrency | **236/236 PASSED** (228 existing + 8 new) |
| HTTP acceptance (standalone production server, real Auth.js cookies) | **331/331 PASSED** |
| Browser E2E in Brave (Playwright 1.63, production build, fresh DB, single pass) | **23 PASSED, 1 SKIPPED** (email change; passed separately in dev mode) |

During development three existing integration tests failed after my changes (document-report and task default-date semantics); the code — not the tests — was corrected and they pass.

## 16. Type-check, lint and production build

`npm run typecheck` **PASSED** · `npm run lint` **PASSED** · `npm run build` **PASSED**.

## 17. Database / migration results

No schema or migration changes. All 10 migrations applied cleanly to fresh disposable databases (every integration run and each QA reset); migration-preservation tests **PASSED**. Docker Compose: base, dev, tools, release and Hostinger configurations **validate** (`docker compose config`, placeholder env only). Docker image build **BLOCKED**: no Docker daemon on this Mac (CLI plugin only).

## 18. Brave browser testing results

Brave 154 (`/Applications/Brave Browser.app`) driven by Playwright through the real UI against `http://127.0.0.1:3030`: every Admin, HR and employee navigation section rendered with an h1 and **zero console errors**; the workflows in §7–13 passed. Screenshots of every page at desktop and mobile were reviewed and drove fixes D3, D8, D9 and layout tweaks (stored in `.local/screens/`, `.local/e2e/`). The app was then opened in your regular Brave window (`open -a "Brave Browser"`); that window itself was not screenshot-verified.

## 19. Responsive-layout testing

390×844: more than 20 pages measured — no horizontal page scroll after fixes (tables scroll inside their containers); mobile navigation drawer opens/closes on navigation — **PASSED** (Brave). Keyboard: skip link, focus rings, labelled controls, roving tab keys, native modal focus/Escape. A formal accessibility audit (axe/screen reader) — **NOT TESTED**.

## 20. Remaining failures and blocked or untested checks

- **BLOCKED:** Docker image build (no daemon). **NOT TESTED in browser** (covered by integration only): shift-swap request/consent/approval, performance/warning create→finalize→acknowledge, asset assign/return, attendance-correction submission/decision, unscheduled-day work, cross-midnight checkout, 10 vs 11 minutes early check-in (integration uses a controlled clock), monthly finalization and payment recording, CSV download contents.
- Email verification in production requires `EMAIL_DELIVERY_URL`/`TOKEN`; without it the feature is correctly refused.
- `pg` concurrent-query deprecation warnings during integration tests (pre-existing, harmless).
- The system is not claimed bug-free; it is not declared production-ready by this task.

## 21. Files changed

125 modified + 26 new files (≈2,300 lines added). Services: `features/review/{data,validation}.ts`, `features/time/{data,validation}.ts`, `features/insights/{reports,validation,dashboard}.ts`, `features/tasks/service.ts`, `features/pay/{actions,weekly}.ts`, new `features/pay/payment-time.ts`, read-only field additions in `features/people/data.ts` and `features/accounts/service.ts`, new `lib/utils/{date-range,query}.ts`. UI: all files under `src/app` and `src/components` (see `git status`). Tests/tooling: `tests/unit/date-range.test.ts`, `tests/integration/overhaul.test.ts`, `tests/e2e/*`, `playwright.config.ts`, `scripts/local-qa.ts`, `package.json` (`qa:local`, `test:e2e`, `@playwright/test@1.63.0` dev dependency) and `package-lock.json`.

## 22. Local environment instructions

- URL: **http://127.0.0.1:3030/login** (loopback only). Database: embedded PostgreSQL on `127.0.0.1:54339`, separate from your existing `.local/development` database (untouched).
- Running now in the Terminal tab **"Local QA server"**. Stop: **Ctrl+C** in that tab (stops app and database, keeps data).
- Restart (production build): `./.local/start-qa.sh` · development mode (on-screen email verification links): `./.local/start-qa.sh --mode=dev` · fresh synthetic data: `./.local/start-qa.sh --reset` (deletes only `.local/qa/data` and `.local/qa/documents`). After code changes run `npm run build` before production mode.
- Commands used: `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`, `npm run build`, `npm run test:http`, `npm run qa:local -- --reset --mode=prod`, `E2E_PROD=1 npx playwright test` (all with the project's Node 24 on `PATH`).
- Data location: `.local/qa/` (git-ignored): `data/` database, `documents/` private files, `config.json` local secrets, `startup.log`.

## 23. Local test-account setup

Synthetic accounts are listed in **`.local/qa/accounts.json`** (one generated password shared by all, regenerated on every `--reset`; not repeated here). Accounts: `admin`, `hr` (HR/Manager without commission grant), `commission` (employee with pre-order access), `employee` (no commission access), `colleague`, `onhold`, `suspended`, `schedule` — all `@qa.example.test`. The E2E run also left synthetic "E2E …" employees and decisions (rejected/approved overtime, finalized week, tasks) for exploration; reset for a clean set.

## 24. Production confirmation

No SSH, VPS, Hostinger, DNS, SSL, firewall, reverse-proxy or production-database access occurred. No production credentials were used. All databases were embedded loopback instances created for this task. No real employee data was used.

## 25. Recommended next action

Review the diff and walk through the running app in Brave (sign in as `admin`, then `employee` and `commission`). If accepted, commit the worktree branch and open a pull request; then, under a separate production authorization, follow `DEPLOYMENT.md` (fresh verified backup, image build on a host with Docker, isolated acceptance, data-preserving cutover). No migration is required for this change set.
