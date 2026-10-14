import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { signedIn, sql, confirm, expectToast, dhaka, addDays, noHorizontalOverflow, login } from "./helpers";
// Live workforce monitor through the real UI: an employee's check-in and checkout reach the Admin dashboard and the
// Attendance page without a reload; failed refreshes keep the last result; employees cannot read the list.
const live = (page: Page) => page.getByTestId("live-workforce");
const row = (page: Page, name: string) => live(page).getByRole("row").filter({ hasText: name });
const metric = (page: Page, label: string) => live(page).getByText(label, { exact: true }).locator("xpath=following-sibling::p[1]");
test.describe.configure({ mode: "serial" });
let night = "";
test("a session that started yesterday stays visible after midnight and on today's attendance filters", async ({ page }) => {
  await signedIn(page, "admin");
  // A synthetic employee who joined yesterday, created through the real Add employee form.
  const stamp = `${Date.now().toString().slice(-7)}`, yesterday = addDays(dhaka().date, -1);
  night = `E2E night ${stamp}`;
  await page.goto("/manage/employees/new");
  await page.getByLabel("Employee ID").fill(`E2E-N${stamp}`); await page.getByLabel("Full legal name").fill(night);
  await page.getByLabel("Join date").fill(yesterday);
  await page.getByRole("combobox", { name: "Department", exact: true }).selectOption({ label: "Operations" }); await page.getByRole("combobox", { name: "Position", exact: true }).selectOption({ label: "Operations associate" });
  await page.getByLabel("New login email").fill(`e2e.night.${stamp}@qa.example.test`); await page.getByLabel("Temporary password").fill(`Temp-night-${stamp}-${randomUUID().slice(0, 8)}`);
  await page.getByRole("button", { name: "Create employee" }).click();
  await page.waitForURL(/\/manage\/employees\/[0-9a-f-]{36}$/);
  const person = { id: page.url().split("/").at(-1)! };
  // Disposable QA database only: an unscheduled session from 22:00 yesterday (local), never checked out. The
  // application has no way to backdate a check-in, so this synthetic record is inserted directly.
  const [period] = await sql<{ id: string; created_by: string }>("SELECT id, created_by FROM employment_periods WHERE employee_id=$1", [person.id]);
  const start = new Date(`${yesterday}T16:00:00Z`); // 22:00 Asia/Dhaka
  await sql(`INSERT INTO attendance_sessions (id,employee_id,employment_period_id,work_date,timezone_snapshot,rules_version_snapshot,early_checkin_minutes_snapshot,checkin_at,source,created_by,checkin_operation_key,revision,created_at,updated_at)
    VALUES ($1,$2,$3,$4,'Asia/Dhaka',1,10,$5,'UNSCHEDULED',$6,$7,1,now(),now())`, [randomUUID(), person.id, period.id, yesterday, start, period.created_by, randomUUID()]);
  await page.goto("/dashboard");
  await expect(row(page, night)).toContainText("Started on an earlier day");
  await expect(row(page, night)).toContainText(/Unscheduled session|Incomplete session/);
  // Historical filters on the Attendance page do not hide the open session.
  for (const query of ["", "?range=today", `?range=date&date=${addDays(dhaka().date, -3)}`]) {
    await page.goto(`/manage/attendance${query}`);
    await expect(row(page, night)).toBeVisible();
    await expect(page.getByTestId("live-attention").getByRole("row").filter({ hasText: night })).toContainText(`Open since ${yesterday}`);
  }
});
test("check-in appears and checkout disappears on the open Admin dashboard without a reload", async ({ page, browser }) => {
  await signedIn(page, "admin"); await page.goto("/dashboard");
  await expect(live(page)).toBeVisible();
  await expect(row(page, "Taylor Schedule")).toHaveCount(0);
  const before = Number(await metric(page, "Working now").textContent());
  await page.evaluate(() => { (window as unknown as { marker: string }).marker = "same-document"; });
  const employee = await browser.newContext({ baseURL: test.info().project.use.baseURL }), worker = await employee.newPage();
  await signedIn(worker, "schedule"); await worker.goto("/me/schedule");
  await worker.getByRole("button", { name: "Start unscheduled work" }).click(); await confirm(worker, "Start session");
  await expectToast(worker, "Unscheduled session started");
  // Automatic refresh (every 15 s) picks it up; the page itself is never reloaded.
  await expect(row(page, "Taylor Schedule")).toContainText("Unscheduled session — review required", { timeout: 25_000 });
  await expect(metric(page, "Working now")).toHaveText(String(before + 1));
  expect(await page.evaluate(() => (window as unknown as { marker?: string }).marker)).toBe("same-document");
  const [session] = await sql<{ checkin_at: Date }>("SELECT s.checkin_at FROM attendance_sessions s JOIN employees e ON e.id=s.employee_id WHERE e.employee_number='QA-006' AND s.checkout_at IS NULL");
  const local = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(session.checkin_at);
  await expect(row(page, "Taylor Schedule")).toContainText(local); // server check-in time in organization-local time
  // The Attendance page shows the same open session.
  const attendance = await page.context().newPage(); await attendance.goto("/manage/attendance");
  await expect(row(attendance, "Taylor Schedule")).toBeVisible(); await attendance.close();
  // Checkout: removed after the server confirms, picked up by the next refresh.
  await worker.waitForTimeout(1500);
  await worker.getByRole("button", { name: "Check out" }).click(); await confirm(worker, "Check out"); await expectToast(worker, "You are checked out");
  await page.getByRole("button", { name: "Refresh currently working list" }).click();
  await expect(row(page, "Taylor Schedule")).toHaveCount(0);
  await expect(metric(page, "Working now")).toHaveText(String(before));
  // The completed session stays in history.
  await page.goto(`/manage/attendance?range=today&employeeId=${(await sql<{ id: string }>("SELECT id FROM employees WHERE employee_number='QA-006'"))[0].id}`);
  await expect(page.getByRole("region", { name: "Attendance by employee and date" })).toContainText("Taylor Schedule");
  await employee.close();
});
test("manual refresh, failed refresh and hidden-tab pause", async ({ page }) => {
  await signedIn(page, "hr"); await page.goto("/manage/attendance");
  const stamp = live(page).locator("time").first(), first = await stamp.getAttribute("datetime");
  await page.waitForTimeout(1100);
  await page.getByRole("button", { name: "Refresh currently working list" }).click();
  await expect(stamp).not.toHaveAttribute("datetime", first!);
  // A failed refresh keeps the last confirmed list and says so; it never shows zero people working.
  const working = await metric(page, "Working now").textContent();
  await page.route("**/api/manage/live-workforce", route => route.abort("internetdisconnected"));
  await page.getByRole("button", { name: "Refresh currently working list" }).click();
  await expect(live(page).getByRole("alert")).toContainText("Could not refresh");
  await expect(metric(page, "Working now")).toHaveText(working!);
  await expect(row(page, night)).toBeVisible();
  await page.unroute("**/api/manage/live-workforce");
  await page.getByRole("button", { name: "Refresh currently working list" }).click();
  await expect(live(page).getByRole("alert")).toHaveCount(0);
  // Hidden tab: no polling. Visible again: one immediate refresh.
  let requests = 0; page.on("request", r => { if (r.url().includes("/api/manage/live-workforce")) requests++; });
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.waitForTimeout(17_000);
  expect(requests).toBe(0);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect.poll(() => requests, { timeout: 5_000 }).toBe(1);
});
test("filters, empty filter state and mobile layout", async ({ page }) => {
  await signedIn(page, "admin"); await page.goto("/dashboard");
  await live(page).getByLabel("Search").fill("no-such-person");
  await expect(live(page)).toContainText("No one matches these filters");
  await live(page).getByLabel("Search").fill(night.split(" ").at(-1)!);
  await expect(row(page, night)).toBeVisible();
  await live(page).getByLabel("Search").fill("");
  await live(page).getByLabel("Status").selectOption("WITHIN_SCHEDULE");
  await expect(row(page, night)).toHaveCount(0);
  await live(page).getByLabel("Status").selectOption("ATTENTION");
  await expect(row(page, night)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/dashboard", "/manage/attendance"]) { await page.goto(path); await expect(live(page)).toBeVisible(); await noHorizontalOverflow(page); }
});
test("employees cannot read the company-wide live list", async ({ page }) => {
  await login(page, "employee"); await page.waitForURL(/\/dashboard/);
  await expect(page.getByTestId("live-workforce")).toHaveCount(0);
  for (const query of ["", "?employeeId=00000000-0000-4000-8000-000000000000", "?status=ATTENTION"]) {
    const response = await page.request.get(`/api/manage/live-workforce${query}`);
    expect(response.status()).toBe(403);
    expect(await response.text()).not.toContain("Taylor");
  }
  await page.goto("/manage/attendance"); await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Access unavailable|Page not found/);
});
