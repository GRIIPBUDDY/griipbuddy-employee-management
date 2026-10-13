import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { signedIn, login, sql, employeeId, confirm, expectToast, noHorizontalOverflow, qa } from "./helpers";
test("bulk task assignment creates independent assignments; one completion leaves the others unchanged", async ({ page }) => {
  const title = `E2E stock count ${Date.now()}`;
  await signedIn(page, "hr");
  await page.goto("/manage/tasks");
  await page.getByRole("button", { name: "Assign task" }).click();
  const dialog = page.getByRole("dialog", { name: "Assign a task" });
  await dialog.getByLabel("Title").fill(title); await dialog.getByLabel("Description").fill("Count the aisle stock.");
  for (const name of ["Alex Rahman", "Jordan Hasan", "Priya Sultana"]) await dialog.getByRole("checkbox", { name }).check();
  await expect(dialog.getByText("3 selected")).toBeVisible();
  await dialog.getByRole("button", { name: "Assign task" }).click(); await expectToast(page, "Task saved");
  await page.getByRole("search", { name: "Filters" }).getByLabel("Search").fill(title); await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByRole("region", { name: "Task assignments" }).locator("tbody tr")).toHaveCount(3);
  await signedIn(page, "employee");
  await page.goto("/me/tasks");
  await expect(page.getByRole("heading", { name: "Update the support handover notes" })).toBeVisible(); // older, overdue task is visible by default
  const card = page.locator("div[data-slot=card]").filter({ hasText: title });
  await card.getByRole("button", { name: "Mark complete" }).click();
  const complete = page.getByRole("dialog", { name: "Complete task" });
  await complete.getByLabel("Completion note").fill("Counted 120 units"); await complete.getByRole("button", { name: "Mark complete" }).click(); await confirm(page, "Complete task");
  await expectToast(page, "Task saved");
  const rows = await sql<{ number: string; status: string; note: string | null }>("SELECT e.employee_number AS number, t.status, t.completion_note AS note FROM task_assignments t JOIN employees e ON e.id=t.employee_id WHERE t.title=$1 ORDER BY 1", [title]);
  expect(rows).toEqual([{ number: "QA-001", status: "ASSIGNED", note: null }, { number: "QA-002", status: "COMPLETED", note: "Counted 120 units" }, { number: "QA-003", status: "ASSIGNED", note: null }]);
  // A colleague cannot complete another employee's assignment, even by ID.
  const foreign = (await sql<{ id: string }>("SELECT t.id FROM task_assignments t JOIN employees e ON e.id=t.employee_id WHERE t.title=$1 AND e.employee_number='QA-001'", [title]))[0].id;
  const api = await page.request.post("/api/me/tasks", { headers: { origin: new URL(page.url()).origin, "content-type": "application/json" }, data: { id: foreign, revision: 1, status: "COMPLETED", note: "" } });
  expect(api.status()).toBe(404);
  expect((await sql<{ status: string }>("SELECT status FROM task_assignments WHERE id=$1", [foreign]))[0].status).toBe("ASSIGNED");
});
test("leave: HR approves an employee request and the employee sees the decision", async ({ page }) => {
  await signedIn(page, "hr");
  await page.goto("/manage/leave?status=PENDING");
  await page.getByRole("row", { name: /Jordan Hasan/ }).getByRole("button", { name: "Review" }).click();
  const dialog = page.getByRole("dialog", { name: "Review leave request" });
  await dialog.getByLabel(/Review reason/).fill("Covered by the team");
  await dialog.getByRole("button", { name: "Approve leave request" }).click(); await confirm(page, "Confirm approval");
  await expect(dialog).not.toBeVisible();
  await signedIn(page, "employee"); await page.goto("/me/leave");
  await expect(page.getByRole("row", { name: /Annual/ })).toContainText("Approved");
});
test("private documents: staff upload and release; only the owner can download", async ({ page }) => {
  const pdf = await PDFDocument.create(); pdf.addPage([200, 200]); const bytes = Buffer.from(await pdf.save());
  await signedIn(page, "hr");
  await page.goto(`/manage/employees/${await employeeId("QA-002")}#documents`);
  await page.getByRole("button", { name: "Upload document" }).click();
  const dialog = page.getByRole("dialog", { name: "Upload a private document" });
  await dialog.getByLabel("Display name").fill("Synthetic contract"); await dialog.getByRole("combobox", { name: "Category", exact: true }).selectOption("EMPLOYMENT_CONTRACT");
  await dialog.locator("input[type=file]").setInputFiles({ name: "synthetic-contract.pdf", mimeType: "application/pdf", buffer: bytes });
  await dialog.getByLabel(/Release to the employee/).check();
  await dialog.getByRole("button", { name: "Upload document" }).click(); await expectToast(page, "Document uploaded");
  const doc = (await sql<{ id: string }>("SELECT id FROM employee_documents WHERE display_name='Synthetic contract' ORDER BY created_at DESC LIMIT 1"))[0].id;
  await signedIn(page, "employee"); await page.goto("/me/documents");
  await expect(page.getByRole("cell", { name: /Synthetic contract/ }).first()).toBeVisible();
  const own = await page.request.get(`/api/me/documents/${doc}`); expect(own.status()).toBe(200); expect(own.headers()["content-type"]).toContain("application/pdf");
  await signedIn(page, "colleague");
  expect((await page.request.get(`/api/me/documents/${doc}`)).status()).toBe(404);
  expect((await page.request.get(`/api/employees/${await employeeId("QA-002")}/documents/${doc}`)).status()).toBe(404);
  await page.context().clearCookies();
  expect((await page.request.get(`/api/me/documents/${doc}`, { maxRedirects: 0 })).status()).toBeGreaterThanOrEqual(300);
});
test("account status: admin puts an employee on hold (restricted) and reactivates; changes are audited", async ({ page }) => {
  const priya = await employeeId("QA-003");
  const change = async (to: string) => {
    await page.goto(`/manage/employees/${priya}#account`);
    await page.getByRole("button", { name: "Change account status" }).click();
    const dialog = page.getByRole("dialog", { name: "Change account status" });
    await dialog.getByLabel("New status").selectOption(to); await dialog.getByLabel("Internal reason").fill(`E2E ${to}`);
    await dialog.getByRole("button", { name: "Change status" }).click(); await confirm(page, "Confirm status change"); await expect(dialog).not.toBeVisible();
  };
  await signedIn(page, "admin"); await change("ON_HOLD");
  await signedIn(page, "colleague"); await expect(page.getByText("Your account is on hold").first()).toBeVisible();
  await signedIn(page, "admin"); await change("SUSPENDED");
  await login(page, "colleague"); await expect(page.getByRole("alert").filter({ hasText: "not accepted" }).first()).toBeVisible();
  await signedIn(page, "admin"); await change("ACTIVE");
  await signedIn(page, "colleague"); await expect(page.getByText("Your account is on hold")).toHaveCount(0);
  expect((await sql<{ c: number }>("SELECT count(*)::int AS c FROM audit_logs WHERE action='ACCOUNT_STATUS_CHANGED' AND employee_id=$1", [priya]))[0].c).toBe(3);
});
test("commission: admin approves a pre-order; the eligible employee requests a recheck that staff resolve", async ({ page }) => {
  await signedIn(page, "admin"); await page.goto("/manage/commissions");
  await page.getByRole("row", { name: /QA-PRE-1001/ }).getByRole("button", { name: "Review" }).click();
  const dialog = page.getByRole("dialog", { name: "Review pre-order" });
  await dialog.getByLabel("Review comment").fill("Order verified");
  await dialog.getByRole("button", { name: "Save decision" }).click(); await confirm(page, "Confirm decision"); await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("row", { name: /QA-PRE-1001/ })).toContainText("Approved");
  await signedIn(page, "commission"); await page.goto("/me/commissions");
  await expect(page.getByRole("row", { name: /QA-PRE-1001/ })).toContainText(/৳\s?500\.00/);
  await page.getByRole("button", { name: "Request recheck" }).click();
  const recheck = page.getByRole("dialog", { name: "Request a recheck" });
  await recheck.getByLabel(/^Reason\*?$/).fill("Order value was higher"); await recheck.getByRole("button", { name: "Submit request" }).click(); await expect(recheck).not.toBeVisible();
  await signedIn(page, "admin"); await page.goto("/manage/commissions");
  await page.getByRole("button", { name: "Resolve" }).click();
  const resolve = page.getByRole("dialog", { name: "Resolve recheck request" });
  await resolve.getByLabel("Explanation for the employee").fill("Amount confirmed against the order system.");
  await resolve.getByRole("button", { name: "Save resolution" }).click(); await confirm(page, "Resolve"); await expect(resolve).not.toBeVisible();
  expect((await sql<{ status: string }>("SELECT status FROM commission_rechecks ORDER BY created_at DESC LIMIT 1"))[0].status).toBe("CONFIRMED");
  expect((await sql<{ amount: string }>("SELECT commission_amount::text AS amount FROM preorders WHERE reference='QA-PRE-1001'"))[0].amount).toBe("500.00");
});
test("notifications are owned by the recipient; marking one read does not affect others", async ({ page }) => {
  await signedIn(page, "employee"); await page.goto("/notifications?status=UNREAD");
  const before = (await sql<{ c: number }>("SELECT count(*)::int AS c FROM notifications n JOIN users u ON u.id=n.recipient_user_id WHERE u.email=$1 AND n.read_at IS NULL", [qa.accounts.employee]))[0].c;
  await page.getByRole("button", { name: "Mark read" }).first().click(); await expectToast(page, "Saved");
  const after = (await sql<{ c: number }>("SELECT count(*)::int AS c FROM notifications n JOIN users u ON u.id=n.recipient_user_id WHERE u.email=$1 AND n.read_at IS NULL", [qa.accounts.employee]))[0].c;
  expect(after).toBe(before - 1);
  const foreign = (await sql<{ id: string }>("SELECT n.id FROM notifications n JOIN users u ON u.id=n.recipient_user_id WHERE u.email<>$1 LIMIT 1", [qa.accounts.employee]))[0].id;
  expect((await page.request.post(`/api/me/notifications/${foreign}`, { headers: { origin: new URL(page.url()).origin } })).status()).toBe(404);
});
test("mobile layout: no horizontal page scroll, and the navigation drawer works", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  await signedIn(page, "admin");
  for (const path of ["/dashboard", "/manage/employees", "/manage/attendance", "/manage/tasks", "/manage/overtime", "/manage/weekly-earnings", "/manage/reports/attendance"]) { await page.goto(path); await noHorizontalOverflow(page); }
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("dialog", { name: "Workspace navigation" }).getByRole("link", { name: "Tasks" }).click();
  await page.waitForURL(/\/manage\/tasks/); await expect(page.getByRole("dialog", { name: "Workspace navigation" })).not.toBeVisible();
  await signedIn(page, "employee");
  for (const path of ["/dashboard", "/me/schedule", "/me/tasks", "/me/weekly-earnings"]) { await page.goto(path); await noHorizontalOverflow(page); }
  await context.close();
});
