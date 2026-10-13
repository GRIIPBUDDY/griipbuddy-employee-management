import { test, expect } from "@playwright/test";
import { login, signedIn, qa, sql } from "./helpers";
test("rejects a wrong password without revealing whether the account exists", async ({ page }) => {
  await login(page, "admin", "definitely-not-the-password");
  await expect(page.getByRole("alert").filter({ hasText: "Email or password was not accepted" }).first()).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
test("remember me issues a 30-day session; a normal sign-in issues a 12-hour session; sign-out clears it", async ({ page, context }) => {
  const sessionCookie = async () => (await context.cookies()).find(c => c.name.includes("session-token"));
  await login(page, "hr"); await page.waitForURL(/\/dashboard/);
  const normal = await sessionCookie(); expect(normal).toBeTruthy(); expect(normal!.httpOnly).toBe(true);
  expect(normal!.expires * 1000 - Date.now()).toBeLessThan(13 * 3600_000);
  await login(page, "hr", qa.password, true); await page.waitForURL(/\/dashboard/);
  const remembered = await sessionCookie();
  expect(remembered!.expires * 1000 - Date.now()).toBeGreaterThan(29 * 86400_000);
  await page.getByRole("button", { name: "Open profile menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/);
  await page.goto("/dashboard"); await expect(page).toHaveURL(/\/login/);
});
test("suspended accounts cannot sign in", async ({ page }) => {
  await login(page, "suspended");
  await expect(page.getByRole("alert").filter({ hasText: "not accepted" }).first()).toBeVisible();
});
test("on-hold accounts keep personal access but cannot check in or update tasks", async ({ page }) => {
  await signedIn(page, "onhold");
  await expect(page.getByText("Your account is on hold").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Check in" })).toHaveCount(0);
  await page.goto("/me/tasks?status=");
  await expect(page.getByRole("button", { name: /Mark complete|Start task/ })).toHaveCount(0);
  await page.goto("/me"); await expect(page.getByRole("heading", { level: 1 })).toContainText("Nadia Karim");
});
test("role navigation: employees see no management areas and no hidden commission feature", async ({ page }) => {
  await signedIn(page, "employee");
  const nav = page.getByRole("navigation", { name: "Workspace navigation" });
  await expect(nav).toContainText("Schedule"); await expect(nav).not.toContainText("Employees");
  const html = await page.content();
  expect(html).not.toMatch(/commission|pre-order|preorder/i);
  for (const path of ["/manage/employees", "/manage/salary", "/manage/settings"]) { const response = await page.goto(path); expect(response?.status()).toBe(403); await expect(page.getByRole("heading", { name: "Access unavailable" })).toBeVisible(); }
  const hidden = await page.goto("/me/commissions"); expect(hidden?.status()).toBe(404);
  await expect(page.locator("body")).not.toContainText(/commission/i);
  const api = await page.request.get("/api/me/commissions"); expect(api.status()).toBe(404); expect(await api.text()).not.toMatch(/commission/i);
});
test("commission-enabled employees see only their own pre-order records", async ({ page }) => {
  await signedIn(page, "commission");
  await page.getByRole("link", { name: "Pre-order commission" }).click();
  await expect(page.getByRole("cell", { name: /QA-PRE-1001/ })).toBeVisible();
  const ids = await sql<{ id: string }>("SELECT p.id FROM preorders p JOIN employees e ON e.id=p.employee_id WHERE e.employee_number<>'QA-001'");
  for (const { id } of ids) expect((await page.request.get(`/api/me/commissions/${id}`)).status()).toBe(404);
});
test("HR without the commission grant cannot open commission management", async ({ page }) => {
  await signedIn(page, "hr");
  await expect(page.getByRole("navigation", { name: "Workspace navigation" })).not.toContainText("Pre-order");
  expect((await page.goto("/manage/commissions"))?.status()).toBe(403);
});
test("administrators can change their own login email with password re-authentication and keep their role", async ({ page }) => {
  test.skip(process.env.E2E_PROD === "1", "Production builds refuse the development-only email preview; run against `npm run qa:local` (dev mode) or a configured delivery adapter.");
  const original = qa.accounts.admin, changed = `admin.e2e.${Date.now()}@qa.example.test`;
  const cycle = async (from: string, to: string) => {
    await login(page, from); await page.waitForURL(/\/dashboard/);
    await page.goto("/account-settings");
    await page.getByLabel("New email").fill(to); await page.getByLabel("Current password").fill(qa.password);
    await page.getByRole("button", { name: "Send verification link" }).click();
    const message = page.getByRole("status").filter({ hasText: "Development only verification" }).first();
    await expect(message).toBeVisible();
    const link = (await message.innerText()).match(/https?:\/\/\S+/)![0];
    await page.goto(link); await page.getByRole("button", { name: "Confirm email change" }).click();
    await expect(page.getByRole("status").filter({ hasText: "login address changed" }).first()).toBeVisible();
    await login(page, to); await page.waitForURL(/\/dashboard/);
    await expect(page.getByRole("navigation", { name: "Workspace navigation" })).toContainText("User accounts");
  };
  await page.goto("/login"); await login(page, original); await page.waitForURL(/\/dashboard/);
  await page.goto("/account-settings"); await page.getByLabel("New email").fill(changed); await page.getByLabel("Current password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Send verification link" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Current password was not accepted" }).first()).toBeVisible();
  await cycle(original, changed);
  expect((await sql<{ c: string }>("SELECT count(*)::text AS c FROM users WHERE email=$1 AND role='ADMIN'", [changed]))[0].c).toBe("1");
  await cycle(changed, original);
  expect((await sql<{ c: string }>("SELECT count(*)::text AS c FROM users WHERE role='ADMIN'"))[0].c).toBe("1");
});
