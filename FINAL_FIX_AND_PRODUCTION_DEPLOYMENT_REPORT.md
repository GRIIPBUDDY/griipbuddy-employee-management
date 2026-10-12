# Final fix and production deployment report

Checked 12 October 2026. **Patch implemented; automated checks and final browser acceptance passed locally. This schedule patch has not been deployed to production.** Production remains on its healthy previous release, with no production schedule, employee, attendance or earnings mutations performed for this task. Deployment awaits the owner's required production test-record designation.

## Actual root cause

The installed Prisma 7 PostgreSQL adapter reports a schedule assignment exclusion violation as `P2039`, with PostgreSQL code `23P01` and constraint `schedules_no_overlap`. The existing error handler recognized only `P2002` and `P2004`. A valid new assignment overlapping an existing assignment therefore reached the generic “Something went wrong. Please try again.” response instead of the expected schedule-conflict message.

This was reproduced with the real server action and disposable PostgreSQL, rather than inferred solely from screenshots. Valid Mon–Sat schedules with two periods per day publish successfully on an unassigned employee. Repeating the publication raises the native exclusion violation; the transaction rolls back completely. The fix recognizes this specific adapter/constraint combination and tells the user to use **Replace or cancel future dates**. It does not remove the database constraint, silently replace an existing assignment, or save overlapping assignments.

The weekday inconsistency was separate: the old checkboxes controlled the preset builder, while the work-period rows had independent state. Sunday rows could remain while Sunday appeared unchecked. Checked weekdays now derive from the actual draft periods; unchecking a weekday removes its draft periods, and editing a period updates the selected weekdays. The form shows the recurring weekly hours and flags incomplete or overlapping draft times.

Final browser testing also exposed React's automatic native form reset changing weekday dropdowns to Monday after successful publication, while the draft summary retained its original weekdays. Schedule forms now explicitly prevent that reset, preserving the complete draft for review and repeat submissions. This is opt-in for schedule forms; other forms retain their existing behavior. The corrected browser retry sent the original Mon–Sat values and received the expected assignment-conflict message.

Related date validation now computes one-week and indefinite bounds before validating the effective range and temporary holiday-work requirement. A one-week assignment with a computed end is treated as bounded; an indefinite assignment cannot accidentally use an irrelevant retained end date. The UI displays the actual effective range and organization timezone before publication and requires confirmation.

## Production findings and limits

Read-only inspection found one existing, unbounded assignment for the screenshot employee, Raiyan Khan: effective start **2026-10-12**, four periods on Monday/Tuesday, reason **Weekly Schedule**, created 11 October. No schedule records with reason **Weekly Work Hour** were found. An `operation_failed` entry at `2026-10-12T02:01:40.403Z` does not contain the submitted dates or request body.

**The effective dates of the original failed production submission could not be recovered from the retained redacted logs. They have not been guessed.** The stored assignment start above describes the existing record, not the unknown failed form. Any current or future create overlapping that unbounded assignment must use the explicit replacement workflow.

The old UI was separately reproduced locally with known form start **2026-10-12**, no end, Mon–Sat checked and fourteen periods including Sunday. Publication returned the generic error; the two original local assignments remained, with no assignment created for the failed reason. That local date is not evidence of the original production payload.

No explicitly designated production test employee or schedule was found. Test-like names/reasons and available designation evidence were checked; the existing real employee records do not establish permission to test. Raiyan's record was not modified.

## Changed files

