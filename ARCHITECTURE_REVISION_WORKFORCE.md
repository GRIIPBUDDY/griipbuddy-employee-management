# Workforce operations and compensation revision

Approved by the Workforce Operations & Compensation Change Request, 11 October 2026. This revision supersedes conflicting Phase 3A–3H behavior; the earlier architecture and reports remain historical records. One Next.js app, one PostgreSQL database, existing Auth.js encrypted cookies, private files and isolated Compose remain. No queue, worker, Redis, external payroll transfer or new persistent service is introduced.

## Implementation stages

A: schema/history impact and architecture; B: confidential staff-only commissions and employee rechecks; C: verified account email, remembered sessions and statuses; D: independent task assignments; E: attendance-based weekly earnings/monthly payable; F: dated recurring exceptions, swaps and unscheduled overtime; G: date reporting, dashboards and full verification. Stage evidence is recorded in WORKFORCE_CHANGE_REPORT.md. No deployment occurs between stages.

## Confidential commission authority

Admin and independently commission-authorized HR manage grants and entries. Employees can only read their own eligible records and request rechecks; they cannot create/edit/withdraw commission entries. An ineligible employee receives generic not-found responses and no feature labels, permission fields, amounts, empty states, notifications or history. Private salary rows and JSON snapshots are projected explicitly; aggregate take-home totals remain available but contain no commission labels or restricted inputs. HR self-review remains prohibited. Historical included commissions are corrected through reviewed, classified adjustments rather than mutation.

## Accounts and sessions

ACTIVE, ON_HOLD and SUSPENDED extend accounts without deleting their history. The legacy isActive flag is synchronized with suspension for old consumers. Hold permits personal reads and permitted non-operational requests but forbids attendance, task progress/completion and swap submission/acceptance. Suspended accounts cannot authenticate/use cookies. Admin manages employee statuses; HR cannot affect Admin accounts or self; the last active Admin remains protected. Changes require a reason and audit, and employee notifications omit internal reasons.

Normal sessions retain the absolute 12-hour policy. Remembered sessions use the same encrypted HttpOnly cookies and a server-configured lifetime (30 days initially, bounded configuration); neither mode rolls past its issued absolute expiration. Session version, status, role and grants are rechecked from the database. No password enters browser storage.

Email changes retain the same user/employee IDs. Admin can reauthenticate and request their own email change; authorized staff can request employee changes under the same authority boundaries. Only a one-use, hashed, expiring verification token delivered to the new address can activate it. Completion atomically rechecks uniqueness, changes email and revokes prior sessions; the old address is notified. Delivery absence blocks production. Explicit development preview is restricted to development plus a configured loopback origin; it is never a production fallback. Failed old-address notification is retained for retry rather than concealing a delivery failure or undoing the verified identity.

## Tasks and schedules

Each selected employee receives an independent task-assignment record, with assigned/due date, priority, revision, creator and completion evidence. Own progress/completion cannot alter assignee/title/due date. Staff can review/manage with audited revisions; hold and suspension are enforced inside mutations. Reports explicitly select assigned, due or completed date semantics.

Weekly recurring schedules keep their existing dated versions/slots. A one-week/one-day exception splits a future range and restores its original pattern. This occurrence/this and future/entire unstarted future series options preserve original versions and reject attendance already started. The default helper emits two 4-hour work slots separated by a 4-hour nonworking break; configurable workdays/start times retain multiple/overnight slots. Standard weekly expected hours default to 48, separately versioned from the overtime threshold (new organizations initially 48). Existing threshold histories are preserved.

Swaps record two future date/slot identities and source revisions. Both employee consent and a distinct authorized staff approval are required. Approval under the existing mutation lock rechecks status, employment, future dates, conflicts and attendance, then creates dated exceptions for both employees atomically. Decline/rejection leave schedules untouched. No employee receives another employee's personal profile through the swap directory.

UNSCHEDULED attendance uses server time, no invented scheduled snapshot and the existing one-open-session/idempotency constraints. It is available only when no actual occurrence intersects that organization-local date (including an overnight occurrence). A scheduled date outside its eligible slot cannot fall back to unscheduled work. Closed work outside schedule and unscheduled time joins the weekly threshold candidate by interval union, so overlapping candidate reasons never double-count. Overtime remains subject to review and source changes make decisions stale.

## Earnings formula and history boundary

The owner explicitly retained calendar-day proration for hires/leavers and approved paid leave/holiday coverage. Unpaid leave contributes zero base coverage. All intervals use organization-local dates; monetary arithmetic uses Decimal precision 40 and half-up two-decimal components.

For each monthly compensation-rate/employment segment: planned payable seconds are the assigned work intervals in that segment; credited seconds are the union of verified scheduled ordinary work and approved paid leave/holiday credit, excluding approved payable overtime and capped by planned intervals. Monthly segment base = monthly basic × eligible segment calendar days / calendar days in month × credited seconds / planned payable seconds. Summing eligible segments preserves rate/employment history. A fully covered full-month schedule at one rate earns that full monthly basic. Zero planned seconds for a monthly segment blocks finalization; no fictitious denominator is substituted. New hourly/daily calculations also restrict ordinary base to eligible scheduled coverage; extra/unscheduled work never creates ordinary base automatically.

Weekly statements allocate these exact unrounded daily facts to each workweek, separately recording potential overtime, approved overtime, eligible approved commissions and approved adjustments. Overtime = approved seconds / 3600 × the effective employee overtime hourly rate. Legacy statements retain their agreed equivalents/multipliers; the new method requires the separate effective hourly rate and never substitutes a legacy rate. Missing unresolved rates block finalization. Attendance-proportional policy begins at the stored earnings effective month; previous finalized amounts/formula snapshots are retained, and earlier periods continue their historical formula. Future source edits never update final statements.

Weekly DRAFT/CALCULATED/REVIEWED/FINALIZED describes earned amounts, never payment. Finalization locks snapshot and source claims. Month-crossing weeks retain per-month component allocation; monthly statements sum only their relevant finalized components and unclaimed approved monthly adjustments, with unique inclusion claims. An incomplete/unreviewed crossing week remains a disclosed closeout blocker rather than being fabricated as finalized on month-end. Monthly payment is separately UNPAID/PAID, with explicit recorded date/reference/note and actor. The application never transfers money.

Corrections preserve original weekly/monthly snapshots and use approved later adjustments linked to their original statement. Commission corrections remain confidential; duplicate claim/operation keys prevent duplicate settlement. Changing a task does not generate earnings. Expected hours, overtime threshold and pay rates are independent settings, not assertions of labor-law compliance.

## Persistence and operations

Minimal new entities: commission rechecks, email change requests, task assignments, weekly earning statements and shift-swap requests. Existing users/settings/preorders/compensation/monthly pay tables receive additive fields. Migrations backfill compatibility values without reset or historical final-amount changes, retain audit immutability and add owner/FK/state/inclusion constraints. Runtime grants and recovery manifests must include the new entities. Email transport/preview configuration is documented separately; no live provider or Hostinger resource is accessed during implementation.
