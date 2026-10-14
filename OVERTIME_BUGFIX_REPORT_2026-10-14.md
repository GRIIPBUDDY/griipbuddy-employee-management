# OVERTIME REVIEW AND REJECTION BUG-FIX REPORT

Release `3b1f72467f13` · deployed 2026-10-14 to `griipbuddy.cloud` (project `griipbuddy-employee`). Previous release `58fd7afc3c23`.
Legend: **PASSED** · **FAILED** · **NOT TESTED** · **BLOCKED**. No secret, credential or personal data appears in this report.

## 1. Root cause — PASSED (identified with evidence)
Checkout after a scheduled end, or after unscheduled work, calculates overtime for the employee's **current, still-running week** (`calculateOvertimeInTransaction(..., allowOpen=true)`) and creates a `PENDING` review that appears in the queue with a **Review overtime** button. `decideOvertime` then refused every decision while the week was open (`!current.ended` → `409 STALE "This calculation changed or needs attendance resolution…"`), and staff recalculation was refused too (`WEEK_OPEN`). Reviewers therefore saw a pending record they could never approve or reject until the week ended. The earlier "overtime rejection" fix and its tests only used weeks that had already ended, so they passed while the real workflow stayed broken.

Production evidence (read-only): one `PENDING` review for the week starting 2026-10-12 (week not ended, potential overtime, no reviewer) — the stuck record; the week of 2026-10-05 had been rejected successfully after it ended.

## 2. Files and services changed — PASSED
- `src/features/review/overtime.ts` — decisions allowed on open weeks (still bound to the attendance snapshot; blockers such as a missing checkout or pending correction still refuse); staff (re)calculation of the running week; weeks that have not started are refused; specific errors (already reviewed, no overtime, changed since loaded, stale, unresolved attendance); identical retry by the same reviewer is a no-op; review data includes the week's sessions.
- `src/components/review/overtime.tsx`, `src/app/(protected)/manage/overtime/page.tsx` — attendance evidence (schedule or *Unscheduled*, check-in, checkout, worked, outside-schedule time) in the card and the decision dialog; "week in progress" explanation; recalculate available for the running week.
- Tests: `tests/integration/overtime-review.test.ts` (new, 10 scenarios), `tests/e2e/08-overtime-review.spec.ts` (new), intended-behaviour updates in `overtime-rejection.test.ts` and `review.test.ts` (clearer error codes; running-week calculation allowed, future week refused).
No schema, migration, permission, salary formula or deployment-file change.

## 3. Reproduced — PASSED
- Integration test through the real check-in/checkout services: checkout created `PENDING` for the open week; `decideOvertime(REJECTED)` threw the generic 409 (before the fix).
- Brave (Playwright 1.63, pre-fix production build, synthetic data): review dialog showed "This calculation changed or needs attendance resolution. Recalculate and review again."; server action HTTP 200 with that error; no console errors; database still `PENDING`, no reviewer.
- After the fix, the real stuck production record was decided successfully on a **disposable restored copy** (week open, no blockers, 4 sessions → `REJECTED`, one audit row). Production's record itself was not changed.

## 4. Database/status changes — PASSED
Decisions update only the `overtime_reviews` row (`status`, `approved_seconds`, `reviewed_by`, `reviewed_at`, `review_comment`, `revision+1`) under the existing history trigger, plus one audit row and one employee notification. Attendance sessions are never modified. No schema change.

## 5. Approval workflow — PASSED
Admin and authorized HR approve pending overtime (full or partial); reviewer, timestamp and comment persist after reload; approved time is shown as payable to the employee; audit `OVERTIME_APPROVED`; notification sent.

## 6. Rejection workflow — PASSED
Rejection stores zero approved seconds, reviewer, timestamp and optional comment; leaves the pending filter; employee sees "Overtime rejected"; audit `OVERTIME_REJECTED`; notification "Your weekly overtime review was rejected."; attendance timestamps unchanged.

