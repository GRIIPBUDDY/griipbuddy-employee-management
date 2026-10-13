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
test("weekly earnings exclude rejected overtime and include approved overtime at the individual rate (BDT)", async ({ page }) => {
  const week = lastWeek();
  await signedIn(page, "admin");
  await page.goto("/manage/weekly-earnings");
  for (const [name, number] of [["Jordan Hasan", "QA-002"], ["Alex Rahman", "QA-001"]]) {
    const existing = (await sql<{ c: number }>("SELECT count(*)::int AS c FROM weekly_earning_statements w JOIN employees e ON e.id=w.employee_id WHERE e.employee_number=$1 AND w.week_start_date=$2", [number, week]))[0].c;
    if (existing) { await page.getByRole("row", { name: new RegExp(name) }).first().getByRole("button", { name: "Recalculate" }).click(); await expectToast(page, "Saved"); await page.waitForTimeout(1000); await page.reload(); continue; }
    await page.getByRole("button", { name: "Calculate a week" }).click();
    const dialog = page.getByRole("dialog", { name: "Calculate weekly earnings" });
    await dialog.getByLabel("Employee").selectOption({ label: name }); await dialog.getByLabel("Workweek start date").fill(week);
    await dialog.getByRole("button", { name: "Calculate" }).click(); await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(name) }).first()).toBeVisible();
  }
  const amounts = await sql<{ number: string; overtime: string; base: string }>("SELECT e.employee_number AS number, w.overtime_amount::text AS overtime, w.base_amount::text AS base FROM weekly_earning_statements w JOIN employees e ON e.id=w.employee_id WHERE w.week_start_date=$1 ORDER BY 1", [week]);
  expect(amounts.find(a => a.number === "QA-002")?.overtime).toBe("0.00");
  // Approved overtime pays at the individual hourly rate (৳150); potential = weekly threshold tail ∪ work outside scheduled periods.
  const [approved] = await sql<{ seconds: number }>("SELECT o.approved_seconds AS seconds FROM overtime_reviews o JOIN employees e ON e.id=o.employee_id WHERE e.employee_number='QA-001' AND o.week_start_date=$1", [week]);
  expect(approved.seconds).toBeGreaterThan(0);
  expect(amounts.find(a => a.number === "QA-001")?.overtime).toBe((approved.seconds / 3600 * 150).toFixed(2));
  const jordanRow = page.getByRole("row", { name: /Jordan Hasan/ }).first();
  await jordanRow.getByRole("button", { name: "Details" }).click();
  const details = page.getByRole("dialog").filter({ hasText: "Jordan Hasan" });
  await expect(details).toContainText("Approved overtime"); await expect(details).toContainText(/Approved overtime৳\s?0\.00/); await expect(details).toContainText("0h 00m");
  await details.getByRole("button", { name: "Close" }).click();
  // Review then finalize Jordan's week; finalization is not payment.
  await jordanRow.getByRole("button", { name: "Mark reviewed" }).click(); await confirm(page, "Mark reviewed");
  await expect(page.getByRole("row", { name: /Jordan Hasan/ }).first().getByRole("button", { name: "Finalize" })).toBeVisible();
  await page.getByRole("row", { name: /Jordan Hasan/ }).first().getByRole("button", { name: "Finalize" }).click(); await confirm(page, "Finalize"); await expectToast(page, "Saved");
  await expect(page.getByRole("row", { name: /Jordan Hasan/ }).first()).toContainText("Finalized");
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