| File | Change |
| --- | --- |
| `src/features/time/schedule-conflicts.ts` | Narrow classification of the observed Prisma/SQL exclusion error. |
| `src/features/time/schedules.ts` | Actionable conflict response; existing atomic transaction and constraints retained. |
| `src/features/time/validation.ts` | Normalize recurrence bounds before range/holiday validation. |
| `src/features/time/schedule-draft.ts` | Shared time parsing, draft weekday derivation and weekly-hours/overlap calculation. |
| `src/features/time/actions.ts` | Reuse the same strict time parser for submitted period values. |
| `src/components/time/schedule-fields.tsx` | Controlled periods and preset input; selected weekdays reflect actual rows; weekly-hours summary. |
| `src/components/time/schedule-action-form.tsx` | Controlled effective dates, computed exclusive ends, date/timezone preview and confirmation. |
| `src/components/time/management.tsx` | Connect the new form and direct assigned-date changes to explicit future replacement. |
| `src/components/ui/action-form.tsx` | Opt-in preservation of schedule form values across React action resets. |
| `tests/unit/schedule-publishing.test.ts` | Five regressions for adapter classification, weekday/hour calculation and recurrence bounds. |
| `tests/integration/schedule-publishing.test.ts` | Ten real PostgreSQL/action regressions including publication, duplicates, concurrent requests, access and rollback. |
| `scripts/ui-review.ts` | Dedicated synthetic local schedule fixture; sample identity timestamps once to avoid a fixture-only lifetime mismatch. |

No database migration, schema change, dependency change or compensation formula change is included. Authentication policy was not weakened. Next.js 16.4's installed forms guidance was read before the UI implementation.

## Local verification

| Check | Actual result |
| --- | --- |
| Existing and new unit suites | **96 passed**, 12 files. |
| Existing and new PostgreSQL integration suites | **228 passed**, 12 files. Re-run on the final source. |
| Standalone production HTTP suite with real Auth.js and disposable PostgreSQL | **331 checks passed**, re-run against the final build. This is local acceptance, not live production mutation testing. |
| Type checking | Passed on the final source. |
| ESLint | Passed on the final source. |
| Production webpack build | Passed, using the bundled Node 24 runtime. |
| Patch whitespace check | Passed. |

Regression coverage includes the real `publishAction` form with twelve Mon–Sat periods, 08:00–12:00 and 16:00–20:00, 48 weekly hours, no Sunday, indefinite/week/custom bounds, Asia/Dhaka occurrence resolution, employee own visibility and foreign-record denial. Duplicate and concurrent submissions retain exactly one assignment and one successful audit/activity outcome. Overlapping work periods save nothing. Explicit future replacement preserves prior slots; an injected audit failure rolls back the entire replacement and leaves the original rows unchanged.

The integration suite emits existing PostgreSQL-client concurrent-query deprecation warnings; all assertions pass. These warnings are not claimed to be repaired by this patch.

### Actual browser verification

The actual old browser reproduced the unchecked-Sunday inconsistency and generic conflict failure. An intermediate corrected build verified Sunday selection/removal (fourteen to twelve periods), one-week exclusive-end display, cancellation without publication, and successful publication of twelve Mon–Sat periods for a synthetic local employee.

That intermediate browser pass saved **09:00–13:00 and 17:00–21:00**, despite an attempted preset edit. This exposed an input-state synchronization issue during browser automation. The final source handles time and date edits through `onInput`, capturing the edited value before state updates. Both that correction and the automatic-reset correction above were verified through a fresh final production-mode preview.

Two early attempts to open the designated synthetic local schedule page were **not executed** because automatic approval review could not complete: `429 Too Many Requests`, retry limit exceeded. After completing independent checks, the same page action passed review and verification continued. The approval check was not bypassed; this transient review failure is resolved.

The final browser verified:

- Preset **08:00** updates all twelve periods to **08:00–12:00 and 16:00–20:00**.
- Checking Sunday produces fourteen periods/56 hours; unchecking removes both Sunday periods and restores twelve periods/48 hours.
- One-week recurrence displays exclusive end **2026-10-19** for start **2026-10-12**. Custom start/end edits display the actual entered dates; returning to indefinite removes the end.
- Cancelling confirmation retains the draft and reason. Confirming publishes successfully with the expected dates and exact twelve saved periods in history.
- Successful publication preserves every weekday dropdown. Repeated submission returns the actionable existing-assignment message and preserves dates, reason and weekdays.
- Invalid same-day overlap returns the overlap error, and the draft flags invalid periods. Applying the preset restores the valid draft.
- A real synthetic employee login sees the own schedule, Asia/Dhaka, Mon–Sat split periods, Sunday empty and **48h 0m 0s**. Its navigation contains employee pages and does not expose management controls.
- Read-only local database checks after publication, duplicate and invalid-overlap attempts found exactly **one assignment, twelve exact periods, one creation audit and one activity outcome**, with zero attendance records for the fixture.
- No captured browser error/warning logs were present at final acceptance. The observed 615-pixel responsive viewport had no horizontal document overflow.

