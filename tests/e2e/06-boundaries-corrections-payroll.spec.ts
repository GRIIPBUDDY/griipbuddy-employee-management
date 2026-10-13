import { test, expect, type Page } from "@playwright/test";
import { signedIn, login, sql, dhaka, addDays, weekStart, confirm, expectToast, createEmployee, employeeId } from "./helpers";
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
async function firstLogin(page: Page, email: string, temporary: string, permanent: string) {
  await login(page, email, temporary); await page.waitForURL(/change-password/);
  await page.locator("input[name=currentPassword]").fill(temporary); await page.locator("input[name=password]").fill(permanent); await page.locator("input[name=confirmPassword]").fill(permanent);
  await page.getByRole("button", { name: "Save password" }).click(); await page.waitForURL(/login/);
  await login(page, email, permanent); await page.waitForURL(/dashboard/);
}
test("early check-in opens 10 minutes before a period and not earlier (server time, Asia/Dhaka)", async ({ page }) => {
  const now = dhaka(), soon = dhaka(8), soonEnd = dhaka(30), later = dhaka(45), laterEnd = dhaka(75);
  test.skip(new Set([now.date, soon.date, laterEnd.date]).size > 1, "Window would cross local midnight; rerun later.");
  await signedIn(page, "admin");
  const { id, email, temporary, stamp } = await createEmployee(page, "Early");
  await page.goto(`/manage/employees/${id}/schedule`);
  await page.getByRole("button", { name: "Publish schedule" }).click();
  const dialog = page.getByRole("dialog", { name: "Publish a recurring schedule" }), day = weekdays[now.weekday - 1];
  await dialog.getByRole("button", { name: "Clear all" }).click(); await dialog.getByLabel("Default pattern start").fill("08:00");
  await dialog.getByRole("checkbox", { name: day, exact: true }).check();
  for (const [index, [start, end]] of [[soon, soonEnd], [later, laterEnd]].entries()) { await dialog.getByLabel(`${day} period ${index + 1} start`, { exact: true }).fill(start.time); await dialog.getByLabel(`${day} period ${index + 1} end`, { exact: true }).fill(end.time); }
  await dialog.getByLabel("Recurrence").selectOption("WEEK"); await dialog.getByLabel(/^Reason\*?$/).fill("E2E early check-in window");
  await dialog.getByRole("button", { name: "Publish schedule" }).click(); await confirm(page, "Confirm"); await expect(dialog).not.toBeVisible();
  await firstLogin(page, email, temporary, `Perm-Early-${stamp}-ok!`);
  await page.goto("/me/schedule");
  const today = page.locator("div[data-slot=card]").filter({ hasText: "Today ·" }), first = today.locator("div.rounded-lg.border").filter({ hasText: `${soon.time}–${soonEnd.time}` }), second = today.locator("div.rounded-lg.border").filter({ hasText: `${later.time}–${laterEnd.time}` });
  await expect(first).toContainText("Ready to check in"); await expect(first.getByRole("button", { name: "Check in" })).toBeVisible();
  await expect(second).toContainText("Upcoming"); await expect(second.getByRole("button", { name: "Check in" })).toHaveCount(0);
  await first.getByRole("button", { name: "Check in" }).click(); await expectToast(page, "You are checked in");
  const [session] = await sql<{ early: boolean }>("SELECT checkin_at < scheduled_start_at AS early FROM attendance_sessions WHERE employee_id=$1", [id]);
  expect(session.early).toBe(true); // checked in before the scheduled start, inside the 10-minute window
});
test("attendance correction: employee requests a missing session, HR approves, official attendance updates", async ({ page }) => {
  const date = addDays(weekStart(dhaka().date), -9); // a past weekday with no recorded attendance
  const priya = await employeeId("QA-003"), before = (await sql<{ c: number }>("SELECT count(*)::int AS c FROM attendance_sessions WHERE employee_id=$1", [priya]))[0].c;
  await signedIn(page, "colleague"); await page.goto("/me/corrections");
  await page.getByRole("button", { name: "New correction request" }).click();
  const dialog = page.getByRole("dialog", { name: "Request an attendance correction" });
  await dialog.getByRole("radio", { name: /Missing session/ }).check(); await dialog.getByLabel("Work date").fill(date);
  await dialog.getByLabel("Actual check-in").fill(`${date}T09:00`); await dialog.getByLabel("Actual checkout").fill(`${date}T12:00`);
  await dialog.getByLabel("Explanation and supporting evidence").fill("Forgot to check in; supervisor confirmed.");
  await dialog.getByRole("button", { name: "Submit correction request" }).click(); await expect(dialog).not.toBeVisible();
  await expect(page.locator("div[data-slot=card]").filter({ hasText: date }).first()).toContainText("Pending");
  expect((await sql<{ c: number }>("SELECT count(*)::int AS c FROM attendance_sessions WHERE employee_id=$1", [priya]))[0].c).toBe(before); // not applied before review
  await signedIn(page, "hr"); await page.goto("/manage/corrections?status=PENDING");
  await page.locator("div[data-slot=card]").filter({ hasText: "Priya Sultana" }).filter({ hasText: date }).getByRole("button", { name: "Review request" }).click();
  const review = page.getByRole("dialog", { name: "Review attendance correction" });
  await review.getByLabel(/Review reason/).fill("Confirmed with supervisor"); await review.getByRole("button", { name: "Approve attendance correction" }).click(); await confirm(page, "Confirm approval");
  await expect(review).not.toBeVisible();
  const sessions = await sql<{ source: string; hours: number }>("SELECT source, extract(epoch FROM checkout_at-checkin_at)/3600 AS hours FROM attendance_sessions WHERE employee_id=$1 AND work_date=$2::date", [priya, date]);
  expect(sessions).toHaveLength(1); expect(Number(sessions[0].hours)).toBe(3);
  expect((await sql<{ c: number }>("SELECT count(*)::int AS c FROM audit_logs WHERE employee_id=$1 AND action LIKE 'CORRECTION%APPROVED%'", [priya]))[0].c).toBeGreaterThanOrEqual(1);
  await page.goto(`/manage/employees/${priya}/attendance?range=date&date=${date}`); await expect(page.getByRole("navigation", { name: "Pagination" })).toContainText("1 sessions");
});
test("compensation: staff replace terms from a future date with history retained; employees cannot edit", async ({ page }) => {
  const priya = await employeeId("QA-003"), today = dhaka().date, from = `${addDays(`${today.slice(0, 7)}-28`, 7).slice(0, 7)}-01`;
  await signedIn(page, "admin"); await page.goto(`/manage/employees/${priya}/compensation`);
  const current = page.getByRole("row").filter({ hasText: "Current" }).first();
  await current.getByRole("button", { name: "Change" }).click();
  const dialog = page.getByRole("dialog", { name: "Replace part or all of these terms" });
  await dialog.getByLabel("Effective from").fill(from); await dialog.getByLabel(/Basic amount/).fill("32000"); await dialog.getByLabel(/Overtime hourly rate/).fill("175");
  await dialog.getByLabel("Reason for these terms").fill("Annual review (synthetic)");
  await dialog.getByRole("button", { name: "Save compensation terms" }).click(); await confirm(page, "Save terms"); await expect(dialog).not.toBeVisible();
  const rates = await sql<{ from: string; until: string | null; base: string; ot: string | null; superseded: boolean }>("SELECT effective_from::text AS from, effective_until::text AS until, base_amount::text AS base, overtime_hourly_rate::text AS ot, superseded_at IS NOT NULL AS superseded FROM compensation_rates WHERE employee_id=$1 ORDER BY created_at", [priya]);
  expect(rates.some(r => r.from === from && r.base.startsWith("32000") && r.ot?.startsWith("175"))).toBe(true);
  expect(rates.some(r => r.base.startsWith("30000"))).toBe(true); // previous terms retained
  await expect(page.getByRole("region", { name: "Compensation history" })).toContainText("৳");
  await signedIn(page, "colleague"); await page.goto("/me/compensation");
  await expect(page.getByRole("region", { name: "Compensation history" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Change|Add terms/ })).toHaveCount(0);
});
test("monthly salary: review, approve, finalize, then record the actual payment", async ({ page }) => {
  const [{ effective }] = await sql<{ effective: string }>("SELECT earnings_effective_from::text AS effective FROM organization_settings WHERE id=1");
  const month = new Date(Date.UTC(Number(effective.slice(0, 4)), Number(effective.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7); // a fully ended month on the monthly method
  const monthName = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
  await signedIn(page, "admin"); await page.goto("/manage/salary");
  if (!(await sql<{ c: number }>("SELECT count(*)::int AS c FROM salary_periods WHERE start_date=$1::date", [`${month}-01`]))[0].c) {
    await page.getByRole("button", { name: "New salary month" }).click(); const create = page.getByRole("dialog", { name: "Create salary month" });
    await create.getByLabel("Salary month").fill(month); await create.getByRole("button", { name: "Create month" }).click(); await expect(create).not.toBeVisible();
  }
  await page.getByRole("row", { name: new RegExp(monthName) }).getByRole("link", { name: "Open" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(monthName);
  const step = async (button: RegExp, label: string, status: string) => { await page.getByRole("button", { name: button }).click(); await confirm(page, label); await expect.poll(async () => (await sql<{ status: string }>("SELECT status FROM salary_periods WHERE start_date=$1::date", [`${month}-01`]))[0].status).toBe(status); await page.reload(); };
  await page.getByRole("button", { name: /Calculate all employees/ }).click();
  await expect.poll(async () => (await sql<{ status: string }>("SELECT status FROM salary_periods WHERE start_date=$1::date", [`${month}-01`]))[0].status).toBe("CALCULATED"); await page.reload();
  await expect(page.getByRole("region", { name: "Employee calculations" })).toContainText("৳");
  await step(/Complete review/, "Complete review", "REVIEWED");
  await step(/Approve salary month/, "Approve", "APPROVED");
  await step(/Finalize salary month/, "Finalize salary", "FINALIZED");
  await expect(page.getByText("Salary is finalized but not marked paid")).toBeVisible();
  const [{ unpaid }] = await sql<{ unpaid: string }>("SELECT payment_status AS unpaid FROM salary_periods WHERE start_date=$1::date", [`${month}-01`]); expect(unpaid).toBe("UNPAID");
  await page.getByRole("button", { name: "Record payment" }).click();
  const pay = page.getByRole("dialog", { name: `Record payment for ${monthName}` });
  const paidAt = `${addDays(dhaka().date, -1)}T10:30`;
  await pay.getByLabel("Payment date and time").fill(paidAt); await pay.getByLabel("Payment reference").fill("SYNTH-BATCH-001");
  await pay.getByRole("button", { name: "Record payment" }).click(); await confirm(page, "Mark paid"); await expect(pay).not.toBeVisible();
  const [paid] = await sql<{ status: string; reference: string; paid: string }>("SELECT payment_status AS status, payment_reference AS reference, to_char(paid_at AT TIME ZONE 'Asia/Dhaka','YYYY-MM-DD\"T\"HH24:MI') AS paid FROM salary_periods WHERE start_date=$1::date", [`${month}-01`]);
  expect(paid).toEqual({ status: "PAID", reference: "SYNTH-BATCH-001", paid: paidAt }); // recorded as organization-local time
  await expect(page.getByText("Payment recorded")).toBeVisible();
  // Finalized statements are immutable: no recalculation is offered.
  await expect(page.getByRole("button", { name: /Recalculate all employees/ })).toHaveCount(0);
  await signedIn(page, "employee"); await page.goto("/me/salary");
  await expect(page.getByRole("row", { name: new RegExp(monthName) })).toContainText("Paid");
});
