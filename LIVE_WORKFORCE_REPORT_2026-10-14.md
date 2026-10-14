# LIVE WORKFORCE MONITOR & ATTENDANCE EFFICIENCY REPORT

Local implementation and verification only, using synthetic records in disposable local databases. **Production was not accessed or modified**, and nothing was pushed or deployed.

| Area | Result |
|---|---|
| Root cause reproduced with synthetic data | PASSED |
| Live "Currently working" on Admin dashboard | PASSED |
| Attendance page: four separate areas | PASSED |
| Automatic and manual refresh, error handling | PASSED |
| Permissions and privacy | PASSED |
| Automated tests (unit, integration, HTTP, Brave E2E) | PASSED |
| Type check, lint, production build | PASSED |
| Production deployment | NOT TESTED (not requested; local only) |

## 1. Root cause of the missing live-working display — PASSED (reproduced)
The defect was a missing feature combined with a misleading card. No query was broken.
- **No list of who is working.** No service or page returned *who* is working. The dashboard only ran a count query over sessions that touched today's date.
- **Misleading card.** The "Working today" card showed *distinct employees with any session touching today*. That count includes people who already checked out. In the synthetic reproduction it showed **4** while only **3** were working. Open sessions appeared only as a number in the hint.
- **No refresh.** Nothing refreshed until a full page reload.
- **Ruled out:** caching, timezone handling and query errors were not the cause. The global `Cache-Control: private, no-store` header was already in place.
- **Reproduction test:** `tests/integration/live-workforce.test.ts` → "REPRODUCES the original defect". It asserts the old figures, then the fixed live list.

## 2. Root cause of the Attendance-section issue — PASSED (reproduced)
- **History only.** `/manage/attendance` was only a historical report for each date.
- **Open sessions looked like 0h.** Actual time counts completed sessions only. An employee working since 22:00 the night before therefore appeared as **0h actual**, with no "working" status. The history is also paginated 10 employees at a time, in alphabetical order.
- **No live area.** There was no section for sessions that are open right now.

## 3. Backend / query changes — PASSED
**`src/features/time/live.ts` (new): `liveWorkforce()` / `liveWorkforceData()`**
- **Source of truth:** valid attendance sessions with a check-in, no checkout and not voided, regardless of the date the session started. No second record of who is working is kept.
- **Queries:** three SQL statements regardless of headcount, plus the organization timezone and the server clock:
  1. Open sessions, joined to the employee, account status and department.
  2. Today's assigned periods (active schedules, current employment, holiday rule).
  3. Expected arrivals. An employee counts as "not yet checked in" when all of these hold:
     - the account is active;
     - their first period today has already started;
     - they have no session today;
     - they are not working now;
     - they are not on approved leave today.
- **Statuses**, computed on the server from server time (Asia/Dhaka):

  | Status | When |
  |---|---|
  | Working within schedule | Open session before its scheduled end |
  | Past scheduled end — checkout pending | Scheduled end passed earlier today |
  | Unscheduled session — review required | Unscheduled session open less than 12 hours |
  | Incomplete session — attention required | Scheduled end was before today began, or an unscheduled session has been open 12 hours or more |

- **Flags:**
  - more than one open session;
  - account on hold, suspended or inactive;
  - check-in time in the future.
- **Never automatic:** nothing closes a session, invents a checkout or labels time as overtime.
- **Duplicate sessions:** shown as **one row per employee** (the earliest session) with a flag. Summary figures count distinct employees, so the same person is never counted twice.
- **Access:** staff only (Admin, HR/Manager), enforced inside the service. A strict query schema allows only `search`, `departmentId` and `status`. Any other parameter (for example `employeeId` or a date) is rejected with 400.

**Other backend changes**
- **New endpoint** `GET /api/manage/live-workforce`. It returns `Cache-Control: private, no-store` and is read fresh on every request.
- **Dashboard:** `managementDashboard` includes the live data in the **same database snapshot** as the other cards and reuses its timezone and server time.
- **Unchanged:** schedule, attendance, overtime, salary and permission logic.

## 4. UI changes — PASSED
- **Admin dashboard**
  - New **Currently working** card, placed directly under the summary row.
  - Summary figures: Working now, Open sessions, Scheduled today, Not yet checked in, Need attention.
  - Filters: search by name or ID, department, status (including "Needs attention").
  - Live table columns: employee (links to the profile), status and flags, elapsed (ticks without a reload), session start (shows the date and "Started on an earlier day" when relevant), today's period, department, and a **View attendance** link to that session's day record.
  - The misleading "Working today" card is now **Checked in today**, with the hint "X completed · Y still open". The old "Missing checkouts" figure is replaced by the live "Need attention" figure.
- **Attendance page**, four separate areas:
  1. **Currently working** — the same live component.
  2. **Open sessions requiring attention**, with the reason and "Open since <date>". It notes that nothing is closed automatically and that a late checkout is not approved overtime.
  3. **Attendance history** — the existing report under its own heading, still governed by its date filters. Open sessions are now marked with a "Session open" badge.
  4. **Potential overtime awaiting review** — the pending queue, linking to Overtime review.
