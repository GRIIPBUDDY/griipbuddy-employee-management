# Overtime rejection and UI development report

Verified locally on 11 October 2026. The original request prohibited production changes; implementation and local acceptance respected that restriction. The subsequent instruction to publish authorizes a separate, data-preserving production release, recorded in `PRODUCTION_UI_RELEASE.md` when completed.

## Root cause and reproduction

The overtime decision form initially populated approval hours with the potential overtime amount. Selecting **Reject** retained those positive values. The Server Action always added the hours/minutes/seconds and sent that amount to `decideOvertime`. The service correctly refused a rejected decision containing positive approved seconds. A second validation mismatch required a nonempty reason even for rejection.

Before changing the implementation, two regression cases invoked the real Server Action with an authenticated HR identity and disposable PostgreSQL records. Rejecting the prefilled three hours failed: an empty reason produced the minimum-length validation error, and a reason produced “Approved seconds must fit current potential overtime; rejection approves zero.” These cases pass after the fix. Authentication is mocked only for those direct action tests; browser and HTTP acceptance use real Auth.js sessions.

The existing transaction, authorization, database guards, audit and notification services were inspected. They already supported rejection correctly; the fix retains them and corrects the input contract.

## Corrected workflow and financial behavior

Selecting Reject hides approval amount fields, submits zero approved seconds, and makes the reason optional. The Server Action independently normalizes rejected browser submissions to zero, including submissions with the original positive fields. Direct API decisions retain the explicit zero-amount service guard. Approval still requires a reason and integer approved seconds within the current potential amount.

The confirmation dialog explains the zero payable overtime, employee notification and retained attendance. Only successful server completion refreshes the affected layout and emits success feedback. The existing service atomically records `REJECTED`, reviewer, review time, reason and revised version, appends `OVERTIME_REJECTED`, and inserts the employee's deduplicated `OVERTIME_DECIDED` notification.

The saved rejection survives reloading and unchanged recalculation. It is excluded from the pending queue and supplies no active approved allocation. The employee sees the rejection and reason in their own overtime history and can follow the notification to the reviewed week. Original attendance rows remain unchanged.

The actual salary capture and calculation engine regression verifies empty approved overtime allocations, overtime amount **0.00**, and unchanged ordinary base earnings **160.00** for an eight-hour session at an hourly base rate of 20. Salary formulas, BDT formatting, attendance rules and commission permissions were not changed.

Changed attendance evidence follows the existing `STALE` → recalculated `PENDING` workflow and needs a fresh explicit decision. It never silently reinstates overtime pay. Finalized earnings snapshots remain immutable. Existing reconciliation rules may create a separately reviewed adjustment after corrected evidence; a blanket ban on later source review would break those rules and was not added.

## Permissions, concurrency and failure handling

Existing server authorization permits Admin and HR/Manager review, rejects ordinary employee and unauthenticated mutations, and prevents HR self-review. Existing Admin authority is preserved. Employee reads remain scoped to their own employee identity; foreign identifiers return 404.

Mutations retain the existing advisory serialization, actor/employee locking, fresh evidence checks, pending-status requirement and revision check. Concurrent and duplicate decisions create one outcome, one decision audit and one notification. Stale forms cannot overwrite a newer approval or rejection. A simulated audit insertion failure rolls back the decision and notification. Decided records and finalized statement contents cannot be overwritten by a second review submission.

## UI and interactions

The existing Next.js, Tailwind, Radix dropdown and Lucide stack is retained, with no new dependency, framework or schema migration.

- Shared shell: dark grouped sidebar, working page search, precise active route, contextual sticky header, profile/settings/sign-out menu, notification entry, role-aware links and mobile modal drawer.
- Design system: restrained blue/slate tokens, system typography, consistent spacing and surfaces, readable table headers/rows, button hierarchy, 44px primary controls, labeled fields, text-and-color status badges, empty states, confirmation dialogs, server-confirmed toasts and dashboard tabs.
- Management workflows: interactive dashboard attention cards; employee and attendance tables; overtime detail/queue with employee search, status filters and pagination; salary/weekly-earnings status and finalization dialogs; tasks; leave review/cancellation; authorized commission claim status/cancellation; account access/reset confirmation and organization settings confirmation. Schedule, compensation and other existing forms inherit the shared shell and form improvements.
- Employee dashboard: today's schedule/current attendance, next assigned period, assigned/in-progress tasks, current week overtime, leave, month earnings, finalized salary and notifications. Unavailable commission features remain absent from navigation and dashboard content.
- Mutations: pending spinner and disabled controls, synchronous duplicate-submit protection, inline errors/success, exception handling, confirmation before consequential actions, and restoration of entered text/selections after failed form actions. Rejection is not shown optimistically.
- Forms are keyed to the selected overtime employee/week and review version, preventing previous selections or success feedback from carrying into a different employee's record. Success toasts are dispatched after the action result, before a completed form is removed by server refresh.
- Accessibility: labeled controls, skip link, visible focus styling, text status labels, keyboard tab selection, native modal focus containment/Escape, touch-friendly controls and reduced-motion support.

