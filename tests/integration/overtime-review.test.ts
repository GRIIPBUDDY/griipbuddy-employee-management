import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { testPostgres } from "../postgres";
import type { Identity } from "@/types/auth";
import type { PrismaClient } from "@/generated/prisma/client";
// Overtime review through the real check-in/checkout path. Checkout after a scheduled end (or unscheduled work)
// calculates the employee's current week immediately; staff must be able to decide that pending record, the decision
// must persist with audit and notification evidence, and only approved time may become payable.
let database: Awaited<ReturnType<typeof testPostgres>>, db: PrismaClient, admin: Identity, hr: Identity, hrSelf: Identity, hrEmployeeId = "";
let actionIdentity: Identity | null = null, now = new Date("2030-03-04T00:00:00Z");
vi.mock("@/lib/auth/request", () => ({ assertMutationOrigin: async () => {}, getIdentity: async () => actionIdentity }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const identity = (userId: string): Identity => { const issuedAt = Date.now(); return { userId, sessionVersion: 1, issuedAt, absoluteExpiresAt: issuedAt + 43200000 }; };
const at = (value: string) => { now = new Date(value); };
const WEEK = "2030-03-04"; // Monday; the week runs until Monday 2030-03-11 (Asia/Dhaka)
async function person(label: string, role: "EMPLOYEE" | "HR_MANAGER" = "EMPLOYEE") {
  const user = await db.user.create({ data: { email: `${label}-${randomUUID().slice(0, 8)}@example.test`, role, mustChangePassword: false, passwordHash: "synthetic" } });
  const employee = await db.employee.create({ data: { userId: user.id, legalName: `Overtime ${label}`, employeeNumber: `OT-${randomUUID().slice(0, 8)}`, createdBy: admin.userId, employmentPeriods: { create: { startDate: new Date("2020-01-01"), departmentLabel: "Operations", positionLabel: "Associate", createdBy: admin.userId } } }, include: { employmentPeriods: true } });
  await (await import("@/features/pay/rates")).publishRate(admin, { employeeId: employee.id, employmentPeriodId: employee.employmentPeriods[0].id, effectiveFrom: "2030-01-01", payType: "MONTHLY", baseAmount: "30000", overtimeHourlyRate: "150", overtimeMultiplier: "1", reason: "Offer letter" });
  return { who: identity(user.id), employee };
}
/** Three hours of unscheduled work on Wednesday, checked out through the employee portal service. */
async function unscheduledWeek(label: string, role: "EMPLOYEE" | "HR_MANAGER" = "EMPLOYEE") {
  const p = await person(label, role), attendance = await import("@/features/time/attendance");
  at("2030-03-06T04:00:00Z"); const session = await attendance.checkInUnscheduled(p.who, { operationKey: randomUUID() });
  at("2030-03-06T07:00:00Z"); await attendance.checkOut(p.who, { sessionId: session!.id, operationKey: randomUUID() });
  at("2030-03-06T09:00:00Z"); // still Wednesday; the week is open
  const row = await db.overtimeReview.findUniqueOrThrow({ where: { employeeId_weekStartDate: { employeeId: p.employee.id, weekStartDate: new Date(WEEK) } } });
  return { ...p, row, sessionId: session!.id };
}
const decision = (row: { id: string; revision: number }, value: "APPROVED" | "REJECTED", approvedSeconds: number, comment: string) => ({ id: row.id, revision: row.revision, decision: value, approvedSeconds, comment });
beforeAll(async () => {
  database = await testPostgres(); process.env.DATABASE_URL = database.runtimeUrl; db = (await import("@/lib/db/client")).db;
  vi.spyOn(await import("@/features/time/clock"), "databaseNow").mockImplementation(async () => new Date(now));
  admin = identity((await db.user.create({ data: { email: "ot-admin@example.test", role: "ADMIN", mustChangePassword: false, passwordHash: "synthetic" } })).id);
  hr = identity((await db.user.create({ data: { email: "ot-hr@example.test", role: "HR_MANAGER", mustChangePassword: false, passwordHash: "synthetic" } })).id);
  // 48-hour weekly threshold; Monday-start weeks in Asia/Dhaka; earnings method effective before March 2030.
  await db.organizationSettings.create({ data: { companyName: "Overtime review regression", timezone: "Asia/Dhaka", changedBy: admin.userId, earningsEffectiveFrom: new Date("2030-01-01"), overtimePolicyVersions: [{ effectiveFrom: "2020-01-06", thresholdSeconds: 172800, ruleVersion: 1 }] } });
});
afterAll(async () => { vi.restoreAllMocks(); await db?.$disconnect(); await database?.stop(); });
it("reproduces and fixes: checkout creates a pending record for the open week that an admin can reject", async () => {
  const { employee, row, sessionId } = await unscheduledWeek("reject");
  expect(row).toMatchObject({ status: "PENDING", potentialSecondsSnapshot: 3 * 3600, actualSecondsSnapshot: 3 * 3600 });
  const overtime = await import("@/features/review/overtime"), before = await db.attendanceSession.findUniqueOrThrow({ where: { id: sessionId } });
  const screen = await overtime.overtimeData(admin, employee.id, "2030-03-06");
  expect(screen.row?.status).toBe("PENDING"); expect(screen.canDecide).toBe(true); expect(screen.open).toBe(true);
  expect(screen.sessions).toEqual([expect.objectContaining({ scheduled: false, source: "UNSCHEDULED", workedSeconds: 3 * 3600, outsideScheduleSeconds: 3 * 3600 })]);
  await overtime.decideOvertime(admin, decision(row, "REJECTED", 0, "Not authorized in advance"));
  const saved = await db.overtimeReview.findUniqueOrThrow({ where: { id: row.id } });
  expect(saved).toMatchObject({ status: "REJECTED", approvedSeconds: 0, reviewedBy: admin.userId, reviewComment: "Not authorized in advance", revision: row.revision + 1 });
  expect(saved.reviewedAt).toEqual(now);
  // Attendance is evidence, never rewritten by a decision.
  expect(await db.attendanceSession.findUniqueOrThrow({ where: { id: sessionId } })).toEqual(before);
  expect(await db.auditLog.count({ where: { entityId: row.id, action: "OVERTIME_REJECTED", actorUserId: admin.userId } })).toBe(1);
  expect(await db.notification.findMany({ where: { employeeId: employee.id, eventType: "OVERTIME_DECIDED" }, select: { text: true } })).toEqual([{ text: "Your weekly overtime review was rejected." }]);
  // No longer pending in the review queue, and shown as rejected to the reviewer and the employee.
  expect((await overtime.overtimeQueue(admin, { status: "PENDING" })).records.map(r => r.id)).not.toContain(row.id);
  expect((await overtime.overtimeData(admin, employee.id, "2030-03-06")).row?.status).toBe("REJECTED");
});
it("authorized HR approves; approval persists and is the only overtime that becomes payable", async () => {
  const approved = await unscheduledWeek("approve"), rejected = await unscheduledWeek("zero"), overtime = await import("@/features/review/overtime");
  await overtime.decideOvertime(hr, decision(approved.row, "APPROVED", 2 * 3600, "Approved by operations lead"));
  await overtime.decideOvertime(hr, decision(rejected.row, "REJECTED", 0, ""));
  expect(await db.overtimeReview.findUniqueOrThrow({ where: { id: approved.row.id } })).toMatchObject({ status: "APPROVED", approvedSeconds: 2 * 3600, reviewedBy: hr.userId, reviewComment: "Approved by operations lead" });
  // The employee's own view shows the payable approved time.
  expect((await overtime.ownOvertime(approved.who, { week: "2030-03-06" }))?.activeApprovedSeconds).toBe(2 * 3600);
  // Monthly salary uses only approved time at the individual overtime rate (৳150/h); rejection pays nothing.
  const p = await import("@/features/pay/periods"), id = await p.createPeriod(admin, { month: "2030-03" });
  await p.calculatePeriod(admin, { periodId: id, revision: (await db.salaryPeriod.findUniqueOrThrow({ where: { id } })).inputRevision });
  const pay = async (employeeId: string) => (await db.salaryCalculation.findFirstOrThrow({ where: { salaryPeriodId: id, employeeId } })).overtimeAmount.toFixed(2);
  expect(await pay(approved.employee.id)).toBe("300.00"); expect(await pay(rejected.employee.id)).toBe("0.00");
});
it("employees, including the employee who worked the overtime, cannot review or decide it", async () => {
  const { who, employee, row } = await unscheduledWeek("employee"), other = await person("bystander"), overtime = await import("@/features/review/overtime");
  for (const actor of [who, other.who]) {
    await expect(overtime.decideOvertime(actor, decision(row, "APPROVED", 3600, "Self approval"))).rejects.toMatchObject({ status: 403 });
    await expect(overtime.overtimeData(actor, employee.id, "2030-03-06")).rejects.toMatchObject({ status: 403 });
  }
  await expect(overtime.ownOvertime(other.who, { week: "2030-03-06" })).resolves.toMatchObject({ row: null });
  // Through the form action too: an employee session gets a permission error and nothing changes.
  actionIdentity = who; const form = new FormData();
  Object.entries({ kind: "overtimeDecision", id: row.id, revision: String(row.revision), decision: "REJECTED", comment: "" }).forEach(([k, v]) => form.set(k, v));
  expect((await (await import("@/features/review/actions")).reviewAction({}, form)).error).toBeTruthy();
  expect((await db.overtimeReview.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("PENDING");
});
it("an HR manager cannot review their own overtime; an administrator can", async () => {
  const self = await unscheduledWeek("hr-self", "HR_MANAGER"), overtime = await import("@/features/review/overtime");
  hrSelf = self.who; hrEmployeeId = self.employee.id;
  await expect(overtime.decideOvertime(hrSelf, decision(self.row, "APPROVED", 3600, "Own approval"))).rejects.toMatchObject({ status: 403, code: "SELF_REVIEW" });
  expect((await overtime.overtimeData(hrSelf, hrEmployeeId, "2030-03-06")).canDecide).toBe(false);
  await overtime.decideOvertime(admin, decision(self.row, "APPROVED", 3600, "Approved by administrator"));
  expect((await db.overtimeReview.findUniqueOrThrow({ where: { id: self.row.id } })).status).toBe("APPROVED");
});
it("duplicate and retried submissions are safe and create no duplicate audit or notification", async () => {
  const { employee, row } = await unscheduledWeek("duplicate"), overtime = await import("@/features/review/overtime");
  const value = decision(row, "REJECTED", 0, "Duplicate check");
  await overtime.decideOvertime(admin, value);
  await expect(overtime.decideOvertime(admin, value)).resolves.toBe(row.id); // identical retry is a no-op
  await expect(overtime.decideOvertime(admin, decision(row, "APPROVED", 3600, "Changed mind"))).rejects.toMatchObject({ status: 409, code: "ALREADY_REVIEWED", message: "This overtime record has already been rejected. Refresh to see the current decision." });
  expect(await db.auditLog.count({ where: { entityId: row.id, action: { in: ["OVERTIME_APPROVED", "OVERTIME_REJECTED"] } } })).toBe(1);
  expect(await db.notification.count({ where: { employeeId: employee.id, eventType: "OVERTIME_DECIDED" } })).toBe(1);
});
it("concurrent conflicting decisions cannot overwrite each other", async () => {
  const { row } = await unscheduledWeek("concurrent"), overtime = await import("@/features/review/overtime");
  const results = await Promise.allSettled([overtime.decideOvertime(admin, decision(row, "APPROVED", 3600, "Approve")), overtime.decideOvertime(hr, decision(row, "REJECTED", 0, "Reject"))]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  const failure = results.find(r => r.status === "rejected") as PromiseRejectedResult;
  expect(failure.reason).toMatchObject({ status: 409, code: "ALREADY_REVIEWED" });
  const saved = await db.overtimeReview.findUniqueOrThrow({ where: { id: row.id } });
  expect(saved.revision).toBe(row.revision + 1);
  expect(await db.auditLog.count({ where: { entityId: row.id, action: { in: ["OVERTIME_APPROVED", "OVERTIME_REJECTED"] } } })).toBe(1);
});
it("stale pages, open sessions and changed attendance are refused with clear messages", async () => {
  const { who, employee, row } = await unscheduledWeek("stale"), overtime = await import("@/features/review/overtime"), attendance = await import("@/features/time/attendance");
  await expect(overtime.decideOvertime(admin, { ...decision(row, "REJECTED", 0, ""), revision: row.revision + 5 })).rejects.toMatchObject({ code: "STALE", message: "This overtime record changed since the page loaded. Refresh and review the latest calculation." });
  // While the employee is checked in again, the review waits for checkout.
  at("2030-03-07T04:00:00Z"); const open = await attendance.checkInUnscheduled(who, { operationKey: randomUUID() });
  at("2030-03-07T05:00:00Z");
  await expect(overtime.decideOvertime(admin, decision(row, "REJECTED", 0, ""))).rejects.toMatchObject({ code: "UNRESOLVED_ATTENDANCE", message: "Resolve attendance first: Missing checkout." });
  // Checkout recalculates the week: the new pending revision includes both sessions and must be decided afresh.
  at("2030-03-07T06:00:00Z"); await attendance.checkOut(who, { sessionId: open!.id, operationKey: randomUUID() });
  const next = await db.overtimeReview.findUniqueOrThrow({ where: { id: row.id } });
  expect(next).toMatchObject({ status: "PENDING", potentialSecondsSnapshot: 5 * 3600 });
  await expect(overtime.decideOvertime(admin, decision(row, "REJECTED", 0, ""))).rejects.toMatchObject({ code: "STALE" });
  await overtime.decideOvertime(admin, decision(next, "APPROVED", 5 * 3600, "Both sessions authorized"));
  expect((await overtime.overtimeData(admin, employee.id, "2030-03-07")).activeApprovedSeconds).toBe(5 * 3600);
});
it("recalculation never reopens a rejection while attendance is unchanged, and later attendance reopens it with history kept", async () => {
  const { who, employee, row } = await unscheduledWeek("recalc"), overtime = await import("@/features/review/overtime");
  await overtime.decideOvertime(hr, decision(row, "REJECTED", 0, "No pre-approval"));
  const rejected = await db.overtimeReview.findUniqueOrThrow({ where: { id: row.id } });
  await overtime.calculateOvertime(hr, { employeeId: employee.id, week: WEEK });
  await overtime.overtimeData(hr, employee.id, WEEK); await overtime.ownOvertime(who, { week: WEEK });
  expect(await db.overtimeReview.findUniqueOrThrow({ where: { id: row.id } })).toEqual(rejected);
  // New attendance in the same week makes the old decision stale; the rejection stays in the audit history.
  const attendance = await import("@/features/time/attendance");
  at("2030-03-08T04:00:00Z"); const more = await attendance.checkInUnscheduled(who, { operationKey: randomUUID() });
  at("2030-03-08T05:00:00Z"); await attendance.checkOut(who, { sessionId: more!.id, operationKey: randomUUID() });
  expect((await db.overtimeReview.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("PENDING");
  expect(await db.auditLog.count({ where: { entityId: row.id, action: "OVERTIME_REJECTED" } })).toBe(1);
  expect(await db.auditLog.count({ where: { entityId: row.id, action: "OVERTIME_REVIEW_STALE" } })).toBeGreaterThanOrEqual(1);
});
it("scheduled work past the period end follows the same review: staff calculate the open week, approve, and the dashboard count drops", async () => {
  at("2030-03-03T12:00:00Z"); // schedules are published for current or future dates
  const p = await person("scheduled"), corrections = await import("@/features/review/corrections"), overtime = await import("@/features/review/overtime");
  await (await import("@/features/time/schedules")).publishSchedule(admin, { employeeId: p.employee.id, employmentPeriodId: p.employee.employmentPeriods[0].id, effectiveFrom: "2030-03-04", effectiveUntil: "", label: "Morning", reason: "Weekly Work Hour", duration: "INDEFINITE", slots: [{ weekday: 2, startMinute: 480, endMinute: 720, endDayOffset: 0 }] });
  at("2030-03-05T12:00:00Z"); // Tuesday 18:00 Dhaka
  // A verified correction records 08:00–13:00 against the 08:00–12:00 period: one hour beyond the schedule.
  const id = await corrections.submitCorrection(hr, { type: "ADD", workDate: "2030-03-05", checkinAt: "2030-03-05T02:00:00Z", checkoutAt: "2030-03-05T07:00:00Z", reason: "Verified late finish", operationKey: randomUUID() }, p.employee.id);
  await corrections.decideCorrection(admin, { id, decision: "APPROVED", comment: "Supervisor confirmed" });
  const row = await overtime.calculateOvertime(hr, { employeeId: p.employee.id, week: WEEK });
  expect(row).toMatchObject({ status: "PENDING", potentialSecondsSnapshot: 3600 });
  const screen = await overtime.overtimeData(hr, p.employee.id, WEEK);
  expect(screen.sessions[0]).toMatchObject({ scheduled: false, outsideScheduleSeconds: 3600 }); // a correction session carries no schedule link
  const dashboard = await import("@/features/insights/dashboard"), waiting = async () => (await dashboard.managementDashboard(admin)).cards.find(c => c.label === "Overtime awaiting review")!.value;
  const before = await waiting();
  await overtime.decideOvertime(hr, decision(row, "APPROVED", 3600, "Late finish approved"));
  expect(await waiting()).toBe(Number(before) - 1);
});
it("finalized salary is never rewritten by a later overtime decision", async () => {
  // A finalized April statement exists for this employee (fixture written directly, bypassing workflow triggers).
  const p = await person("finalized"), periodId = randomUUID(), calculationId = randomUUID();
  await database.owner.query("BEGIN; SET LOCAL session_replication_role = replica;"
    + "INSERT INTO salary_periods(id,start_date,end_date,timezone_snapshot,currency,status,input_revision,calculated_input_revision,created_by,reviewed_by,reviewed_at,approved_by,approved_at,finalized_by,finalized_at,calculation_method,payment_status,created_at,updated_at) VALUES ($1,'2030-04-01','2030-05-01','Asia/Dhaka','BDT','FINALIZED',1,1,$3,$3,now(),$3,now(),$3,now(),'MONTHLY_ATTENDANCE','UNPAID',now(),now());"
    .replace("$1", `'${periodId}'`).replaceAll("$3", `'${admin.userId}'`)
    + `INSERT INTO salary_calculations(id,employee_id,salary_period_id,input_revision,base_amount,overtime_amount,commission_amount,bonus_amount,deduction_amount,other_amount,final_amount,calculation_snapshot,calculated_by,calculated_at,finalized_at) VALUES ('${calculationId}','${p.employee.id}','${periodId}',1,30000,0,0,0,0,0,30000,'{"formatVersion":"1"}','${admin.userId}',now(),now()); COMMIT;`);
  const attendance = await import("@/features/time/attendance"), overtime = await import("@/features/review/overtime");
  at("2030-04-10T04:00:00Z"); const session = await attendance.checkInUnscheduled(p.who, { operationKey: randomUUID() });
  at("2030-04-10T06:00:00Z"); await attendance.checkOut(p.who, { sessionId: session!.id, operationKey: randomUUID() });
  const row = await db.overtimeReview.findUniqueOrThrow({ where: { employeeId_weekStartDate: { employeeId: p.employee.id, weekStartDate: new Date("2030-04-08") } } });
  const before = { period: await db.salaryPeriod.findUniqueOrThrow({ where: { id: periodId } }), calculation: await db.salaryCalculation.findUniqueOrThrow({ where: { id: calculationId } }) };
  await overtime.decideOvertime(admin, decision(row, "APPROVED", 2 * 3600, "Approved after finalization"));
  // The decision is recorded, but the finalized month and its statement are untouched (corrections use reconciliation).
  expect((await db.overtimeReview.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("APPROVED");
  expect(await db.salaryPeriod.findUniqueOrThrow({ where: { id: periodId } })).toEqual(before.period);
  expect(await db.salaryCalculation.findUniqueOrThrow({ where: { id: calculationId } })).toEqual(before.calculation);
});