- **States:** a clear empty state ("Nobody is checked in right now"), a filtered-empty state, an error state that never shows zeros, a subtle live dot, the last-updated time and a refresh button with a spinner.
- **Design and mobile:** uses existing components (Card, Metric, StatusBadge, TableContainer, EmptyState, Alert, LiveElapsed). On phones, Status and Elapsed come right after the name.
- **Screenshots:** in the git-ignored `.local/e2e/live-screens/` folder, at desktop and mobile sizes.

## 5. Live refresh behaviour — PASSED
- **First render:** server data, so there is no loading flash and no initial zero.
- **Polling:** every **15 s** while the tab is visible. Polling stops while the tab is hidden and refreshes once immediately when it becomes visible again.
- **Other triggers:**
  - a manual **Refresh** button;
  - any server-confirmed save in the same window (the existing `workspace:saved` event), for example an admin correction.
- **One request at a time:** an in-flight guard prevents overlapping requests. Timers, listeners and requests are cleaned up when the component unmounts. The browser clock is not used for status; elapsed time ticks from the server's time.
- **On a failed refresh** (network error, server error or expired session):
  - the **last confirmed result stays on screen**;
  - a warning reads "Could not refresh — showing the last confirmed result";
  - the live dot turns amber.
- **No optimistic changes:** a person appears or disappears only after the server confirms it.
- **No new infrastructure:** no WebSockets, Redis or other services were added.
- Verified in Brave: check-in appeared on an already open dashboard without a reload, and checkout removed the person after confirmation.

## 6. Query and database-efficiency improvements — PASSED (measured)
Statements sent to PostgreSQL, counted at the driver on a synthetic dataset (12 employees, 4 days of sessions, 8 people working). These are before/after measurements of the actual old and new code:

| Operation | Before | After |
|---|---|---|
| Live workforce poll (API) | 12 | **8** (one actor check instead of two) |
| Protected layout, on **every page view** | 12 | **10** (removed an unused `organizationSummary` call; one settings read instead of two) |
| Attendance history page (2 weeks, 10 employees) | 431 | **402** (stored overtime reviews loaded in one query instead of one per employee-week) |
| Live list as headcount grows | — | **constant** (test asserts the same count with 4 and 9 people working, at most 5 statements) |

- **Indexes:** no new index was needed. The existing `attendance_one_open` and `attendance_sessions_incomplete_idx` partial indexes already cover open-session lookups.
- **Measured, not changed:** the overtime queue's per-row name lookups. Prisma already batches them (6 statements before and after), so that change was reverted to keep the diff focused.

## 7. Permission and privacy test results — PASSED
- **Employees** receive **403** from the live endpoint, with or without `employeeId`, `status` or `search` parameters, and the response contains no names. Unauthenticated requests get **401**. Tested in integration, HTTP and Brave.
- **HR/Manager** see the same list as Admin.
- **Tampered parameters** (for example `employeeId`) are rejected with 400 for staff too.
- **No private fields:** the live data contains no salary, commission, bank, compensation, date of birth, emergency contact, e-mail or incident data. Checked by assertion and over HTTP.
- **On-hold and suspended accounts:**
  - an open session is **kept** and flagged "Account on hold/suspended — review this open session";
  - the employee's own checkout is refused by the existing policy;
  - nothing is closed automatically;
  - suspended accounts are excluded from "Scheduled today" and "Not yet checked in".

## 8. Automated test results — PASSED
| Suite | Result |
|---|---|
| Unit | **105/105 passed** |
| PostgreSQL integration | **280/280 passed** (13 new live-workforce tests) |
| HTTP acceptance (production build, real Auth.js cookies) | **346 checks passed** (8 new) |
| Brave E2E (Playwright 1.63, production build, fresh database) | **43 passed, 1 skipped, 0 failed** (5 new) |

The skipped E2E test changes a login email. It needs development-mode email preview, which production builds refuse by design; this was already the case before this change.