Saved local evidence: `.local/schedule-review/before-failure.png` and `.local/schedule-review/schedule-published.png`. The latter shows the final synthetic employee portal, not production.

The synthetic local preview is available at `http://127.0.0.1:3021/login` while its review process remains running. It uses a separate disposable PostgreSQL database and synthetic identities; it does not connect to production.

## Production status, backup and health

Existing authorized SSH access, deployment architecture and recovery documentation were inspected. The target is the existing x86_64 Hostinger VPS at `72.60.107.88`, with the dedicated `griipbuddy-employee` Compose project, private PostgreSQL, app ingress on loopback port 3100, host Nginx HTTPS routing and retained document storage. No new infrastructure was provisioned.

Read-only checks at the end of this task confirmed:

- Active source directory: `/srv/griipbuddy-employee/releases/0835b9b43e6f`.
- Existing deployed source: `0835b9b43e6fe34733b7998cfe3b2c2bf171bbe0`.
- Existing image: `sha256:f5bb36a40e5b7774c2af750b5bd01bd4e0d4f6c74c4364ad90a06c618bf71dbd`.
- Employee app and PostgreSQL containers: **healthy**.
- Nginx and the employee notification timer: **active**.
- `https://griipbuddy.cloud/login`: **HTTP 200**; readiness: **ready**.
- Existing `https://griipbuddy.com`: **HTTP 200**.

These identifiers describe the **previous live release**, not this schedule patch. This patch has not been uploaded, built on the VPS, deployed, or tested through a production write. There is no new deployed revision/image to report. No live authenticated schedule-publication success is claimed.

The previous release has a verified recovery set at `/srv/griipbuddy-recovery/20261012-ui-cutover-0835b9b`, with an authenticated encrypted archive. Its documented restore acceptance matched all 32 table digests in a separate disposable project. See [PRODUCTION_UI_RELEASE.md](PRODUCTION_UI_RELEASE.md), [BACKUP_RECOVERY.md](BACKUP_RECOVERY.md), [DEPLOYMENT.md](DEPLOYMENT.md) and [HOSTINGER_LIVE_DEPLOYMENT.md](HOSTINGER_LIVE_DEPLOYMENT.md).

**No fresh pre-deployment backup was created or restore-tested for this schedule patch.** The earlier verified backup is not substituted for a fresh release backup. Automated off-server backup storage remains unconfigured. No rollback was necessary because no cutover or production mutation was attempted.

## Exact blockers and remaining release steps

The owner explicitly instructed: **“If no designated test record exists, stop before making production changes and ask me to designate one.”** None was found. The owner must identify the exact employee/schedule authorized for production testing, or explicitly authorize creation and define cleanup of a dedicated test record. “Finish task” did not designate such a record or authorize modifying Raiyan.

After these prerequisites are resolved, the already-authorized release can proceed through a fresh verified database/document backup, target-architecture build, isolated acceptance, guarded application-only cutover and production health/data verification using the documented architecture. No schema migration is needed for this patch. The pre-write test record's exact future schedules and assignments must be captured first, and the agreed cleanup must be verified afterward. The normal schedule workflow preserves immutable history and increments revisions, so exact physical row restoration must not be promised or attempted through undocumented database edits.

Until then, production data and all real employee schedules remain unchanged by this task. No secrets, passwords, private recovery keys or production database connection strings are included in this report.
