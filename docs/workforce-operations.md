# Workforce operations guide

Use the existing application and PostgreSQL database. This change adds no service or dependency and does not deploy anything. See [the architecture revision](architecture.md#architecture-revisions) for the exact formula, cutover and retained history.

## Account settings and verified email

Open **Account settings** from the signed-in navigation. Enter the new email and current password. The old email remains the login identifier until the new address is verified. Confirmation retains the same user and employee IDs, role and permissions, and revokes prior sessions. Sign in again using the verified address and the existing password. A failed verification delivery leaves the old login usable. Failed delivery to the previous address is retained for retry in account settings.

Configure `EMAIL_DELIVERY_URL` and `EMAIL_DELIVERY_TOKEN` in the protected deployment environment. The URL must be an HTTPS endpoint accepting JSON `{ "to": "address", "subject": "subject", "text": "body" }`. The application sends `Authorization: Bearer <token>` and `Idempotency-Key: <request identifier>`; any successful HTTP response acknowledges delivery. The adapter must deliver the text to the specified address and deduplicate retries. Requests have a ten-second timeout; redirects are rejected. Do not use a public webhook or log message bodies containing verification tokens. An existing organization's trusted email adapter can implement this contract; the application does not provision a provider.

Without an adapter, production email changes are blocked. For explicit local testing only, start development with `ALLOW_DEV_EMAIL_PREVIEW=true` and a loopback `APP_BASE_URL`. The authenticated request result displays the one-hour verification link. Preview is disabled for non-loopback origins and production; production startup rejects the preview flag. No actual email is sent in this development flow. Never enable it on a deployed server.

Authorized staff can request an employee email change from that employee's profile; staff reauthenticate with their own password. Another administrator's login cannot be changed through that form. The employee must verify ownership of the new address.

## Sessions, account status and tasks

Remember me uses the existing encrypted, HttpOnly Auth.js cookie. The default remembered lifetime is 30 days; `REMEMBER_ME_DAYS` permits integers from 1 to 90. Normal sessions retain twelve hours. Both use an absolute deadline, so visiting pages does not extend access. Changing this configuration invalidates remembered identities using a different lifetime. Suspension, password changes, email changes and grant revocation reject existing sessions promptly. Production HTTPS uses Secure and SameSite=Lax cookies; loopback HTTP requires the existing explicit local override.

Staff profile account controls show Active, On hold and Suspended. A reason is required for each change. On hold retains permitted reads and login but blocks attendance, task progress and shift-swap operations. Suspended rejects login and prior sessions. Users cannot change their own status; HR cannot manage staff/Admin targets; the last active administrator remains protected. Internal reasons stay in staff audit evidence, while personal notifications contain a generic status message.

**Manage tasks** assigns independent records to selected employees. Completion affects only the subject's record. Completed records retain the completion timestamp and note; staff cannot silently reopen or rewrite them. Filter task lists and task reports by assigned, due or completion date, employee and status. Until dates are exclusive. Filtered task CSV exports use the existing staff report permissions and CSV escaping.

## Commissions

Authorized staff grant or revoke employee-specific access in employee profiles. Ineligible employees receive generic not-found responses and have no commission navigation, response fields, cards, notifications, timeline entries or statement labels. Revoking access preserves earned historical totals; confidential statements expose only their aggregate.

Staff record fixed or percentage commissions using retained eligibility evidence and precise server arithmetic. Eligible employees have read-only own records and may request a recheck. Staff confirm, reject or correct a recheck. Corrections to included earnings require a separately approved adjustment linked to the frozen statement; the original remains intact. Staff may cancel unincluded claims, while weekly/monthly included claims remain frozen.

## Earnings and payment

Configure each employee's effective monthly basic and separate overtime hourly rate from their compensation page. Existing legacy equivalents and multipliers remain visible for historical calculations. They never substitute for the new rate. The standard weekly hours target initially equals 48 and can be versioned by staff from **Weekly earnings**. Overtime threshold policy remains independent; existing threshold histories are preserved. New organizations start with a 48-hour threshold.

For the new method, monthly segment base is:

`monthly basic × eligible segment calendar days / month calendar days × credited regular seconds / planned payable seconds`

Calendar-day employment/rate proration is retained. Credited regular coverage is the union of verified scheduled ordinary work and approved paid leave/holiday coverage, capped at planned intervals and excluding approved payable overtime. Unpaid leave contributes zero. A full eligible monthly schedule earns the full configured basic. Missing regular coverage reduces it. Unscheduled time never creates regular base. Zero planned hours and missing compensation coverage block financial finalization.

Workweek statements start with calculation, then review and finalization. Daily contributions use Decimal arithmetic; cumulative half-up differences allocate cents across workweeks so their monthly portions sum exactly. Boundary workweeks retain distinct monthly components. A month can close only once every intersecting employment workweek is finalized. The month may therefore require waiting for a workweek that ends after the calendar month.

Specify an optional workweek start on a bonus/allowance/deduction proposal to include it in that week's statement. Leave it empty for a month-end adjustment. Frozen weeks require a controlled correction to a later open month. Source claims prevent double inclusion in weekly and monthly totals. Compensation or attendance edits never rewrite frozen earnings.

Monthly calculation aggregates the applicable frozen weekly components and approved monthly adjustments. Authorized staff review, approve and finalize the monthly payable, then explicitly **Record payment made** with the actual timestamp and optional reference/note. Finalization remains Unpaid until that separate action. Recorded payment evidence cannot be overwritten. No bank transfer occurs. HR cannot review or record their own pay; restricted statements require commission authority.

The personal dashboard separates finalized weekly earnings from estimates awaiting review. Potential overtime is never shown as approved or paid. Own monthly statements show the separately recorded payment status.

## Schedules, attendance and swaps

The default-pattern helper creates four hours of work, four hours of unpaid break and four hours of work. Start times and weekdays are configurable; six such days provide 48 working hours. Custom multiple sessions and overnight sessions remain supported.

Publish a one-week, indefinite or bounded recurring assignment. An occurrence-only exception restores the preceding pattern on the next date. This-and-future edits version the remaining series; an entire-series edit is available only while that series is wholly in the future. Started attendance and historical earnings require the existing reviewed correction workflows.

Employees may start server-clock **Unscheduled work** only if no assigned occurrence intersects that organization-local date, including an overnight occurrence from the previous date. An out-of-slot attempt on an assigned date stays subject to normal schedule rules. Checkout captures actual elapsed time and creates an unapproved overtime candidate for unscheduled or late work. HR/Admin review the closed workweek, approve or reject seconds, and add a note. Approved seconds use the effective individual hourly rate; missing rates block finalization. Rejected time remains factual attendance and earns no overtime.

Swap requests identify two future assigned sessions. The partner must consent before a distinct staff reviewer can approve. Approval rechecks current accounts, employment, dates, revisions, attendance and overlaps, then replaces both dated occurrences in one transaction. A stale proposal needs a new request; overlapping approval rolls back both changes. Other recurring dates retain their pattern.

Attendance reports default to today in the organization timezone. Providing only From selects that date; providing Until selects an exclusive-ended range of at most 31 days. Reports expand recurring occurrences only within that range.

## Local operations and recovery

The existing local launcher is `.local/start-local.sh`; it applies migrations with the owner connection, grants runtime access, then runs development with only the runtime credential. Existing local credentials and synthetic data are retained. The protected `.local/development` directory contains local-only configuration and backups and is excluded from Git and Docker build context.

Before the workforce migration, the local PostgreSQL 18 server was cleanly stopped and its data, documents and configuration copied to a private backup with SHA-256 metadata. A physical backup requires the same PostgreSQL major version and a stopped destination; use the established logical backup/restore-drill tooling for deployment recovery. Do not reset an existing database or copy test credentials into production. The established logical dump includes the whole database, so new tables are included automatically; runtime grants explicitly include the five new tables.
