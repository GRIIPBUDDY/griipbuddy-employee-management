# User guide

How administrators, HR managers and employees use the system day to day. Menu names are shown in **bold**.

| Role | Can do |
|---|---|
| Administrator | Everything, including **User accounts** and **Settings** |
| HR / Manager | People, schedules, attendance, leave, overtime, payroll and HR records. HR cannot approve their own requests or reviews. |
| Employee | Only their own schedule, attendance, leave, pay, documents and records |

An administrator or HR manager who also has an employee profile gets a **My workspace** section for their own records.

## 1. Setting up your organization (administrator)

1. **Settings → Branding:** display name, legal name and registered address (printed on PDFs), brand color and logo.
2. **Settings → Rules:**
   - set the timezone and currency first; both lock once attendance or pay records exist;
   - set the early check-in window (how many minutes before a period starts check-in opens) and the late grace period;
   - set the working days, how leave days are counted, what happens when a request exceeds the leave balance, and the salary payment day.
3. **Settings → Modules:** switch off anything you don't use (tasks, shift swaps, commissions, performance, warnings, incident records, assets, work records).
4. **Settings → Lists:** edit leave types (paid or unpaid, with an optional yearly allowance), salary adjustment types, document types, asset types and employment types.
5. **Settings → Overtime:** set the weekly overtime threshold. A new threshold applies from a future week; past weeks keep theirs.
6. Create **Departments** and **Positions**.

## 2. People

- **Add an employee:** use **Employees → Add employee**. An administrator creates the login at the same time with a temporary password, which the employee must change at first sign-in.
- **Employee profile tabs:** Overview, Schedule, Attendance, Compensation and Incidents.
  - **Overview** holds personal details, employment history, account and access, private documents and the work timeline.
- **Documents:** staff upload PDFs or images to a profile. Documents are staff-only until explicitly released to the employee.
- **Account status:** set it on the profile, with a reason.
  - *On hold:* the employee can sign in and read, but cannot check in or update tasks.
  - *Suspended:* the employee cannot sign in at all.
- **Passwords:** an administrator opens **User accounts → Reset password** and gives the employee a temporary password through a trusted channel. It expires in 24 hours, and the employee must choose a new one when they sign in. Employees can change their own password under **Account settings**.

## 3. Schedules

**Schedules**, or the employee's Schedule tab, publishes recurring weekly periods: several per day if needed, including overnight periods ("ends next day"). A schedule can run for one week, every week, or every week until an end date. The **Mon–Sat default** button fills in a standard split shift quickly.

Published periods are never edited in place. To change future dates, publish a replacement; past attendance keeps the schedule it was recorded against.

## 4. Attendance

**Employees** use **My schedule**:
- **Check in:** opens a set number of minutes before each period starts (the early check-in window in Settings) and stays open until the period ends. Late arrivals are recorded.
- **Check out:** whenever the work ends, including after midnight. The time worked runs live on screen.
- **Start unscheduled work:** only on days with no assigned period. It is flagged for review.

All times come from the server clock in the organization's timezone.

**Staff** use **Attendance** and the dashboard:
- **Currently working** lists everyone with an open session, including sessions that started on an earlier day. It refreshes every 15 seconds and shows each session's status:
  - *within schedule*;
  - *past scheduled end — checkout pending*;
  - *unscheduled — review required*;
  - *incomplete — attention required*.
- **Open sessions requiring attention** lists the sessions to follow up. Nothing is closed automatically.
- **Attendance history** shows scheduled, required and actual time per employee and date, with late, early, missed and missing-checkout flags. Actual time counts completed sessions only.

**Corrections:**
- Employees request one under **Corrections**: add a missing session, replace times, or void a wrong record.
- Staff approve or reject it under **Corrections**.
- Official times are never edited directly; the original is kept in history.

**Shift swaps:** an employee proposes a swap, the colleague accepts, and staff approve it.

### Work time and missing time

**Work time** (under Attendance) compares each employee's *scheduled payable time* with their *verified work*:
- **Scheduled payable time** counts only the assigned periods. Breaks between periods are never expected work, and approved leave and holidays are credited rather than missing.
- **Missing time** is the scheduled time not covered by verified work: late arrival, early departure, absence, or confirmed time away. It is shown as **confirmed unpaid** only when nothing on that day is still open. An open session, a pending correction or an undecided report keeps the day **pending**, and nothing is deducted for it yet.
- **Recording time away:** when someone was away while still checked in, staff use **Work time → Missing-time records → Record missing time**. The time must fall inside a recorded session; a shortfall already visible from check-in and checkout needs no record. The employee sees every record under **Work time** and can respond once to explain or dispute it.
- **Confirming:** a reviewer then **confirms** the record, which makes the time unpaid, or **rejects** it, which has no effect. A decision can be reopened with a reason. Confirmed time is removed from verified work exactly once, even if records overlap other missing time, and it resets any unfinished salary month that covers it.
- **Closing a salary month:** while a report is still awaiting review, the month cannot be closed.

