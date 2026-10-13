import { test, expect, type Page } from "@playwright/test";
import { signedIn, login, sql, dhaka, confirm, expectToast, createEmployee } from "./helpers";
const status = (page: Page, text: RegExp) => page.getByRole("status").filter({ hasText: text });
test("Bug A: publishes a Mon–Sat split schedule with Sunday unchecked, then reports a repeat clearly without duplicates", async ({ page }) => {
  await signedIn(page, "admin");
  const { id } = await createEmployee(page, "Schedule");
  await page.goto(`/manage/employees/${id}/schedule`);
  await page.getByRole("button", { name: "Publish schedule" }).click();
  const dialog = page.getByRole("dialog", { name: "Publish a recurring schedule" });
  await dialog.getByRole("button", { name: "Mon–Sat default" }).click();
  await expect(status(page, /48h per week/)).toContainText("12 work periods");
  await dialog.getByRole("checkbox", { name: "Sunday", exact: true }).check();
  await expect(status(page, /56h per week/)).toContainText("14 work periods");
  await dialog.getByRole("checkbox", { name: "Sunday", exact: true }).uncheck();
  await expect(status(page, /48h per week/)).toContainText("Mon, Tue, Wed, Thu, Fri, Sat");
  await expect(dialog.getByLabel("Sunday period 1 start")).toHaveCount(0);
  await expect(dialog.getByLabel("Monday period 1 start")).toHaveValue("08:00");
  await expect(dialog.getByLabel("Monday period 2 end", { exact: true })).toHaveValue("20:00");
  await dialog.getByLabel(/^Reason\*?$/).fill("Weekly Work Hour");
  await dialog.getByRole("button", { name: "Publish schedule" }).click();
  await confirm(page, "Confirm");
  await expectToast(page, "Schedule published");
  await expect(page.getByRole("row", { name: /Weekly Work Hour/ })).toContainText("Active");
  const rows = await sql<{ weekday: number; c: number }>("SELECT s.weekday, count(*)::int AS c FROM schedule_slots s JOIN work_schedules w ON w.id=s.work_schedule_id WHERE w.employee_id=$1 GROUP BY 1 ORDER BY 1", [id]);
  expect(rows).toEqual([1, 2, 3, 4, 5, 6].map(weekday => ({ weekday, c: 2 })));
  // A second create for the same dates must fail with an actionable message and change nothing.
  await page.getByRole("button", { name: "New separate assignment" }).click();
  const again = page.getByRole("dialog", { name: "Publish a recurring schedule" });
  await again.getByLabel(/^Reason\*?$/).fill("Weekly Work Hour");
  await again.getByRole("button", { name: "Publish schedule" }).click(); await confirm(page, "Confirm");
  await expect(again.getByRole("alert").filter({ hasText: /existing assignment covers these dates/i }).first()).toBeVisible();
  expect((await sql<{ c: number }>("SELECT count(*)::int AS c FROM work_schedules WHERE employee_id=$1", [id]))[0].c).toBe(1);
  await again.getByRole("button", { name: "Close" }).click();
  // The supported path: change the current schedule from tomorrow (history is kept).
  await page.getByRole("button", { name: "Change schedule" }).click();
  const change = page.getByRole("dialog", { name: "Change the schedule" });
  await change.getByRole("button", { name: "Mon–Fri default" }).click();
  await change.getByLabel("Reason for the change").fill("Weekday pattern");
  await change.getByRole("button", { name: "Publish schedule change" }).click(); await confirm(page, "Confirm");
  await expect(page.getByRole("region", { name: "Schedule assignments" }).locator("tbody tr")).toHaveCount(2);
  await expect(page.getByRole("dialog", { name: "Change the schedule" })).not.toBeVisible();
  const versions = await sql<{ from: string; until: string | null }>("SELECT effective_from::text AS from, effective_until::text AS until FROM work_schedules WHERE employee_id=$1 AND superseded_at IS NULL ORDER BY effective_from", [id]);
  expect(versions).toHaveLength(2); expect(versions[0].until).toBe(versions[1].from); expect(versions[1].until).toBeNull();
});
test("creates a synthetic employee, assigns a period around now, and the employee checks in and out through the portal", async ({ page }) => {
  await signedIn(page, "admin");
  const { id, email, temporary, stamp } = await createEmployee(page, "Worker"), permanent = `Perm-Worker-${stamp}-ok!`;
  // Edit: preferred name.
  await page.goto(`/manage/employees/${id}/edit`); await page.getByLabel("Preferred name").fill("Worker"); await page.getByRole("button", { name: "Save profile" }).click(); await expectToast(page, "Employee profile updated");
  // One-week assignment for today's weekday with a period that started 5 minutes ago (late check-in allowed).
  const start = dhaka(-5), end = dhaka(55), crosses = end.date !== start.date;
  await page.goto(`/manage/employees/${id}/schedule`);
  await page.getByRole("button", { name: "Publish schedule" }).click();
  const dialog = page.getByRole("dialog", { name: "Publish a recurring schedule" });
  await dialog.getByRole("button", { name: "Clear all" }).click();
  const day = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][start.weekday - 1];
  await dialog.getByLabel("Default pattern start").fill("08:00");
  await dialog.getByRole("checkbox", { name: day, exact: true }).check();
  // Keep exactly one period for today and set it around now.
  await dialog.getByRole("button", { name: `Remove ${day} period 2` }).click();
  await dialog.getByLabel(`${day} period 1 start`, { exact: true }).fill(start.time); await dialog.getByLabel(`${day} period 1 end`, { exact: true }).fill(end.time);
  if (crosses) await dialog.getByLabel(`${day} period 1 ends next day`).check();
  await dialog.getByLabel("Recurrence").selectOption("WEEK");
  await dialog.getByLabel(/^Reason\*?$/).fill("E2E check-in window");
  await dialog.getByRole("button", { name: "Publish schedule" }).click(); await confirm(page, "Confirm");
  await expectToast(page, "Schedule published");
  // First sign-in requires replacing the temporary password.
  await login(page, email, temporary); await page.waitForURL(/change-password/);
  await page.locator("input[name=currentPassword]").fill(temporary); await page.locator("input[name=password]").fill(permanent); await page.locator("input[name=confirmPassword]").fill(permanent);
  await page.getByRole("button", { name: "Save password" }).click(); await page.waitForURL(/login/);
  await login(page, email, permanent); await page.waitForURL(/dashboard/);
  await page.goto("/me/schedule");
  await page.getByRole("button", { name: "Check in" }).click();
  await expectToast(page, "You are checked in");
  await expect(page.getByText("Currently working").first()).toBeVisible();
  expect((await sql<{ c: number }>("SELECT count(*)::int AS c FROM attendance_sessions WHERE employee_id=$1 AND checkout_at IS NULL", [id]))[0].c).toBe(1);
  // Duplicate check-in is not offered while a session is open.
  await expect(page.getByRole("button", { name: "Check in" })).toHaveCount(0);
  await page.waitForTimeout(1500); // official timestamps have whole-second resolution; checkout must be later than check-in
  await page.getByRole("button", { name: "Check out" }).click(); await confirm(page, "Check out");
  await expectToast(page, "You are checked out");
  const sessions = await sql<{ checkout_at: Date | null; schedule_slot_id: string | null }>("SELECT checkout_at, schedule_slot_id FROM attendance_sessions WHERE employee_id=$1", [id]);
  expect(sessions).toHaveLength(1); expect(sessions[0].checkout_at).not.toBeNull(); expect(sessions[0].schedule_slot_id).not.toBeNull();
  await page.goto("/me/attendance"); await expect(page.getByRole("region", { name: "Attendance sessions" })).toContainText("Completed");
  // The employee cannot edit official timestamps; only a correction request is offered.
  await expect(page.getByRole("link", { name: "Request correction" }).first()).toBeVisible();
});
