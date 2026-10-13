import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { testPostgres } from "../postgres";
import type { Identity } from "@/types/auth";
import type { PrismaClient } from "@/generated/prisma/client";
import { standardDailyPattern } from "@/features/time/default-pattern";
// Regression coverage for the overhaul: inclusive date filters, task list defaults, the schedule-change form contract
// and payment time validation. Disposable database and a controlled clock only.
let database: Awaited<ReturnType<typeof testPostgres>>, db: PrismaClient, admin: Identity, hr: Identity, alice: Identity, bob: Identity, aliceId = "", bobId = "", alicePeriod = "", actionIdentity: Identity;
let now = new Date("2030-01-06T18:30:00Z"); // Monday 2030-01-07 00:30 in Asia/Dhaka
vi.mock("@/lib/auth/request", () => ({ assertMutationOrigin: async () => {}, getIdentity: async () => actionIdentity }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const identity = (userId: string): Identity => { const issuedAt = Date.now(); return { userId, sessionVersion: 1, issuedAt, absoluteExpiresAt: issuedAt + 43200000 }; };
const at = (value: string) => { now = new Date(value); };
beforeAll(async () => {
  database = await testPostgres(); process.env.DATABASE_URL = database.runtimeUrl; db = (await import("@/lib/db/client")).db;
  vi.spyOn(await import("@/features/time/clock"), "databaseNow").mockImplementation(async () => new Date(now));
  const make = (email: string, role: "ADMIN" | "HR_MANAGER" | "EMPLOYEE") => db.user.create({ data: { email, role, displayName: email.split("@")[0], passwordHash: "synthetic", mustChangePassword: false } });
  const a = await make("overhaul-admin@example.test", "ADMIN"), h = await make("overhaul-hr@example.test", "HR_MANAGER");
  admin = identity(a.id); hr = identity(h.id); actionIdentity = admin;
  await db.organizationSettings.create({ data: { companyName: "Overhaul regression", timezone: "Asia/Dhaka", changedBy: a.id, overtimePolicyVersions: [{ effectiveFrom: "2020-01-06", thresholdSeconds: 172800, ruleVersion: 1 }] } });
  for (const name of ["Alice Overhaul", "Bob Overhaul"]) {
    const user = await make(`${name.split(" ")[0].toLowerCase()}-overhaul@example.test`, "EMPLOYEE");
    const employee = await db.employee.create({ data: { userId: user.id, legalName: name, employeeNumber: name.slice(0, 3).toUpperCase(), createdBy: a.id, employmentPeriods: { create: { startDate: new Date("2020-01-01"), departmentLabel: "Operations", positionLabel: "Associate", createdBy: a.id } } }, include: { employmentPeriods: true } });
    if (name.startsWith("Alice")) { aliceId = employee.id; alice = identity(user.id); alicePeriod = employee.employmentPeriods[0].id; } else { bobId = employee.id; bob = identity(user.id); }
  }
  // Alice: Mon–Sat 08:00–12:00 and 16:00–20:00 from 2030-01-07. Bob has no schedule.
  await (await import("@/features/time/schedules")).publishSchedule(admin, { employeeId: aliceId, employmentPeriodId: alicePeriod, effectiveFrom: "2030-01-07", effectiveUntil: "", label: "Split", reason: "Weekly Work Hour", duration: "INDEFINITE", slots: standardDailyPattern([1, 2, 3, 4, 5, 6], 480) });
  at("2030-01-08T16:00:00Z");
  const corrections = await import("@/features/review/corrections");
  const id = await corrections.submitCorrection(hr, { type: "ADD", workDate: "2030-01-08", checkinAt: "2030-01-08T02:00:00Z", checkoutAt: "2030-01-08T06:00:00Z", reason: "Synthetic evidence", operationKey: randomUUID() }, aliceId);
  await corrections.decideCorrection(admin, { id, decision: "APPROVED", comment: "Verified" });
  at("2030-01-16T12:00:00Z"); // Wednesday 18:00 Dhaka
});
afterAll(async () => { vi.restoreAllMocks(); await db?.$disconnect(); await database?.stop(); });
it("attendance review shows only the selected date, and inclusive ranges end on the chosen date", async () => {
  const data = await import("@/features/review/data");
  const one = await data.attendanceManagement(hr, { employeeId: aliceId, range: "date", date: "2030-01-08" });
  expect(one.records.map(r => r.date)).toEqual(["2030-01-08"]); expect(one.records[0].actualSeconds).toBe(4 * 3600);
  const inclusive = await data.attendanceManagement(hr, { employeeId: aliceId, range: "custom", from: "2030-01-12", to: "2030-01-14" });
  expect(inclusive.records.map(r => r.date)).toEqual(["2030-01-12", "2030-01-13", "2030-01-14"]);
  expect((await data.attendanceManagement(hr, {})).records.every(r => r.date === "2030-01-16")).toBe(true);
});
it("ACTIVE days omit dates without a scheduled occurrence or attendance, so recurring definitions add no unrelated dates", async () => {
  const data = await import("@/features/review/data");
  const active = await data.attendanceManagement(hr, { employeeId: aliceId, range: "custom", from: "2030-01-12", to: "2030-01-14", days: "ACTIVE" });
  expect(active.records.map(r => r.date)).toEqual(["2030-01-12", "2030-01-14"]); // Sunday is not scheduled
  expect((await data.attendanceManagement(hr, { employeeId: bobId, range: "week", date: "2030-01-16", days: "ACTIVE" })).records).toHaveLength(0);
  expect((await data.attendanceManagement(hr, { employeeId: bobId, range: "week", date: "2030-01-16", days: "ALL" })).records).toHaveLength(7);
});
it("rejects reversed and oversized ranges with a validation error instead of widening them", async () => {
  const data = await import("@/features/review/data");
  await expect(data.attendanceManagement(hr, { range: "custom", from: "2030-01-10", to: "2030-01-08" })).rejects.toMatchObject({ status: 400, code: "DATE_RANGE" });
  await expect(data.attendanceManagement(hr, { range: "custom", from: "2030-01-01", to: "2030-03-01" })).rejects.toMatchObject({ status: 400, code: "DATE_RANGE" });
});
it("per-employee and own attendance history honour the selected dates", async () => {
  const time = await import("@/features/time/data"), review = await import("@/features/review/data");
  expect((await time.attendanceHistory(hr, aliceId, { range: "date", date: "2030-01-08" })).total).toBe(1);
  expect((await time.attendanceHistory(hr, aliceId, { range: "date", date: "2030-01-09" })).total).toBe(0);
  expect((await time.attendanceHistory(hr, aliceId, {})).from).toBe("2030-01-16");
  expect((await time.ownAttendance(alice, { range: "week", date: "2030-01-08" }))!.total).toBe(1);
  expect((await review.ownSummary(alice, { range: "date", date: "2030-01-08" }))!.days.map(d => d.date)).toEqual(["2030-01-08"]);
  await expect(time.ownAttendance(bob, { range: "custom", from: "2030-01-09", to: "2030-01-01" })).rejects.toMatchObject({ code: "DATE_RANGE" });
});
it("attendance reports accept inclusive dates and the active-days option", async () => {
  const reports = await import("@/features/insights/reports");
  expect((await reports.reportData(hr, "attendance", { employeeId: aliceId, range: "date", date: "2030-01-08" })).records.map(r => r.date)).toEqual(["2030-01-08"]);
  const active = await reports.reportData(hr, "attendance", { employeeId: aliceId, range: "custom", from: "2030-01-12", to: "2030-01-14", days: "ACTIVE" });
  expect(active.records.map(r => r.date)).toEqual(["2030-01-12", "2030-01-14"]); expect(active.to).toBe("2030-01-14");
  await expect(reports.reportData(hr, "attendance", { range: "custom", from: "2030-01-01", to: "2030-02-15" })).rejects.toMatchObject({ status: 400 });
});
it("task lists show open and overdue tasks from earlier dates by default, with search and independent completion", async () => {
  const t = await import("@/features/tasks/service");
  await t.assignTasks(hr, { employeeIds: [aliceId, bobId], title: "Older handover", description: "Synthetic", assignedDate: "2030-01-10", dueDate: "2030-01-11", priority: "NORMAL", operationKey: randomUUID() });
  await t.assignTasks(hr, { employeeIds: [aliceId, bobId], title: "Count inventory", description: "Synthetic", assignedDate: "2030-01-16", dueDate: null, priority: "HIGH", operationKey: randomUUID() });
  expect((await t.taskData(alice, {}, true)).total).toBe(2);
  expect((await t.taskData(alice, { status: "OVERDUE" }, true)).records.map(r => r.title)).toEqual(["Older handover"]);
  expect((await t.taskData(hr, { range: "date", date: "2030-01-10" })).total).toBe(2);
  const bobs = await t.taskData(hr, { search: "Bob Overhaul" }); expect(bobs.total).toBe(2); expect(bobs.records.every(r => r.employeeId === bobId && r.employee?.legalName === "Bob Overhaul")).toBe(true);
  expect((await t.taskData(hr, { search: "inventory" })).total).toBe(2);
  const own = (await t.taskData(alice, { search: "inventory" }, true)).records[0];
  await t.updateTaskProgress(alice, { id: own.id, revision: own.revision, status: "COMPLETED", note: "Done" });
  expect((await t.taskData(alice, { status: "OPEN" }, true)).records.map(r => r.title)).toEqual(["Older handover"]);
  expect((await t.taskData(bob, { status: "OPEN" }, true)).total).toBe(2);
  await expect(t.taskData(alice, { employeeId: bobId }, true)).rejects.toMatchObject({ status: 404 });
});
it("the weekly editor's replacement form changes the current schedule from a future date and keeps history", async () => {
  actionIdentity = admin;
  const current = await db.workSchedule.findFirstOrThrow({ where: { employeeId: aliceId, supersededAt: null } });
  const form = new FormData();
  Object.entries({ employeeId: aliceId, employmentPeriodId: alicePeriod, baseScheduleId: current.id, baseRevision: String(current.revision), restoreSlots: "[]", editScope: "FUTURE", effectiveFrom: "2030-01-17", effectiveUntil: "", label: "Weekdays", reason: "Weekly Work Hour change" }).forEach(([k, v]) => form.set(k, v));
  // Same field names as the redesigned weekday-row editor (hidden weekday/endday per period).
  standardDailyPattern([1, 2, 3, 4, 5], 540).forEach((s, key) => { form.append("slotKey", String(key + 20)); form.set(`weekday-${key + 20}`, String(s.weekday)); form.set(`start-${key + 20}`, `${String(s.startMinute / 60).padStart(2, "0")}:00`); form.set(`end-${key + 20}`, `${String(s.endMinute / 60).padStart(2, "0")}:00`); form.set(`endday-${key + 20}`, String(s.endDayOffset)); });
  const result = await (await import("@/features/time/actions")).publishAction({}, form);
  expect(result.error).toBeUndefined();
  const rows = await db.workSchedule.findMany({ where: { employeeId: aliceId }, orderBy: { effectiveFrom: "asc" }, include: { slots: true } });
  expect(rows).toHaveLength(2); expect(rows[0].effectiveUntil?.toISOString().slice(0, 10)).toBe("2030-01-17"); expect(rows[0].slots).toHaveLength(12);
  expect(rows[1].effectiveFrom.toISOString().slice(0, 10)).toBe("2030-01-17"); expect(rows[1].slots).toHaveLength(10); expect(rows[1].slots.some(s => s.weekday === 6 || s.weekday === 7)).toBe(false);
  expect(await db.attendanceSession.count({ where: { employeeId: aliceId } })).toBe(1);
});
it("payment recording rejects malformed times with a specific message instead of a generic failure", async () => {
  actionIdentity = admin;
  const form = new FormData(); Object.entries({ kind: "payment", periodId: randomUUID(), paidAt: "5 Nov 2030 10am", reference: "", note: "" }).forEach(([k, v]) => form.set(k, v));
  expect((await (await import("@/features/pay/actions")).payAction({}, form)).error).toBe("Enter a valid payment date and time.");
  form.set("paidAt", "2030-11-05T10:30");
  expect((await (await import("@/features/pay/actions")).payAction({}, form)).error).toMatch(/not found/i);
});