## 5. Overtime

Time above the weekly threshold, plus late or unscheduled work, becomes *potential* overtime after checkout. In **Overtime review**, staff open an employee's week and either approve some or all of the potential time, or reject it. Only approved time is paid; rejected time stays in history with zero pay. If the attendance changes later, the review is marked stale and must be done again.

## 6. Leave and holidays

- **Employees:** request leave in **Leave** by choosing the type and dates, and can withdraw a pending request.
- **Staff:** approve or reject requests in **Leave & holidays**, cancel an approval with a reason, and publish company holidays.
- **Balances:** choose an employee to see their yearly balance for each leave type. A per-employee allowance can be set there, and it overrides the leave type's default.
- **Pay effect:** approved paid leave and holidays count toward required time. They never count as hours worked.

## 7. Payroll (monthly)

1. Enter each employee's terms on their profile's **Compensation** tab: pay type (monthly, hourly or daily), the amount, the overtime hourly rate, and the effective date. Changes take effect from a date; history is kept.
2. Add bonuses, allowances or deductions in **Adjustments**. Each needs approval before it is included.
3. In **Salary & payments → New salary month**, calculate the month. The roster includes everyone employed during it.
4. Move the month through **Calculated → Reviewed → Approved → Finalized**. Anything unresolved blocks finalization:
   - open sessions;
   - pending corrections, leave or adjustments;
   - unreviewed overtime.
5. After paying people, use **Record payment** with the date and reference. The system never transfers money.
6. Download the **Payment register PDF**, the **Bank / mobile payment CSV** and individual **Payslip PDFs** from the month. Employees download their own payslips from **Salary & payslips**.

Finalized salaries never change. To fix one, add a correction to a later month.

## 8. Targets and performance ratings

Open **Ratings & targets** (HR records). The module can be switched off in Settings.

- **Targets:**
  - In **New target**, choose one or more employees, weekly or monthly, a date in the period, the target value and the unit. Each employee gets their own independent target.
  - Record the actual result with **Record result** once the period has started. Correcting a result needs a reason.
  - Only future targets can be edited; cancelled targets are not scored.
  - A target still awaiting its result keeps that month's rating *incomplete*; it never counts as zero.
- **Monthly ratings** (out of 10):
  - Open **Monthly ratings**, choose a month, and **Review** an employee. Enter the HR/Admin assessment, 0–5 in steps of 0.5; a score of 2 or lower needs a comment the employee can read. A private note is never shown to the employee.
  - The automated score (0–5) is calculated from the month's records:

    | Component | Points | Measured as |
    |---|---|---|
    | Work time | 2.50 | 70 % scheduled minutes completed, 30 % scheduled days attended |
    | Tasks | 1.25 | Tasks due in the month and completed on time |
    | Targets | 1.25 | Average of actual ÷ target, at most 100 % per target |

  - A component without data is *not applicable*, and its weight is shared by the others.
  - Each confirmed warning in the month (issued, released to the employee and not revoked) deducts the points set in **Settings → Ratings**. The default deductions are notice 0.10, warning 0.25, serious warning 0.50 and final warning 1.00. Deductions come only from the automated score, never below zero, and never touch pay.
- **Finalize** once the month has ended and every input is complete. A finalized rating is frozen with all its inputs; later changes do not alter it. Only an administrator can reopen it, with a reason.
- **Quarterly ranking:**
  - The quarterly rating is the average of the three finalized months, on the same 0–10 scale. Warning deductions are not applied again.
  - A quarter is *provisional* until all three months are finalized; missing months are not counted as zero.
  - Equal ratings share a rank, and the next rank is skipped (1, 1, 3).
- **Employees** see their own targets, finalized ratings with the full breakdown, and quarterly averages under **Ratings & targets**. They never see private notes or other employees' ratings.

## 9. HR records

- **Incidents & performance:** factual records of mistakes or achievements, with a review decision, corrective action and follow-up. Records can be shared with the employee, who can acknowledge them and respond. A record awaiting review is not a confirmed fault.
- **Performance:** reviews with ratings, released to the employee when finalized.
- **Warnings:** formal notices that the employee acknowledges as received (not agreed).
- **Assets:** issue and return company equipment.
- **Tasks:** assign tasks to employees and track completion.
- **Work records:** add achievements, training and notes to the employee timeline.

## 10. Reports, notifications and audit

- **Reports:** employees, attendance, weekly overtime, late and absent, leave, salary, commissions, document expiry and tasks. Each report can be filtered and exported to CSV, and some to PDF.
- **Notifications:** in-app alerts for approvals, decisions, missing checkouts and expiring documents. A daily job sends the date-based reminders.
- **Audit log:** an append-only history of every change, showing who made it and when, with the before and after values. Administrators see everything; HR sees operational areas.
