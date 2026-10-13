import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { signedIn, login, sql, dhaka, addDays, weekStart, confirm, expectToast, createEmployee, employeeId } from "./helpers";
// Configurable organization through the real UI: branding, rules, module switches, editable lists, leave balances,
// the live check-in clock, payout details and branded PDF/CSV documents.
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
async function download(page: Page, trigger: () => Promise<void>) {
  const [file] = await Promise.all([page.waitForEvent("download"), trigger()]);
  return { name: file.suggestedFilename(), bytes: readFileSync((await file.path())!) };
}
test("sign-in and navigation show the organization logo and name; branding validates readable colors", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("main img[src^='/brand/logo']").first()).toBeVisible();
  await signedIn(page, "admin");
  await expect(page.locator("aside img[src^='/brand/logo']")).toBeVisible();
  await page.goto("/manage/settings#branding");
  await expect(page.locator("input[name=companyLegalName]")).toHaveValue("GRIIPBUDDY LLC");
  await expect(page.locator("textarea[name=companyAddress]")).toHaveValue("1021 E Lincolnway, Cheyenne, Wyoming 82001, United States");
  await page.locator("#brandColor").fill("#ffee00");
  await expect(page.getByText("Choose a darker color so white text on buttons stays readable.")).toBeVisible();
  await page.getByRole("button", { name: "Save branding" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /darker color/ })).toBeVisible();
  await page.locator("#brandColor").fill("#4b2a5e"); await page.getByRole("button", { name: "Save branding" }).click(); await expectToast(page, "Branding saved.");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim())).toBe("#4b2a5e");
});
test("modules: switching Tasks off removes it from menus and its pages, then restores it", async ({ page }) => {
  await signedIn(page, "admin"); await page.goto("/manage/settings#modules");
  await page.getByRole("checkbox", { name: /^Tasks/ }).uncheck(); await page.getByRole("button", { name: "Save modules" }).click(); await confirm(page, "Confirm"); await expectToast(page, "Modules updated.");
  await page.goto("/dashboard");
  await expect(page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("link", { name: "Tasks", exact: true })).toHaveCount(0);
  await page.goto("/manage/tasks"); await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
  await signedIn(page, "employee"); await page.goto("/me/tasks"); await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
  await signedIn(page, "admin"); await page.goto("/manage/settings#modules");
  await page.getByRole("checkbox", { name: /^Tasks/ }).check(); await page.getByRole("button", { name: "Save modules" }).click(); await confirm(page, "Confirm"); await expectToast(page, "Modules updated.");
  await page.goto("/manage/tasks"); await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tasks");
});
test("lists and balances: a new leave type with a yearly allowance blocks requests over the balance", async ({ page }) => {
  await signedIn(page, "admin"); await page.goto("/manage/settings#lists");
  if (!(await sql<{ c: number }>("SELECT count(*)::int AS c FROM option_items WHERE list='LEAVE_CATEGORY' AND code='STUDY'"))[0].c) {
    await page.locator("div[data-slot=card]").filter({ has: page.getByRole("heading", { name: "Leave types" }) }).getByRole("button", { name: "Add" }).click();
    const add = page.getByRole("dialog", { name: "Add to leave types" });
    await add.getByLabel(/^Label/).fill("Study leave"); await add.getByLabel(/^Code/).fill("STUDY"); await add.getByLabel(/Yearly allowance/).fill("2");
    await add.getByRole("button", { name: "Add option" }).click(); await expect(add).not.toBeVisible();
  }
  await expect(page.getByRole("region", { name: "Leave types" })).toContainText("2 days a year");
  const monday = addDays(weekStart(dhaka().date), 14), wednesday = addDays(monday, 2);
  await signedIn(page, "colleague"); await page.goto("/me/leave");
  await expect(page.locator("div[data-slot=card]").filter({ hasText: "Leave balance" })).toContainText("Study leave");
  const ask = async (last: string) => {
    await page.getByRole("button", { name: "Request leave" }).click(); const dialog = page.getByRole("dialog", { name: "Request leave" });
    await dialog.getByLabel("First day").fill(monday); await dialog.getByLabel("Last day (inclusive)").fill(last);
    await dialog.locator("select[name=category]").selectOption({ value: "STUDY" }); await dialog.getByLabel(/^Reason/).fill("Exam preparation");
    await dialog.getByRole("button", { name: "Submit leave request" }).click(); return dialog;
  };
  const tooLong = await ask(wednesday);
  await expect(tooLong.getByRole("alert")).toContainText("Not enough leave balance"); await tooLong.getByRole("button", { name: "Close" }).click();
  const ok = await ask(monday); await expect(ok).not.toBeVisible();
  await expect(page.locator("div[data-slot=card]").filter({ hasText: "Leave balance" })).toContainText("1 pending");
});
test("live clock: time worked keeps running after check-in without a page refresh", async ({ page }) => {
  const now = dhaka(), start = dhaka(5), end = dhaka(60);
  test.skip(new Set([now.date, end.date]).size > 1, "Window would cross local midnight; rerun later.");
  await signedIn(page, "admin");
  const { id, email, temporary, stamp } = await createEmployee(page, "Clock");
  await page.goto(`/manage/employees/${id}/schedule`); await page.getByRole("button", { name: "Publish schedule" }).click();
  const dialog = page.getByRole("dialog", { name: "Publish a recurring schedule" }), day = weekdays[now.weekday - 1];
  await dialog.getByRole("button", { name: "Clear all" }).click(); await dialog.getByRole("checkbox", { name: day, exact: true }).check();
  await dialog.getByLabel(`${day} period 1 start`, { exact: true }).fill(start.time); await dialog.getByLabel(`${day} period 1 end`, { exact: true }).fill(end.time);
  await dialog.getByLabel("Recurrence").selectOption("WEEK"); await dialog.getByLabel(/^Reason\*?$/).fill("E2E live clock");
  await dialog.getByRole("button", { name: "Publish schedule" }).click(); await confirm(page, "Confirm"); await expect(dialog).not.toBeVisible();
  await login(page, email, temporary); await page.waitForURL(/change-password/);
  const permanent = `Perm-Clock-${stamp}-ok!`;
  await page.locator("input[name=currentPassword]").fill(temporary); await page.locator("input[name=password]").fill(permanent); await page.locator("input[name=confirmPassword]").fill(permanent);
  await page.getByRole("button", { name: "Save password" }).click(); await page.waitForURL(/login/); await login(page, email, permanent); await page.waitForURL(/dashboard/);
  await page.goto("/me/schedule"); await page.getByRole("button", { name: "Check in" }).first().click(); await expectToast(page, "You are checked in");
  const clock = page.locator("time[datetime^='PT']").first();
  await expect(clock).toBeVisible(); const first = await clock.getAttribute("datetime");
  await page.waitForTimeout(2500);
  expect(Number((await clock.getAttribute("datetime"))!.slice(2, -1))).toBeGreaterThan(Number(first!.slice(2, -1))); // ticks without reload
  await expect(clock).toHaveText(/^\d+h \d{2}m \d{2}s$/);
});
test("payout details are staff-only; payslips, payment CSV, register and report PDFs download", async ({ page }) => {
  const jordan = await employeeId("QA-002");
  await signedIn(page, "admin"); await page.goto(`/manage/employees/${jordan}/compensation`);
  await page.locator("div[data-slot=card]").filter({ has: page.getByRole("heading", { name: "Salary payment details" }) }).getByRole("button", { name: /Add payment details|Change/ }).click();
  const payout = page.getByRole("dialog", { name: "Salary payment details" });
  await payout.getByLabel("Payment method").selectOption("BKASH"); await payout.getByLabel("Account name").fill("Jordan Hasan"); await payout.getByLabel("Account / wallet number").fill("01700000002");
  await payout.getByLabel(/Reason for the change/).fill("Employee payment form"); await payout.getByRole("button", { name: "Save payment details" }).click(); await expect(payout).not.toBeVisible();
  await expect(page.locator("div[data-slot=card]").filter({ hasText: "Salary payment details" })).toContainText("01700000002");
  const final = await sql<{ id: string; month: string }>("SELECT id, to_char(start_date,'YYYY-MM') AS month FROM salary_periods WHERE status='FINALIZED' ORDER BY start_date DESC LIMIT 1");
  test.skip(!final.length, "Needs a finalized salary month (created by the payroll workflow spec).");
  await page.goto(`/manage/salary?id=${final[0].id}`);
  const csv = await download(page, () => page.getByRole("link", { name: "Bank / mobile payment CSV" }).click());
  expect(csv.name).toBe(`salary-payments-${final[0].month}.csv`); expect(csv.bytes.toString()).toContain("Payment method"); expect(csv.bytes.toString()).toContain("01700000002");
  const register = await download(page, () => page.getByRole("link", { name: "Payment register PDF" }).click());
  expect(register.bytes.subarray(0, 5).toString()).toBe("%PDF-");
  await page.goto("/manage/reports/lateness"); await expect(page.getByRole("heading", { level: 1 })).toHaveText("Late & absence report");
  const report = await download(page, () => page.getByRole("link", { name: "Download PDF" }).click());
  expect(report.bytes.subarray(0, 5).toString()).toBe("%PDF-");
  await signedIn(page, "employee"); await page.goto("/me/salary");
  const slip = await download(page, () => page.getByRole("link", { name: "Payslip PDF" }).first().click());
  expect(slip.name).toMatch(/^payslip-\d{4}-\d{2}-QA-002\.pdf$/); expect(slip.bytes.subarray(0, 5).toString()).toBe("%PDF-");
  // Employees cannot open staff payout details or another person's payslip.
  expect((await page.request.get(`/api/manage/salary/${final[0].id}/payments`)).status()).toBe(403);
});
