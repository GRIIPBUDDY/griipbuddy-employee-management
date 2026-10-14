import { test, expect } from "@playwright/test";
import { signedIn, sql, employeeId, dhaka, addDays, weekStart, confirm, expectToast } from "./helpers";
const lastWeek = () => addDays(weekStart(dhaka().date), -7);
test("Bug B: HR rejects overtime; it persists, is audited, notifies the employee and pays nothing", async ({ page }) => {
  const jordan = await employeeId("QA-002"), week = lastWeek();
  const sessionsBefore = (await sql<{ c: number }>("SELECT count(*)::int AS c FROM attendance_sessions WHERE employee_id=$1", [jordan]))[0].c;
  await signedIn(page, "hr");
  await page.goto("/manage/overtime?status=PENDING");
  await page.getByRole("row", { name: /Jordan Hasan/ }).getByRole("link", { name: /Review/ }).click();
  await page.getByRole("button", { name: "Review overtime" }).click();
  const dialog = page.getByRole("dialog", { name: "Overtime decision" });
  await dialog.getByRole("radio", { name: "Reject" }).check();
  await expect(dialog.getByText("approves zero hours")).toBeVisible();
  await expect(dialog.getByLabel("Hours")).toHaveCount(0);
  await dialog.getByLabel(/Review reason/).fill("Overtime was not pre-approved");
  await dialog.getByRole("button", { name: "Reject overtime" }).click();
  await confirm(page, "Confirm rejection");
  await expectToast(page, "Overtime rejected");
  await page.reload();
  await expect(page.getByText("Overtime rejected").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Review overtime" })).toHaveCount(0);
  const [row] = await sql<{ status: string; approved_seconds: number; review_comment: string }>("SELECT status, approved_seconds, review_comment FROM overtime_reviews WHERE employee_id=$1 AND week_start_date=$2", [jordan, week]);
  expect(row).toMatchObject({ status: "REJECTED", approved_seconds: 0, review_comment: "Overtime was not pre-approved" });
  expect((await sql<{ c: number }>("SELECT count(*)::int AS c FROM audit_logs WHERE action='OVERTIME_REJECTED' AND employee_id=$1", [jordan]))[0].c).toBe(1);
  expect((await sql<{ c: number }>("SELECT count(*)::int AS c FROM notifications WHERE employee_id=$1 AND event_type='OVERTIME_DECIDED'", [jordan]))[0].c).toBe(1);
  expect((await sql<{ c: number }>("SELECT count(*)::int AS c FROM attendance_sessions WHERE employee_id=$1", [jordan]))[0].c).toBe(sessionsBefore);
  // Approve the other employee for comparison.
  await page.goto("/manage/overtime?status=PENDING");
  await page.getByRole("row", { name: /Alex Rahman/ }).getByRole("link", { name: /Review/ }).click();
  await page.getByRole("button", { name: "Review overtime" }).click();
  const approve = page.getByRole("dialog", { name: "Overtime decision" });
  await approve.getByLabel(/Review reason/).fill("Approved by operations lead");
  await approve.getByRole("button", { name: "Approve overtime" }).click(); await confirm(page, "Confirm approval");
  await expectToast(page, "Overtime approved");
  // Employee sees the persisted rejection on their own page.
  await signedIn(page, "employee");
  await page.goto(`/me/overtime?week=${week}`);
  await expect(page.getByText("Overtime rejected").first()).toBeVisible();
  await expect(page.getByText("Overtime was not pre-approved")).toBeVisible();
});
test("monthly salary excludes rejected overtime and pays approved overtime at the individual rate (BDT)", async ({ page }) => {
  // Salary is monthly: the overtime week's approved hours flow into the month(s) its days belong to.
  const week = lastWeek(), months = [...new Set([week.slice(0, 7), addDays(week, 6).slice(0, 7)])];
  await signedIn(page, "admin");
  for (const month of months) {
    if (!(await sql<{ c: number }>("SELECT count(*)::int AS c FROM salary_periods WHERE start_date=$1::date", [`${month}-01`]))[0].c) {
      await page.goto("/manage/salary"); await page.getByRole("button", { name: "New salary month" }).click();
      const create = page.getByRole("dialog", { name: "Create salary month" }); await create.getByLabel("Salary month").fill(month); await create.getByRole("button", { name: "Create month" }).click(); await expect(create).not.toBeVisible();
    }
    const [{ id, status }] = await sql<{ id: string; status: string }>("SELECT id, status FROM salary_periods WHERE start_date=$1::date", [`${month}-01`]);
    if (status === "FINALIZED") continue;
    await page.goto(`/manage/salary?id=${id}`); await page.getByRole("button", { name: /Calculate all employees|Recalculate all employees/ }).click();
    await expect(page.getByRole("button", { name: /Recalculate all employees/ })).toBeVisible();
    const [{ method }] = await sql<{ method: string }>("SELECT calculation_method AS method FROM salary_periods WHERE id=$1", [id]); expect(method).toBe("MONTHLY_ATTENDANCE");
  }
  const rows = await sql<{ number: string; overtime: string; seconds: string }>("SELECT e.employee_number AS number, c.overtime_amount::text AS overtime, (SELECT coalesce(sum((s->>'approvedOvertimeSeconds')::int),0) FROM jsonb_array_elements(c.calculation_snapshot->'segments') s WHERE (s->>'date')::date>=$2::date AND (s->>'date')::date<$2::date+7)::text AS seconds FROM salary_calculations c JOIN salary_periods p ON p.id=c.salary_period_id JOIN employees e ON e.id=c.employee_id WHERE p.start_date = ANY($1::date[])", [months.map(m => `${m}-01`), week]);
  const total = (number: string) => rows.filter(r => r.number === number).reduce((n, r) => n + Number(r.seconds), 0);
  expect(total("QA-002")).toBe(0); // rejected overtime pays nothing
  const [approved] = await sql<{ seconds: number }>("SELECT o.approved_seconds AS seconds FROM overtime_reviews o JOIN employees e ON e.id=o.employee_id WHERE e.employee_number='QA-001' AND o.week_start_date=$1", [week]);
  expect(approved.seconds).toBeGreaterThan(0); expect(total("QA-001")).toBe(approved.seconds);
  const paid = rows.filter(r => r.number === "QA-001").reduce((n, r) => n + Number(r.overtime), 0);
  expect(Math.abs(paid - approved.seconds / 3600 * 150)).toBeLessThan(0.02); // ৳150 individual rate; per-month rounding
  await page.goto("/manage/weekly-earnings"); await expect(page.getByRole("heading", { level: 1 })).toHaveText(/not found|Page not found/i); // weekly statements are switched off
});
test("Bug C: attendance review shows only the chosen date, inclusive ranges, and no unscheduled empty dates", async ({ page }) => {
  const week = lastWeek(), tuesday = addDays(week, 1), saturday = addDays(week, 5), sunday = addDays(week, 6), monday = addDays(week, 7);
  await signedIn(page, "admin");
  await page.goto("/manage/attendance");
  await page.getByRole("combobox", { name: "Dates", exact: true }).selectOption("date"); await page.getByLabel(/^Date\*?$/).fill(tuesday);
  await page.getByRole("button", { name: "Apply" }).click(); await page.waitForURL(/range=date/);
  const dates = await page.getByRole("region", { name: "Attendance by employee and date" }).locator("tbody tr td:nth-child(2)").allInnerTexts();
  expect(dates.length).toBeGreaterThan(0); expect(new Set(dates)).toEqual(new Set([tuesday]));
  await page.getByRole("combobox", { name: "Dates", exact: true }).selectOption("custom"); await page.getByLabel("From").fill(saturday); await page.getByLabel("To (inclusive)").fill(monday);
  await page.getByRole("button", { name: "Apply" }).click(); await page.waitForURL(/range=custom/);
  const ranged = new Set(await page.getByRole("region", { name: "Attendance by employee and date" }).locator("tbody tr td:nth-child(2)").allInnerTexts());
  expect(ranged.has(saturday)).toBe(true); expect(ranged.has(monday)).toBe(true); expect(ranged.has(sunday)).toBe(false);
  await page.getByLabel("Dates shown").selectOption("ALL"); await page.getByRole("button", { name: "Apply" }).click(); await page.waitForURL(/days=ALL/);
  expect(new Set(await page.getByRole("region", { name: "Attendance by employee and date" }).locator("tbody tr td:nth-child(2)").allInnerTexts()).has(sunday)).toBe(true);
  // Invalid range: an inline explanation instead of a 404 page.
  await page.goto(`/manage/attendance?range=custom&from=${monday}&to=${saturday}`);
  await expect(page.getByRole("alert").filter({ hasText: "on or after the start date" }).first()).toBeVisible();
  // Per-employee attendance honours the selected week (previously ignored).
  await page.goto(`/manage/employees/${await employeeId("QA-002")}/attendance?range=week&date=${tuesday}`);
  await expect(page.getByRole("navigation", { name: "Pagination" })).toContainText("12 sessions");
  await page.goto(`/manage/employees/${await employeeId("QA-002")}/attendance?range=date&date=${sunday}`);
  await expect(page.getByText("No attendance sessions")).toBeVisible();
  // The attendance report agrees.
  await page.goto(`/manage/reports/attendance?range=date&date=${tuesday}`);
  await expect(page.getByRole("region", { name: "Report results" })).toBeVisible(); // streamed after the loading skeleton
  const reportDates = await page.getByRole("region", { name: "Report results" }).locator("tbody tr td:nth-child(3)").allInnerTexts();
  expect(reportDates.length).toBeGreaterThan(0); expect(new Set(reportDates)).toEqual(new Set([tuesday]));
});
