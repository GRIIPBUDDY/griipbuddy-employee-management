import { test, expect, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { signedIn, sql, confirm, expectToast, employeeId } from "./helpers";
// Incident & performance records through the real UI: staff create, review, attach private evidence, record a
// corrective action and share; the employee acknowledges and disputes; another employee sees nothing.
const title = `Wrong invoice price ${Date.now()}`;
async function openRecord(page: Page) {
  await page.goto(`/manage/incidents?search=${encodeURIComponent("Jordan")}`);
  await page.getByRole("row").filter({ hasText: title }).getByRole("link", { name: /Open/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(title);
}
test.describe.configure({ mode: "serial" });
test("staff create, review, attach evidence, record a corrective action and share an incident", async ({ page }) => {
  await signedIn(page, "admin"); await page.goto("/manage/incidents");
  await page.getByRole("button", { name: "New record" }).click();
  const create = page.getByRole("dialog", { name: "New incident or performance record" });
  const jordanOption = await create.locator("select[name=employeeId] option", { hasText: "Jordan Hasan" }).getAttribute("value");
  await create.locator("select[name=employeeId]").selectOption(jordanOption!);
  await create.locator("select[name=category]").selectOption("WORK_QUALITY"); await create.locator("select[name=severity]").selectOption("MEDIUM");
  await create.getByLabel(/^Short title/).fill(title);
  await create.getByLabel(/What happened/).fill("Invoice 1042 used the wholesale price instead of retail.");
  await create.getByLabel(/Internal notes/).fill("Private: second similar case this month.");
  await create.getByRole("button", { name: "Save draft" }).click(); await expect(create).not.toBeVisible(); await expectToast(page, "Record created as a draft.");
  await openRecord(page);
  await expect(page.getByText("Private: second similar case this month.")).toBeVisible();
  await page.getByRole("button", { name: "Submit for review" }).click(); await confirm(page, "Submit"); await expectToast(page, "Submitted for review.");
  await expect(page.getByText("This record is not a confirmed fault until a reviewer records a decision.")).toBeVisible();
  // Private evidence through the existing document storage.
  const pdf = await PDFDocument.create(); pdf.addPage(); const bytes = Buffer.from(await pdf.save());
  await page.locator("input[name=file]").setInputFiles({ name: "invoice-1042.pdf", mimeType: "application/pdf", buffer: bytes });
  await page.getByRole("button", { name: "Upload evidence" }).click(); await expectToast(page, "Evidence uploaded privately and linked.");
  await expect(page.locator("div[data-slot=card]").filter({ has: page.getByRole("heading", { name: "Evidence" }) }).getByRole("link", { name: "Download" })).toBeVisible();
  await page.getByRole("button", { name: "Record decision" }).click();
  const decide = page.getByRole("dialog", { name: "Review decision" });
  await decide.locator("select[name=decision]").selectOption("CONFIRMED"); await decide.getByLabel(/Decision note/).fill("Confirmed against the invoice log.");
  await decide.getByRole("button", { name: "Save decision" }).click(); await confirm(page, "Save decision"); await expect(decide).not.toBeVisible();
  await page.getByRole("button", { name: "Record corrective action" }).click();
  const action = page.getByRole("dialog", { name: "Corrective action" });
  await action.locator("select[name=action]").selectOption("COACHING"); await action.getByLabel(/Details/).fill("Pricing refresher with the team lead.");
  await action.getByRole("button", { name: "Save action" }).click(); await expect(action).not.toBeVisible(); await expectToast(page, "Corrective action recorded.");
  await page.getByRole("checkbox", { name: "Share with the employee" }).check(); await page.getByRole("checkbox", { name: /Invite the employee/ }).check();
  await page.getByRole("button", { name: "Save access" }).click(); await confirm(page, "Save access"); await expectToast(page, "Employee access updated.");
  const [row] = await sql<{ status: string; visible: boolean; requested: boolean; evidence: string | null }>("SELECT status, employee_visible AS visible, response_requested AS requested, evidence_document_id AS evidence FROM incident_records WHERE title=$1", [title]);
  expect(row).toMatchObject({ status: "CONFIRMED", visible: true, requested: true }); expect(row.evidence).toBeTruthy();
  // The evidence document is private: no public URL, staff-only document.
  const [doc] = await sql<{ visible: boolean; type: string }>("SELECT employee_visible AS visible, type FROM employee_documents WHERE id=$1", [row.evidence]);
  expect(doc).toEqual({ visible: false, type: "INCIDENT_EVIDENCE" });
});
test("the employee acknowledges receipt and disputes the record; internal notes stay hidden", async ({ page }) => {
  await signedIn(page, "employee"); await page.goto("/me/incidents");
  const card = page.locator("div[data-slot=card]").filter({ hasText: title });
  await expect(card).toContainText("Invoice 1042 used the wholesale price"); await expect(card).toContainText("Confirmed against the invoice log.");
  await expect(page.getByText("second similar case")).toHaveCount(0); // internal notes never reach the employee
  await expect(card).not.toContainText("invoice-1042.pdf"); // staff-only evidence is not offered
  await card.getByRole("button", { name: "Acknowledge receipt" }).click(); await confirm(page, "Acknowledge"); await expectToast(page, /Receipt acknowledged/);
  await card.getByLabel("I dispute this record").check(); await card.getByLabel(/Your explanation/).fill("The price list I was given was outdated.");
  await card.getByRole("button", { name: "Submit response" }).click(); await confirm(page, "Submit response"); await expectToast(page, "Your response was recorded.");
  await page.reload();
  await expect(page.locator("div[data-slot=card]").filter({ hasText: title })).toContainText("You dispute this record");
  await page.goto("/notifications"); await expect(page.getByText("An incident record was shared with you.").first()).toBeVisible();
});
test("another employee cannot see or open the record, its evidence or staff pages", async ({ page }) => {
  const [row] = await sql<{ id: string; evidence: string }>("SELECT id, evidence_document_id AS evidence FROM incident_records WHERE title=$1", [title]);
  const jordan = await employeeId("QA-002");
  await signedIn(page, "colleague"); await page.goto("/me/incidents");
  await expect(page.getByText(title)).toHaveCount(0);
  await page.goto(`/me/incidents?id=${row.id}`); await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
  await page.goto(`/manage/incidents/${row.id}`); await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Access unavailable|Page not found/);
  for (const url of [`/api/me/documents/${row.evidence}`, `/api/employees/${jordan}/documents/${row.evidence}`]) expect([403, 404]).toContain((await page.request.get(url)).status());
});
test("staff see the response and dispute, complete the follow-up, resolve, and find it on the employee profile", async ({ page }) => {
  await signedIn(page, "hr"); await openRecord(page);
  await expect(page.getByText("Employee disputes this record")).toBeVisible(); await expect(page.getByText("The price list I was given was outdated.")).toBeVisible();
  await page.getByRole("button", { name: "Mark follow-up complete" }).click();
  const done = page.getByRole("dialog", { name: "Complete the corrective action" }); await done.getByRole("button", { name: "Mark complete" }).click(); await expect(done).not.toBeVisible();
  await page.getByRole("button", { name: "Resolve" }).click();
  const resolve = page.getByRole("dialog", { name: "Resolve this record" }); await resolve.getByLabel(/^Resolution/).fill("Price list updated; coaching completed.");
  await resolve.getByRole("button", { name: "Resolve record" }).click(); await expect(resolve).not.toBeVisible(); await expectToast(page, "Record resolved.");
  await page.reload();
  for (const entry of ["Record created", "Submitted for review", "Review decision: Confirmed", "Evidence attached", "Corrective action recorded", "Employee access changed", "Employee acknowledged receipt", "Employee response submitted", "Follow-up completed", "Resolved"]) await expect(page.locator("div[data-slot=card]").filter({ has: page.getByRole("heading", { name: "History" }) }).getByText(entry, { exact: true })).toBeVisible();
  const jordan = await employeeId("QA-002");
  await page.goto(`/manage/employees/${jordan}/incidents?severity=MEDIUM&state=RESOLVED`);
  await expect(page.getByRole("row").filter({ hasText: title })).toContainText("Resolved");
  await page.goto(`/manage/employees/${jordan}/incidents?severity=CRITICAL`); await expect(page.getByRole("row").filter({ hasText: title })).toHaveCount(0);
});
