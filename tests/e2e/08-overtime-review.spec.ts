import { test, expect, type Page } from "@playwright/test";
import { signedIn, login, sql, confirm, expectToast, createEmployee } from "./helpers";
// Overtime review through the real UI for the week that is still running: the employee works unscheduled time and
// checks out (which calculates the open week), then staff approve one record and reject another.
async function firstLogin(page: Page, email: string, temporary: string, permanent: string) {
  await login(page, email, temporary); await page.waitForURL(/change-password/);
  await page.locator("input[name=currentPassword]").fill(temporary); await page.locator("input[name=password]").fill(permanent); await page.locator("input[name=confirmPassword]").fill(permanent);
  await page.getByRole("button", { name: "Save password" }).click(); await page.waitForURL(/login/);
  await login(page, email, permanent); await page.waitForURL(/dashboard/);
}
/** Creates an employee without a schedule who records a short unscheduled session; returns the pending review row. */
async function workedOvertime(page: Page, label: string) {
  await signedIn(page, "admin");
  const { id, email, temporary, stamp } = await createEmployee(page, label);
  await firstLogin(page, email, temporary, `Perm-${label}-${stamp}-ok!`);
  await page.goto("/me/schedule");
  await page.getByRole("button", { name: "Start unscheduled work" }).click(); await confirm(page, /Confirm|Start/); await expectToast(page, /checked in|unscheduled/i);
  await page.waitForTimeout(2200);
  await page.getByRole("button", { name: "Check out" }).first().click(); await confirm(page, "Check out"); await expectToast(page, /checked out/i);
  await expect.poll(async () => (await sql<{ status: string }>("SELECT status FROM overtime_reviews WHERE employee_id=$1", [id]))[0]?.status).toBe("PENDING");
  const [row] = await sql<{ id: string; week: string; potential: number }>("SELECT id, week_start_date::text AS week, potential_seconds_snapshot AS potential FROM overtime_reviews WHERE employee_id=$1", [id]);
  return { id, email, permanent: `Perm-${label}-${stamp}-ok!`, row, name: `E2E ${label} ${stamp}` };
}
async function decide(page: Page, employeeName: string, decision: "Approve" | "Reject", comment: string) {
  await page.goto("/manage/overtime?status=PENDING");
  await page.getByRole("row").filter({ hasText: employeeName }).getByRole("link", { name: /Review/ }).click();
  await page.getByRole("button", { name: "Review overtime" }).click();
  const dialog = page.getByRole("dialog", { name: "Overtime decision" });
  await expect(dialog).toContainText("Unscheduled"); // the reviewer sees the work was outside any schedule
  await dialog.getByRole("radio", { name: decision }).check();
  await dialog.getByLabel(/Review reason/).fill(comment);
  await dialog.getByRole("button", { name: `${decision} overtime` }).click(); await confirm(page, decision === "Reject" ? "Confirm rejection" : "Confirm approval");
  return dialog;
}
test("open-week overtime: staff approve one record and reject another; decisions persist and reach the employee", async ({ page }) => {
  const approved = await workedOvertime(page, "OtApprove"), rejected = await workedOvertime(page, "OtReject");
  await signedIn(page, "admin");
  const approveDialog = await decide(page, approved.name, "Approve", "Approved by manager in advance");
  await expect(approveDialog).not.toBeVisible(); await expectToast(page, "Overtime approved");
  await signedIn(page, "hr"); // an authorized HR / Manager reviews the second record
  const rejectDialog = await decide(page, rejected.name, "Reject", "Not authorized");
  await expect(rejectDialog).not.toBeVisible(); await expectToast(page, "Overtime rejected");
  // Persisted after reload, with reviewer, comment and audit evidence; original attendance unchanged.
  await page.reload();
  const rows = await sql<{ employee: string; status: string; approved: number; potential: number; comment: string; reviewer: string }>("SELECT employee_id::text AS employee, status, approved_seconds AS approved, potential_seconds_snapshot AS potential, review_comment AS comment, (SELECT email FROM users WHERE id=reviewed_by) AS reviewer FROM overtime_reviews WHERE employee_id = ANY($1::uuid[])", [[approved.id, rejected.id]]);
  const a = rows.find(r => r.employee === approved.id)!, r = rows.find(x => x.employee === rejected.id)!;
  expect(a).toMatchObject({ status: "APPROVED", comment: "Approved by manager in advance" }); expect(a.approved).toBe(a.potential);
  expect(r).toMatchObject({ status: "REJECTED", approved: 0, comment: "Not authorized" });
  expect([a.reviewer, r.reviewer]).toEqual(["admin@qa.example.test", "hr@qa.example.test"]);
  expect((await sql<{ c: number }>("SELECT count(*)::int AS c FROM audit_logs WHERE entity='overtime_reviews' AND action IN ('OVERTIME_APPROVED','OVERTIME_REJECTED') AND employee_id = ANY($1::uuid[])", [[approved.id, rejected.id]]))[0].c).toBe(2);
  expect((await sql<{ c: number }>("SELECT count(*)::int AS c FROM attendance_sessions WHERE employee_id=$1 AND voided_at IS NULL AND checkout_at IS NOT NULL", [rejected.id]))[0].c).toBe(1);
  // Neither record is pending any more.
  await page.goto("/manage/overtime?status=PENDING");
  await expect(page.getByRole("row").filter({ hasText: approved.name })).toHaveCount(0); await expect(page.getByRole("row").filter({ hasText: rejected.name })).toHaveCount(0);
  // The employee sees the outcome on their overtime page and in notifications.
  await login(page, rejected.email, rejected.permanent); await page.waitForURL(/dashboard/);
  await page.goto("/me/overtime"); await expect(page.getByText("Overtime rejected")).toBeVisible();
  await page.goto("/notifications"); await expect(page.getByText("Your weekly overtime review was rejected.")).toBeVisible();
});
test("employees cannot open overtime review or decide overtime through the API", async ({ page }) => {
  await signedIn(page, "employee");
  await page.goto("/manage/overtime"); await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Access unavailable|Page not found/);
  const [pending] = await sql<{ id: string; revision: number }>("SELECT id, revision FROM overtime_reviews ORDER BY created_at DESC LIMIT 1");
  test.skip(!pending, "Needs an overtime record from the workflow test.");
  const response = await page.request.post(`/api/manage/overtime/${pending.id}`, { data: { revision: pending.revision, decision: "REJECTED", approvedSeconds: 0, comment: "Not mine" }, headers: { origin: new URL(page.url()).origin } });
  expect(response.status()).toBe(403);
});
