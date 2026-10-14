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

## 8. HR records

- **Incidents & performance:** factual records of mistakes or achievements, with a review decision, corrective action and follow-up. Records can be shared with the employee, who can acknowledge them and respond. A record awaiting review is not a confirmed fault.
- **Performance:** reviews with ratings, released to the employee when finalized.
- **Warnings:** formal notices that the employee acknowledges as received (not agreed).
- **Assets:** issue and return company equipment.
- **Tasks:** assign tasks to employees and track completion.
- **Work records:** add achievements, training and notes to the employee timeline.

## 9. Reports, notifications and audit

- **Reports:** employees, attendance, weekly overtime, late and absent, leave, salary, commissions, document expiry and tasks. Each report can be filtered and exported to CSV, and some to PDF.
- **Notifications:** in-app alerts for approvals, decisions, missing checkouts and expiring documents. A daily job sends the date-based reminders.
- **Audit log:** an append-only history of every change, showing who made it and when, with the before and after values. Administrators see everything; HR sees operational areas.
