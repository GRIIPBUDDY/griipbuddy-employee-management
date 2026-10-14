import { test, expect, type Page } from "@playwright/test";
import { signedIn, sql, dhaka } from "./helpers";
async function sweep(page: Page) {
  const errors: string[] = []; page.on("console", m => { if (m.type() === "error") errors.push(`${page.url()}: ${m.text()}`); }); page.on("pageerror", e => errors.push(`${page.url()}: ${e.message}`));
  const links = await page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("link").evaluateAll(as => as.map(a => (a as HTMLAnchorElement).getAttribute("href")!));
  // The collapsible "My workspace" group may be closed; its links are covered by the employee sweep.
  for (const href of links) {
    const response = await page.goto(href); expect(response?.status(), href).toBe(200);
    await expect(page.getByRole("heading", { level: 1 }), href).toBeVisible();
  }
  expect(errors).toEqual([]);
  return links;
}
test("every Admin Panel section renders for an administrator", async ({ page }) => {
  await signedIn(page, "admin");
  const links = await sweep(page);
  for (const expected of ["/manage/employees", "/manage/departments", "/manage/positions", "/manage/documents", "/manage/work-records", "/manage/accounts", "/manage/schedule", "/manage/attendance", "/manage/corrections", "/manage/overtime", "/manage/shift-swaps", "/manage/tasks", "/manage/leave", "/manage/salary", "/manage/adjustments", "/manage/commissions", "/manage/performance", "/manage/warnings", "/manage/assets", "/manage/reports", "/manage/audit", "/manage/settings"]) expect(links).toContain(expected);
  expect(links).not.toContain("/manage/weekly-earnings"); // monthly pay: weekly statements are off by default
  for (const kind of ["employees", "attendance", "lateness", "overtime", "leave", "salary", "commissions", "documents", "tasks"]) { await page.goto(`/manage/reports/${kind}`); await expect(page.getByRole("heading", { level: 1 })).toContainText("report"); }
});
test("every employee portal section renders, with only permitted features", async ({ page }) => {
  await signedIn(page, "employee");
  const links = await sweep(page);
  expect(links).not.toContain("/me/commissions"); expect(links.some(l => l.startsWith("/manage"))).toBe(false);
  await signedIn(page, "commission");
  expect(await sweep(page)).toContain("/me/commissions");
});
test("HR / Manager sees operational sections without administrator-only areas", async ({ page }) => {
  await signedIn(page, "hr");
  const links = await sweep(page);
  expect(links).not.toContain("/manage/accounts"); expect(links).not.toContain("/manage/settings"); expect(links).not.toContain("/manage/commissions");
});
test("salary month: create, calculate the roster and review statements in BDT", async ({ page }) => {
  const today = dhaka().date, previous = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  await signedIn(page, "admin"); await page.goto("/manage/salary");
  await page.getByRole("button", { name: "New salary month" }).click();
  const dialog = page.getByRole("dialog", { name: "Create salary month" });
  const exists = (await sql<{ c: number }>("SELECT count(*)::int AS c FROM salary_periods WHERE start_date=$1::date", [`${previous}-01`]))[0].c;
  if (exists) await dialog.getByRole("button", { name: "Close" }).click(); else { await dialog.getByLabel("Salary month").fill(previous); await dialog.getByRole("button", { name: "Create month" }).click(); await expect(dialog).not.toBeVisible(); }
  const monthName = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${previous}-01T00:00:00Z`));
  await page.getByRole("row", { name: new RegExp(monthName) }).getByRole("link", { name: "Open" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(monthName);
  await page.getByRole("button", { name: /Calculate all employees/ }).click();
  await expect(page.getByRole("button", { name: /Recalculate all employees/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Employee calculations" })).toContainText("৳");
  const rows = await sql<{ c: number }>("SELECT count(*)::int AS c FROM salary_calculations c JOIN salary_periods p ON p.id=c.salary_period_id WHERE p.start_date=$1::date", [`${previous}-01`]);
  expect(rows[0].c).toBeGreaterThan(0);
  await page.getByRole("link", { name: "Statement" }).first().click();
  await expect(page.getByText(/Estimate|Finalized salary/).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("৳");
});