## 7. Authorization and security — PASSED
Employees (including the worker) get 403 for review data and decisions (service, form action and API); HR cannot decide their own overtime (`SELF_REVIEW`), administrators can; mutation origin checks unchanged; errors reveal no SQL, stack traces or other employees' data.

## 8. Salary/earnings regression — PASSED
Monthly salary pays approved time only at the individual rate (2 h approved × ৳150 = ৳300.00; rejected = ৳0.00); recalculation never reopens an unchanged rejection; later attendance marks a decision stale for a new review with history kept; a finalized salary month and statement are untouched by a later decision.

## 9. Type-check, lint, build and automated tests — PASSED
Typecheck and lint clean · unit 105/105 · PostgreSQL integration 255/255 (10 new) · HTTP acceptance 338 checks · production build (webpack, as in the image).

## 10. Brave Browser — PASSED
Full suite on the fixed production build: 34 passed, 1 skipped by design (email change needs development mode), 0 failed. The new workflow test signs in as Admin (approves) and HR/Manager (rejects), verifies persistence after reload, audit, attendance integrity, the employee's outcome and notification, and that an employee cannot open the review or call the API.

## 11. GitHub — PASSED
Private repository, branch `feature/2026-10-14-monthly-configurable` (PR #2), commit `3b1f72467f13…`; pushed without force; `main` untouched.

## 12. Production deployment — PASSED
Pre-deployment backup `20261014-pre-3b1f724` (34 tables, quiescent) with encrypted off-server copy verified (`8370619e8544c6e4`); restore drill: 34/34 digests equal live, new image ready/login 200 on the copy without changing any table; cutover backup `20261014-cutover-3b1f724` (app stopped) with encrypted off-server copy verified (`c05ce3d238ec93cc`); app-only cutover: 34 tables identical before/after, migrations 11 → 11, database container and documents volume unchanged, only the image setting changed.

## 13. Live verification — PASSED (public) / NOT TESTED (signed-in)
`/login` 200, readiness ready, guest overtime page redirects to sign-in, guest API 401, logs clean, notification timer active, all other hosted sites unchanged. Signed-in production review was **not** performed: there is no designated production test record, and deciding a real employee's overtime would be a real payroll decision — the pending 2026-10-12 record is left for the owner.

## 14. Remaining defects or blockers
- **Incident found and repaired during deployment:** at ~01:29 UTC the two disposable restore projects were removed through Hostinger Docker Manager. Docker Manager also deleted each project's working folder — the live release folder `releases/58fd7afc3c23` and `releases/84d8ebc96917` — and the old `84d8ebc` image. Running containers and all data were unaffected, but the `current` link was dangling (the daily notification job and a database container recreate would have failed). The live folder was restored byte-for-byte from Git before deployment. Restore drills now run from `/srv/griipbuddy-config/drills/…`, so removing a drill project no longer touches release folders.
- The nightly `docker image prune -af --filter until=24h` removes unused images; the previous release image is saved as `/srv/griipbuddy-config/images/griipbuddy-employee-58fd7afc3c23.tar` for rollback.
- Kept for the owner: stopped disposable project `griipbuddy-restore-3b1f724` (drill directory above) and the stopped builder.

## Rollback (application only)
```bash
R=/srv/griipbuddy-config/rollback-20261014-3b1f724
cp -p "$R/operator.env" /srv/griipbuddy-config/employee.env
ln -sfn "$(cat "$R/previous-release.txt")" /srv/griipbuddy-employee/current
cd /srv/griipbuddy-employee/current && docker compose --env-file /srv/griipbuddy-config/employee.env -p griipbuddy-employee -f docker-compose.hostinger.yml up -d --no-deps --no-build --wait employee-app
```
If the previous image was pruned: `docker load -i /srv/griipbuddy-config/images/griipbuddy-employee-58fd7afc3c23.tar` first.