## Executed verification

| Check | Result |
| --- | --- |
| Type checking (`npm run typecheck`) | Passed |
| ESLint (`npm run lint`) | Passed |
| Production webpack build | Passed |
| Existing and new unit tests | 91 passed across 11 files |
| Existing and new PostgreSQL integration tests | 218 passed across 11 files |
| Production standalone HTTP suite with PostgreSQL and real Auth.js cookies | 331 checks passed |
| Whitespace/error check (`git diff --check`) | Passed |

New tests: seven unit cases in `tests/unit/overtime-decision.test.ts` and eleven integration cases in `tests/integration/overtime-rejection.test.ts`. Coverage includes action reproduction, HR/Admin rejection, persistence, unchanged attendance, employee status, notification/audit, actual salary exclusion, unauthorized/self/foreign access, concurrent duplicates, stale evidence, correction reopening, finalized snapshot protection and transaction rollback. Existing salary, authorization, reconciliation, weekly earnings and commission privacy suites remain enabled.

A global protected-route loading boundary initially made Next.js stream HTTP 200 before a foreign-employee 404. The existing HTTP regression caught it; the boundary was removed and navigation now uses inline `useLinkStatus` indicators. The final HTTP suite preserves both the 404 assertion and the no-foreign-data assertion.

Browser verification used the actual production build on loopback port 3021 and a disposable PostgreSQL fixture, with synthetic HR/Admin/employee accounts and private document storage. Executed checks include: login/sign-out, role-specific navigation, dashboard tabs by keyboard, page search, overtime detail, cancellation of confirmation, rejection with and without a reason, saved reason/status, refresh/recalculation persistence, employee-name/status filtering, stale submission preserving its reason, notification-to-own-history navigation, zero approved overtime and employee task/earnings visibility. Desktop and 390 × 844 mobile layouts were inspected; the mobile document width was 390px, the drawer 320px and the confirmation 358px, with table overflow confined to its scroll container.

Browser screenshots are stored privately in `.local/ui-review/screenshots`. No synthetic fixture is uploaded into the production database.

## Limits and operational notes

No known overtime rejection defect remains in the verified flow. Every existing management page/control has not been individually exercised by hand; broad authorization/workflow coverage comes from the integration and HTTP suites. Browser checks cover the principal changed interactions, rather than constituting a complete accessibility audit.

Browsers cannot repopulate file inputs after an error: attachment forms require selecting the file again. Ordinary text and select values are restored. The existing PostgreSQL driver emits a concurrent-query deprecation warning during some integration fixtures; all assertions pass, and this change does not alter the driver.

Local preview URLs and synthetic accounts are test-only. Production deployment must retain existing database/document volumes, runtime credentials, authentication secret and applied migrations. No bootstrap/reset or disposable test suite may run against production.

## Changed files

Overtime input/service/action: `src/features/review/decision-input.ts`, `actions.ts`, `validation.ts`, `overtime.ts`; `src/components/review/decision-form.tsx`, `forms.tsx`, `overtime.tsx`; `src/app/(protected)/manage/overtime/page.tsx`.

Shared UI/shell: `src/app/globals.css`; `src/components/ui/action-form.tsx`, `button.tsx`, `field.tsx`, `input.tsx`, `confirm-dialog.tsx`, `empty-state.tsx`, `status-badge.tsx`, `tabs.tsx`, `toasts.tsx`; `src/components/layout/shell.tsx`, `shell-frame.tsx`, `navigation.tsx`, `profile-menu.tsx`.

Dashboards/workflows: `src/features/insights/dashboard.ts`; `src/components/insights/dashboard-overview.tsx`, `personal-dashboard.tsx`; `src/components/pay/common.tsx`, `weekly.tsx`, `preorders.tsx`; `src/components/review/absence.tsx`; `src/components/tasks/workspace.tsx`; protected pages `dashboard`, `manage/accounts`, `manage/attendance`, `manage/employees`, `manage/leave`, `manage/salary`, `manage/settings`, `notifications`.

Verification: `scripts/ui-review.ts`, `scripts/http-smoke.ts`, the two regression test files above, and this report. Database schema, migrations, lockfile and application dependencies are unchanged.