Coverage of the 18 required cases (integration file `tests/integration/live-workforce.test.ts` unless noted):
1. Open session appears as working — tests "1–3"
2. Scheduled but not checked in does not appear — tests "1–3"
3. Checked out does not appear — tests "1–3" and "8–9"
4. Session started yesterday stays visible (22:00 check-in, checked at 01:00) — test "4" and Brave
5. Live list is independent of historical date filters — test "5–6" and Brave
6. Historical table obeys date filters — test "5–6"
7. Duplicate open sessions are not double-counted — test "7" (the database's two safeguards are lifted only in the disposable test database to simulate legacy data)
8. Successful check-in appears with server times — tests "8–9" and "11", and Brave
9. Checkout removes the employee after server confirmation, and the completed session stays in history with audit entries — tests "8–9" and Brave
10. Failed check-in/out (duplicate, another person's session, another person's period) leaves the list unchanged — test "10"
11. A refresh reflects server-side changes and is uncached — test "11" and Brave
12. A failed background refresh does not report zero — Brave (the request is aborted; the last count and rows stay, with a warning)
13. Employees cannot read others' live status — test "13–14", HTTP and Brave
14. HR/Manager access follows existing permissions — test "13–14" and HTTP
15. On-hold and suspended policy — test "15"
16. Organization-local date and time (00:30 local while UTC is still the previous day, past end, next day) — test "16" and Brave
17. No repeated queries — test "17" (constant statement count; one overtime-review query per report page)
18. Existing calculations unchanged — test "18": attendance, overtime and salary rows are byte-identical after repeated live reads, and completed time is unchanged. The full existing suites also pass unchanged.

## 9. Brave Browser verification — PASSED
Run with Playwright driving the installed **Brave Browser** against the local production build on synthetic data (`tests/e2e/10-live-workforce.spec.ts`):
- **Same data in both places:** the Admin dashboard shows the correct working employees, and the Attendance page shows the same sessions.
- **Check-in:** a synthetic employee checked in through the real portal. The open dashboard showed them within the 15-second refresh, with **no page reload** (a marker on the page survived). The start time matched the server check-in time in Asia/Dhaka.
- **Checkout:** after the server confirmed checkout and a refresh, the employee left the list. The completed session appears in history.
- **Midnight-crossing session** (22:00 yesterday):
  - visible on the dashboard with "Started on an earlier day";
  - visible on the Attendance page under **today**, a date three days earlier, and the default filters;
  - listed under attention with "Open since <yesterday>".
- **Refresh behaviour:**
  - manual refresh updates the timestamp;
  - automatic refresh works;
  - with the network blocked, a refresh shows the "Could not refresh" warning while keeping the last figures and rows;
  - a hidden tab makes **0** requests in 17 s, and making it visible triggers exactly one request.
- **Filters and empty state:** search, status and "no one matches" work.
- **Mobile:** the 390 × 844 layout of the dashboard and Attendance page has no horizontal page scrolling.
- **Employee access:** the employee account gets 403 from the API for every parameter variant, sees no live panel, and cannot open `/manage/attendance`.

## 10. Type check, lint and build — PASSED
- Type check (`tsc --noEmit`): **passed**
- Lint (`eslint .`): **passed**
- Production build: **passed**, both `next build` and `next build --webpack` (the same command as the Docker image)

## 11. Migrations added — none
No schema change, migration or index was needed.

## 12. Remaining issues and limitations
- **Not instant:** another person's check-in reaches an open Admin screen within about 15 s, by design (polling, not push). Saves made in the same window refresh it immediately.
- **Attendance history is still heavy:** a 2-week, 10-employee page takes about 400 statements. Most come from the per-employee summary and weekly overtime calculations. Rewriting those to batch would touch the calculation code, so it was left unchanged.
- **Fixed thresholds:** the 12-hour point at which an unscheduled open session becomes "Incomplete" is fixed in code, not a setting.
- **"Not yet checked in"** is based on the first period of the day. Any approved leave overlapping today excludes the person for the whole day.
- **Department filter:** it lists only departments of people currently working.
- **Synthetic data:** the midnight-crossing session in the Brave test was inserted directly into the disposable QA database. The application cannot backdate a check-in, by design.

## 13. Local URL and how to test
- **App:** http://127.0.0.1:3050/login — your local QA instance with its data preserved, now running this build.
- **Test accounts:** synthetic only; their e-mails are given in chat. The password is in `.local/qa-dynamic/accounts.json`.
- **Steps:**
  1. Sign in as **admin** (or **hr**). The **Currently working** card is on the dashboard.
  2. In a private Brave window, sign in as **schedule@qa.example.test** (no schedule, so they can use **Start unscheduled work**) or **employee@qa.example.test** (scheduled split shift). Then check in from *My schedule*.
  3. Leave the admin dashboard open. The person appears within about 15 s with no reload. Use **Refresh** for an immediate update.
  4. Open **Attendance**. You'll see Currently working, Open sessions requiring attention, Attendance history (change the dates — open sessions stay in the live area) and Potential overtime awaiting review.
  5. Check out as the employee. They leave the live list after the next refresh, and the session appears in history.
  6. As an employee, open `http://127.0.0.1:3050/api/manage/live-workforce`. Access is refused (403).

## 14. Production status — NOT TESTED (not deployed)
- **Production status:** nothing was pushed, deployed or touched on the Hostinger VPS. The change is committed only on the local feature branch.
- **Before any release:**
  - the usual safety gates (backup with off-server copy, restore drill, HR-app-only cutover);
  - an owner decision, because the GitHub repository is currently **public** by your earlier choice, while this task's rules require pushing only to a private repository.
- **Release risk:** no migration is involved, so a release would be application-only and easy to roll back.
