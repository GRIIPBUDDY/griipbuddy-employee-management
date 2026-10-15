import { test, expect, type Page } from "@playwright/test";
import { signedIn, sql, confirm, expectToast, employeeId, dhaka, addDays, weekStart, noHorizontalOverflow } from "./helpers";
// Work-time accounting and performance ratings through the real UI, with synthetic QA people only:
// a 210-of-240-minute period, confirmed time away (and its exact pay effect), weekly and monthly targets, tasks,
// a confirmed warning, three finalized months, the quarterly average and ranking, and the employee's own view.
test.describe.configure({ mode: "serial" });
const card = (page: Page, name: string) => page.locator("div[data-slot=card]").filter({ has: page.getByRole("heading", { name, exact: true }) });
const today = dhaka().date, monday = weekStart(today);
const shortDate = addDays(monday, -10), awayDate = addDays(monday, -7); // Priya: a scheduled day without attendance; Jordan: seeded attendance
const [cy, cm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))], prev = (Math.ceil(cm / 3) - 2 + 4) % 4 + 1, py = prev === 4 ? cy - 1 : cy;
const months = [0, 1, 2].map(i => `${py}-${String((prev - 1) * 3 + 1 + i).padStart(2, "0")}`), quarter = `${py}-Q${prev}`;
async function correction(page: Page, date: string, from: string, until: string) {
  await page.getByRole("button", { name: "New correction request" }).click();
  const dialog = page.getByRole("dialog", { name: "Request an attendance correction" });
  await dialog.getByRole("radio", { name: /Missing session/ }).check(); await dialog.getByLabel("Work date").fill(date);
  await dialog.getByLabel("Actual check-in").fill(`${date}T${from}`); await dialog.getByLabel("Actual checkout").fill(`${date}T${until}`);
  await dialog.getByLabel("Explanation and supporting evidence").fill("Forgot to check in; supervisor confirmed the times.");
  await dialog.getByRole("button", { name: "Submit correction request" }).click(); await expect(dialog).not.toBeVisible();
}
test("a 210-of-240-minute period shows 30 minutes missing and unpaid; the break is not missing", async ({ page }) => {
  await signedIn(page, "colleague"); await page.goto("/me/corrections");
  await correction(page, shortDate, "08:00", "11:30"); await correction(page, shortDate, "16:00", "20:00");
  await signedIn(page, "hr"); await page.goto("/manage/corrections?status=PENDING");
  for (let i = 0; i < 2; i++) {
    await page.locator("div[data-slot=card]").filter({ hasText: "Priya Sultana" }).filter({ hasText: shortDate }).first().getByRole("button", { name: "Review request" }).click();
    const review = page.getByRole("dialog", { name: "Review attendance correction" });
    await review.getByLabel(/Review reason/).fill("Confirmed with supervisor"); await review.getByRole("button", { name: "Approve attendance correction" }).click(); await confirm(page, "Confirm approval");
    await expect(review).not.toBeVisible();
  }
  const priya = await employeeId("QA-003");
  await page.goto(`/manage/work-time?range=date&date=${shortDate}&employeeId=${priya}`);
  const c = card(page, "Priya Sultana");
  await expect(c.getByRole("region", { name: "Work time by day" })).toContainText(shortDate);
  const row = c.getByRole("row").filter({ hasText: shortDate });
  // Scheduled 8 h (08:00–12:00 and 16:00–20:00; the four-hour gap is an unpaid break), verified 7 h 30 m, 30 m missing and unpaid.
  await expect(row).toContainText("8h 00m"); await expect(row).toContainText("7h 30m"); await expect(row).toContainText("Left early 0h 30m");
  await expect(row.locator("td").nth(4)).toHaveText("0h 30m");
});
test("time away while checked in: pending, answered by the employee, confirmed once, and paid 30 minutes less", async ({ page }) => {
  const jordan = await employeeId("QA-002"), month = awayDate.slice(0, 7), monthName = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
  const base = async () => (await sql<{ base: string; planned: string }>(`SELECT c.base_amount::text AS base, (SELECT sum((s->>'scheduledSeconds')::numeric) FROM jsonb_array_elements(c.calculation_snapshot->'segments') s)::text AS planned
    FROM salary_calculations c JOIN salary_periods p ON p.id=c.salary_period_id WHERE c.employee_id=$1 AND p.start_date=$2::date`, [jordan, `${month}-01`]))[0];
  async function calculate() {
    await page.goto("/manage/salary"); await page.getByRole("row", { name: new RegExp(monthName) }).getByRole("link", { name: "Open" }).click();
    await page.getByRole("button", { name: /calculate all employees/i }).click();
    await expect.poll(async () => (await sql<{ status: string }>("SELECT status FROM salary_periods WHERE start_date=$1::date", [`${month}-01`]))[0].status, { timeout: 60_000 }).toBe("CALCULATED");
  }
  await signedIn(page, "admin"); await page.goto("/manage/salary");
  if (!(await sql<{ c: number }>("SELECT count(*)::int AS c FROM salary_periods WHERE start_date=$1::date", [`${month}-01`]))[0].c) {
    await page.getByRole("button", { name: "New salary month" }).click(); const create = page.getByRole("dialog", { name: "Create salary month" });
    await create.getByLabel("Salary month").fill(month); await create.getByRole("button", { name: "Create month" }).click(); await expect(create).not.toBeVisible();
  }
  await calculate(); const before = await base();
  // HR records 10:00–10:30 on a day Jordan was checked in.
  await signedIn(page, "hr"); await page.goto("/manage/work-time/records");
  await page.getByRole("button", { name: "Record missing time" }).click();
  const record = page.getByRole("dialog", { name: "Record missing time" });
  await record.getByRole("combobox", { name: "Employee", exact: true }).selectOption({ label: "Jordan Hasan · QA-002" }); await record.getByRole("textbox", { name: "Date", exact: true }).fill(awayDate);
  await record.getByRole("textbox", { name: /^From/ }).fill("10:00"); await record.getByRole("textbox", { name: "Until", exact: true }).fill("10:30");
  await record.getByRole("textbox", { name: /^What was observed/ }).fill("Away from the support desk; confirmed by the shift lead.");
  await record.getByRole("button", { name: "Save for review" }).click(); await expect(record).not.toBeVisible(); await expectToast(page, "Missing time recorded for review.");
  await page.goto(`/manage/work-time?range=date&date=${awayDate}&employeeId=${jordan}`);
  await expect(card(page, "Jordan Hasan").getByRole("row").filter({ hasText: awayDate })).toContainText("Away time awaiting review");
  // The employee sees the pending record and responds once.
  await signedIn(page, "employee"); await page.goto(`/me/work-time?month=${month}`);
  await expect(page.getByRole("region", { name: "Missing-time records" })).toContainText("Pending review");
  await page.getByRole("button", { name: "Respond" }).click();
  const respond = page.getByRole("dialog", { name: "Respond to this record" });
  await respond.getByRole("textbox", { name: "Your response" }).fill("I was helping a walk-in customer at the front counter."); await respond.getByRole("button", { name: "Submit response" }).click(); await confirm(page, "Submit response");
  await expectToast(page, "Your response was recorded.");
  // HR sees the response and confirms.
  await signedIn(page, "hr"); await page.goto(`/manage/work-time/records?employeeId=${jordan}`);
  const table = page.getByRole("region", { name: "Missing-time records" });
  await expect(table).toContainText("I was helping a walk-in customer"); await expect(table).toContainText("30 min");
  await table.getByRole("button", { name: "Review missing time for Jordan Hasan" }).click();
  const decide = page.getByRole("dialog", { name: "Review missing time" });
  await decide.getByRole("combobox", { name: "Decision", exact: true }).selectOption("CONFIRMED"); await decide.getByRole("textbox", { name: "Decision note" }).fill("Customer help happens at the counter rota; this was outside it.");
  await decide.getByRole("button", { name: "Save decision" }).click(); await confirm(page, "Save decision"); await expectToast(page, "Confirmed: the time is now unpaid.");
  await page.goto(`/manage/work-time?range=date&date=${awayDate}&employeeId=${jordan}`);
  await expect(card(page, "Jordan Hasan").getByRole("row").filter({ hasText: awayDate })).toContainText("Away 0h 30m (confirmed)");
  // The unfinished salary month was reset; recalculating pays exactly 30 minutes less (monthly × 1800 ÷ planned seconds).
  expect((await sql<{ status: string }>("SELECT status FROM salary_periods WHERE start_date=$1::date", [`${month}-01`]))[0].status).toBe("DRAFT");
  await signedIn(page, "admin"); await calculate(); const after = await base();
  const expected = 30000 * 1800 / Number(after.planned);
  expect(Math.abs(Number(before.base) - Number(after.base) - expected)).toBeLessThanOrEqual(0.01);
});
test("weekly and monthly targets for two employees, with results recorded per person", async ({ page }) => {
  await signedIn(page, "admin");
  const assign = async (periodType: string, date: string, title: string, value: string, unit: string, people: string[]) => {
    await page.goto("/manage/targets"); await page.getByRole("button", { name: "New target" }).click();
    const dialog = page.getByRole("dialog", { name: "Assign a target" });
    for (const name of people) await dialog.getByRole("checkbox", { name: new RegExp(name) }).check();
    await dialog.getByRole("combobox", { name: "Period", exact: true }).selectOption(periodType); await dialog.getByRole("textbox", { name: "Date in the period" }).fill(date);
    await dialog.getByRole("textbox", { name: "Target", exact: true }).fill(title); await dialog.getByRole("spinbutton", { name: "Target value" }).fill(value); await dialog.getByRole("textbox", { name: "Unit", exact: true }).fill(unit);
    await dialog.getByRole("button", { name: "Assign target" }).click(); await expect(dialog).not.toBeVisible();
  };
  const result = async (title: string, name: string, month: string, actual: string) => {
    await page.goto(`/manage/targets?month=${month}`);
    await page.getByRole("button", { name: `Result for ${title} · ${name}` }).click();
    const dialog = page.getByRole("dialog", { name: "Record the actual result" });
    await dialog.getByRole("spinbutton", { name: /Actual result/ }).fill(actual); await dialog.getByRole("button", { name: "Save result" }).click(); await expect(dialog).not.toBeVisible();
  };
  const results: Record<string, [string, string]> = { [months[0]]: ["80", "100"], [months[1]]: ["90", "70"], [months[2]]: ["100", "100"] };
  for (const month of months) {
    await assign("MONTHLY", `${month}-15`, `Process orders ${month}`, "100", "orders", ["Jordan Hasan", "Priya Sultana"]);
    await result(`Process orders ${month}`, "Jordan Hasan", month, results[month][0]); await result(`Process orders ${month}`, "Priya Sultana", month, results[month][1]);
  }
  await assign("WEEKLY", `${months[2]}-16`, "Answer support tickets", "20", "tickets", ["Jordan Hasan"]);
  await result("Answer support tickets", "Jordan Hasan", months[2], "24");
  const rows = await sql<{ number: string; type: string; actual: string }>("SELECT e.employee_number AS number, t.period_type AS type, t.actual_value::text AS actual FROM performance_targets t JOIN employees e ON e.id=t.employee_id WHERE t.period_end>=$1::date AND t.period_end<$2::date ORDER BY 1,2,3", [`${months[0]}-01`, addDays(`${months[2]}-28`, 7).slice(0, 7) + "-01"]);
  expect(rows).toHaveLength(7); // one independent row per employee and period
  await page.goto(`/manage/targets?month=${months[2]}`);
  await expect(page.getByRole("row").filter({ hasText: "Answer support tickets" })).toContainText("120%");
  await expect(page.getByRole("row").filter({ hasText: "Answer support tickets" })).toContainText("scored as 100%");
});
test("tasks (one completed late, one not completed) and a confirmed warning in the last month", async ({ page }) => {
  await signedIn(page, "hr"); await page.goto("/manage/tasks");
  for (const title of ["Reconcile the stock sheet", "Archive old tickets"]) {
    await page.getByRole("button", { name: "Assign task" }).click();
    const dialog = page.getByRole("dialog", { name: "Assign a task" });
    await dialog.getByLabel("Title").fill(`${title} ${months[2]}`); await dialog.getByLabel("Description").fill("Synthetic task for the rating test.");
    await dialog.getByRole("checkbox", { name: "Jordan Hasan" }).check();
    await dialog.getByLabel("Assigned date").fill(`${months[2]}-01`); await dialog.getByLabel("Due date").fill(`${months[2]}-25`);
    await dialog.getByRole("button", { name: "Assign task" }).click(); await expectToast(page, "Task saved");
  }
  await signedIn(page, "employee"); await page.goto("/me/tasks?status=");
  const taskCard = page.locator("div[data-slot=card]").filter({ hasText: `Reconcile the stock sheet ${months[2]}` });
  await taskCard.getByRole("button", { name: "Mark complete" }).click();
  const complete = page.getByRole("dialog", { name: "Complete task" });
  await complete.getByLabel("Completion note").fill("Done after the due date."); await complete.getByRole("button", { name: "Mark complete" }).click(); await confirm(page, "Complete task");
  await expectToast(page, "Task saved");
  const jordan = await employeeId("QA-002");
  await signedIn(page, "admin"); await page.goto(`/manage/warnings?employeeId=${jordan}`);
  await page.getByRole("button", { name: "New warning or notice" }).click();
  const dialog = page.getByRole("dialog", { name: "New warning or notice · Jordan Hasan" });
  await dialog.getByRole("combobox", { name: "Employment record" }).selectOption({ index: 1 }); await dialog.getByRole("textbox", { name: "Record date" }).fill(`${months[2]}-10`);
  await dialog.getByRole("combobox", { name: "Severity" }).selectOption("WARNING"); await dialog.getByRole("textbox", { name: "Reason", exact: true }).fill("Repeated late ticket handovers");
  await dialog.getByRole("checkbox", { name: "Release to the employee when finalized" }).check();
  await dialog.getByRole("button", { name: "Save draft" }).click(); await expect(dialog).not.toBeVisible();
  await page.locator("div[data-slot=card]").filter({ hasText: "Repeated late ticket handovers" }).getByRole("button", { name: "Finalize" }).click(); await confirm(page, /Finalize/);
  await expect.poll(async () => (await sql<{ published: boolean }>("SELECT published_at IS NOT NULL AS published FROM disciplinary_records WHERE employee_id=$1 AND reason='Repeated late ticket handovers'", [jordan]))[0]?.published).toBe(true);
});
test("three monthly ratings each: manual score, automated breakdown, warning deduction, finalize", async ({ page }) => {
  const [jordan, priya] = [await employeeId("QA-002"), await employeeId("QA-003")];
  await signedIn(page, "hr");
  for (const month of months) for (const [id, score] of [[jordan, "4.0"], [priya, "3.5"]]) {
    await page.goto(`/manage/ratings/${id}?month=${month}`);
    await page.getByRole("combobox", { name: "Manual score (0–5)" }).selectOption(score); await page.getByRole("textbox", { name: /Private HR note/ }).fill("Private HR note: discussed workload.");
    await page.getByRole("button", { name: "Save manual assessment" }).click(); await expectToast(page, "Manual assessment saved.");
    await expect(page.getByRole("button", { name: "Finalize monthly rating" })).toBeVisible();
    await page.getByRole("button", { name: "Finalize monthly rating" }).click(); await confirm(page, "Finalize"); await expectToast(page, "Monthly rating finalized.");
    await expect(page.getByText("Finalized", { exact: true }).first()).toBeVisible();
  }
  // The last month shows the task outcomes and the warning deduction of 0.25 (automated only).
  await page.goto(`/manage/ratings/${jordan}?month=${months[2]}`);
  await expect(page.getByText("Completed late")).toBeVisible(); await expect(page.getByText("Not completed")).toBeVisible();
  await expect(page.locator("div[data-slot=card]").filter({ has: page.getByRole("heading", { name: "Warning deductions" }) })).toContainText("−0.25");
  const rows = await sql<{ manual: string; raw: string; deduction: string; automated: string; total: string }>("SELECT manual_score::text AS manual, automated_raw::text AS raw, warning_deduction::text AS deduction, automated_final::text AS automated, total_score::text AS total FROM performance_assessments WHERE employee_id=$1 AND status='FINALIZED' AND month=$2::date", [jordan, `${months[2]}-01`]);
  expect(Number(rows[0].deduction)).toBe(0.25);
  expect(Number(rows[0].automated)).toBeCloseTo(Math.max(0, Number(rows[0].raw) - 0.25), 2);
  expect(Number(rows[0].total)).toBeCloseTo(Number(rows[0].manual) + Number(rows[0].automated), 2);
  await page.goto(`/manage/ratings?month=${months[2]}`);
  await expect(page.getByRole("row").filter({ hasText: "Jordan Hasan" })).toContainText("Finalized");
});
test("quarterly rating = average of the three finalized months; ranking highest first", async ({ page }) => {
  const totals = await sql<{ number: string; avg: string }>("SELECT e.employee_number AS number, round(avg(a.total_score),2)::text AS avg FROM performance_assessments a JOIN employees e ON e.id=a.employee_id WHERE a.status='FINALIZED' AND a.month = ANY($1::date[]) GROUP BY 1 HAVING count(*)=3 ORDER BY avg(a.total_score) DESC, 1", [months.map(m => `${m}-01`)]);
  expect(totals.map(t => t.number).sort()).toEqual(["QA-002", "QA-003"]);
  await signedIn(page, "hr"); await page.goto(`/manage/ratings/ranking?quarter=${quarter}`);
  const official = page.getByRole("region", { name: `Official ranking Q${prev} ${py}` });
  const rows = official.locator("tbody tr");
  await expect(rows).toHaveCount(2);
  for (const [i, t] of totals.entries()) await expect(rows.nth(i)).toContainText(Number(t.avg).toFixed(2));
  await expect(rows.nth(0).locator("td").first()).toHaveText("1");
});
test("employees see only their own ratings and targets, without private notes; staff pages stay closed", async ({ page }) => {
  await signedIn(page, "employee"); await page.goto("/me/ratings");
  await expect(page.getByText(`Q${prev} ${py} rating`)).toBeVisible();
  await expect(page.getByText("Private HR note")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Targets" })).toContainText("Answer support tickets");
  await expect(page.getByRole("region", { name: "Targets" })).not.toContainText("Priya");
  for (const path of ["/manage/ratings", "/manage/targets", "/manage/work-time", "/manage/work-time/records", "/manage/ratings/ranking"]) { await page.goto(path); await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Access unavailable|Page not found/); }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/me/ratings", "/me/work-time"]) { await page.goto(path); await noHorizontalOverflow(page); }
  await signedIn(page, "admin"); await page.goto("/manage/settings#ratings");
  await expect(page.getByRole("spinbutton", { name: "Warning", exact: true })).toHaveValue("0.25");
  for (const path of ["/manage/ratings", "/manage/work-time"]) { await page.goto(path); await noHorizontalOverflow(page); }
});
