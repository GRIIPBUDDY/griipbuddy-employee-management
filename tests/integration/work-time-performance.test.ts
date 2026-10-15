import { beforeAll, afterAll, it, expect, vi, describe } from "vitest";
import { randomUUID } from "node:crypto";
import { testPostgres } from "../postgres";
import type { Identity } from "@/types/auth";
import type { PrismaClient } from "@/generated/prisma/client";
// Work-time accounting, compensation consequences, targets, monthly ratings, warning deductions, quarterly averages and
// rankings. Disposable database, synthetic people, controlled server clock (Asia/Dhaka, UTC+6).
let database: Awaited<ReturnType<typeof testPostgres>>, db: PrismaClient, admin: Identity, hr: Identity, adminId = "";
const people: Record<string, { id: string; who: Identity; period: string }> = {};
let now = new Date("2030-06-01T00:00:00Z");
vi.mock("@/lib/auth/request", () => ({ assertMutationOrigin: async () => {}, getIdentity: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const identity = (userId: string): Identity => { const issuedAt = Date.now(); return { userId, sessionVersion: 1, issuedAt, absoluteExpiresAt: issuedAt + 43200000 }; };
const at = (value: string | Date) => { now = new Date(value); };
const local = (date: string, time: string) => new Date(`${date}T${time}:00+06:00`);
const svc = {
  work: () => import("@/features/work-time/service"), perf: () => import("@/features/performance/service"), attendance: () => import("@/features/time/attendance"),
};
async function slot(key: string, date: string, startMinute: number) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
  return (await db.scheduleSlot.findFirstOrThrow({ where: { weekday, startMinute, workSchedule: { employeeId: people[key].id, supersededAt: null } } })).id;
}
/** Check in to a scheduled period and out again, at server times given in organization-local time. */
async function work(key: string, date: string, from: string, until: string, startMinute: number) {
  const a = await svc.attendance();
  at(local(date, from)); const session = await a.checkIn(people[key].who, { slotId: await slot(key, date, startMinute), workDate: date, operationKey: randomUUID() });
  at(local(date, until)); await a.checkOut(people[key].who, { sessionId: session.id, operationKey: randomUUID() });
}
async function day(key: string, date: string) {
  const report = await (await svc.work()).workTimeReport(hr, { range: "date", date, employeeId: people[key].id, status: "ALL" });
  return report.rows[0].days.find(d => d.date === date)!;
}
beforeAll(async () => {
  database = await testPostgres(); process.env.DATABASE_URL = database.runtimeUrl; db = (await import("@/lib/db/client")).db;
  vi.spyOn(await import("@/features/time/clock"), "databaseNow").mockImplementation(async () => new Date(now));
  const make = (email: string, role: "ADMIN" | "HR_MANAGER" | "EMPLOYEE") => db.user.create({ data: { email, role, displayName: email.split("@")[0], passwordHash: "synthetic", mustChangePassword: false } });
  const a = await make("wt-admin@example.test", "ADMIN"); adminId = a.id; admin = identity(a.id); hr = identity((await make("wt-hr@example.test", "HR_MANAGER")).id);
  await db.organizationSettings.create({ data: { companyName: "Work-time regression", timezone: "Asia/Dhaka", changedBy: a.id, earningsEffectiveFrom: new Date("2020-01-01"), overtimePolicyVersions: [{ effectiveFrom: "2020-01-06", thresholdSeconds: 172800, ruleVersion: 1 }] } });
  const ops = await db.department.create({ data: { name: "Operations", normalizedName: "operations", createdBy: a.id } });
  for (const [key, role] of [["alice", "EMPLOYEE"], ["bob", "EMPLOYEE"], ["dana", "EMPLOYEE"], ["carl", "EMPLOYEE"], ["erin", "EMPLOYEE"], ["frank", "EMPLOYEE"], ["gina", "EMPLOYEE"], ["hrself", "HR_MANAGER"]] as const) {
    const user = await make(`${key}@wt.example.test`, role);
    const e = await db.employee.create({ data: { userId: user.id, legalName: `WT ${key}`, employeeNumber: `WT-${key.toUpperCase()}`, createdBy: a.id, employmentPeriods: { create: { startDate: new Date("2020-01-01"), departmentId: ops.id, departmentLabel: "Operations", positionLabel: "Associate", createdBy: a.id } } }, include: { employmentPeriods: true } });
    people[key] = { id: e.id, who: identity(user.id), period: e.employmentPeriods[0].id };
  }
  const schedules = await import("@/features/time/schedules"), rates = await import("@/features/pay/rates"), absence = await import("@/features/review/absence");
  // Split shift Monday–Saturday: 08:00–12:00 and 13:00–17:00 (one-hour unpaid break), from Sunday 2 June 2030.
  const split = [1, 2, 3, 4, 5, 6].flatMap(weekday => [{ weekday, startMinute: 480, endMinute: 720, endDayOffset: 0 }, { weekday, startMinute: 780, endMinute: 1020, endDayOffset: 0 }]);
  for (const key of ["alice", "bob", "dana", "carl"]) await schedules.publishSchedule(admin, { employeeId: people[key].id, employmentPeriodId: people[key].period, effectiveFrom: "2030-06-02", effectiveUntil: "", label: "Split shift", reason: "Weekly Work Hour", duration: "INDEFINITE", slots: split });
  const rate = (key: string, payType: string, baseAmount: string) => rates.publishRate(hr, { employeeId: people[key].id, employmentPeriodId: people[key].period, effectiveFrom: "2030-06-01", effectiveUntil: "", payType, baseAmount, overtimeHourlyRate: "150", overtimeHourlyEquivalent: "", overtimeMultiplier: "1", reason: "Synthetic terms" });
  await rate("alice", "MONTHLY", "30000"); await rate("bob", "HOURLY", "200"); await rate("dana", "DAILY", "1000"); await rate("erin", "MONTHLY", "25000");
  // Alice: paid leave on Thursday 6 June; company holiday on Friday 7 June.
  await absence.requestLeave(people.alice.who, { startAt: local("2030-06-06", "00:00").toISOString(), endAt: local("2030-06-07", "00:00").toISOString(), type: "PAID", category: "ANNUAL", reason: "Synthetic leave", operationKey: randomUUID() });
  const leave = await db.leaveRequest.findFirstOrThrow({ where: { employeeId: people.alice.id } });
  await absence.decideLeave(hr, { id: leave.id, revision: leave.revision, decision: "APPROVED" });
  await absence.saveHoliday(admin, { date: "2030-06-07", name: "Synthetic holiday", reason: "Synthetic company holiday" });
  // Monday: Alice leaves 30 minutes early in the morning (210 of 240 minutes), afternoon complete.
  await work("alice", "2030-06-03", "08:00", "11:30", 480); await work("alice", "2030-06-03", "13:00", "17:00", 780);
  // Tuesday: Alice arrives 20 minutes late; Wednesday complete; Saturday absent.
  await work("alice", "2030-06-04", "08:20", "12:00", 480); await work("alice", "2030-06-04", "13:00", "17:00", 780);
  await work("alice", "2030-06-05", "08:00", "12:00", 480); await work("alice", "2030-06-05", "13:00", "17:00", 780);
  // Bob (hourly): full Monday plus 30 minutes after the afternoon period. Dana (daily): full Monday, Tuesday morning only.
  await work("bob", "2030-06-03", "08:00", "12:00", 480); await work("bob", "2030-06-03", "13:00", "17:30", 780);
  await work("dana", "2030-06-03", "08:00", "12:00", 480); await work("dana", "2030-06-03", "13:00", "17:00", 780); await work("dana", "2030-06-04", "08:00", "12:00", 480);
  // Carl checks in on Wednesday and never checks out.
  at(local("2030-06-05", "08:00")); await (await svc.attendance()).checkIn(people.carl.who, { slotId: await slot("carl", "2030-06-05", 480), workDate: "2030-06-05", operationKey: randomUUID() });
  at("2030-06-10T06:00:00Z");
}, 120000);
afterAll(async () => { vi.restoreAllMocks(); await db?.$disconnect(); await database?.stop(); });

describe("work-time accounting", () => {
  it("1, 3, 4: a 30-minute early checkout is missing time; the break is never expected work; two periods combine", async () => {
    const monday = await day("alice", "2030-06-03");
    expect(monday).toMatchObject({ requiredSeconds: 8 * 3600, regularSeconds: 8 * 3600 - 1800, missingSeconds: 1800, confirmedUnpaidSeconds: 1800, pendingSeconds: 0, earlySeconds: 1800, absenceCount: 0 });
  });
  it("2: a late arrival is identified and its minutes are missing once", async () => {
    expect(await day("alice", "2030-06-04")).toMatchObject({ lateSeconds: 1200, missingSeconds: 1200, regularSeconds: 8 * 3600 - 1200 });
  });
  it("5: an open session is never closed or treated as absence; its shortfall stays pending", async () => {
    const wednesday = await day("carl", "2030-06-05");
    expect(wednesday).toMatchObject({ pending: true, confirmedUnpaidSeconds: 0, incompleteCount: 1, absenceCount: 0 });
    expect(wednesday.pendingSeconds).toBe(wednesday.missingSeconds);
    expect(await db.attendanceSession.count({ where: { employeeId: people.carl.id, checkoutAt: null } })).toBe(1);
  });
  it("6: approved paid leave, a holiday and a rest day are not missing time; an unworked scheduled day is", async () => {
    expect(await day("alice", "2030-06-06")).toMatchObject({ requiredSeconds: 0, paidLeaveSeconds: 8 * 3600, missingSeconds: 0 });
    expect(await day("alice", "2030-06-07")).toMatchObject({ requiredSeconds: 0, paidLeaveSeconds: 8 * 3600, missingSeconds: 0 });
    expect(await day("alice", "2030-06-09")).toMatchObject({ scheduledSeconds: 0, requiredSeconds: 0, missingSeconds: 0 });
    expect(await day("alice", "2030-06-08")).toMatchObject({ requiredSeconds: 8 * 3600, missingSeconds: 8 * 3600, absenceCount: 2 });
  });
  it("10: time outside the assigned periods is not ordinary work", async () => {
    expect(await day("bob", "2030-06-03")).toMatchObject({ requiredSeconds: 8 * 3600, regularSeconds: 8 * 3600, missingSeconds: 0, extraSeconds: 1800 });
  });
  it("8: staff record time away while checked in; it is pending and changes nothing until reviewed", async () => {
    const w = await svc.work();
    const id = await w.createMissingTime(hr, { employeeId: people.alice.id, date: "2030-06-04", start: "10:00", end: "10:30", category: "AWAY_FROM_WORK", reason: "Observed away from the desk", evidenceNote: "Supervisor note" });
    expect(await db.missingTimeRecord.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "PENDING", reportedBy: hr.userId });
    expect(await day("alice", "2030-06-04")).toMatchObject({ missingSeconds: 1200, pending: true, confirmedUnpaidSeconds: 0, pendingSeconds: 1200 + 1800 });
  });
  it("7: no record for time already missing from attendance, and no overlapping records", async () => {
    const w = await svc.work();
    await expect(w.createMissingTime(hr, { employeeId: people.alice.id, date: "2030-06-03", start: "11:30", end: "12:00", category: "OTHER", reason: "Left early" })).rejects.toMatchObject({ code: "NOT_WORKED" });
    await expect(w.createMissingTime(hr, { employeeId: people.alice.id, date: "2030-06-04", start: "10:15", end: "10:45", category: "OTHER", reason: "Overlap" })).rejects.toMatchObject({ code: "OVERLAP" });
    await expect(w.createMissingTime(hr, { employeeId: people.alice.id, date: "2030-06-20", start: "10:00", end: "10:30", category: "OTHER", reason: "Future" })).rejects.toMatchObject({ code: "FUTURE" });
  });
  it("confirmed away time is deducted exactly once, also after reopening and confirming again", async () => {
    const w = await svc.work(), record = await db.missingTimeRecord.findFirstOrThrow({ where: { employeeId: people.alice.id } });
    await w.reviewMissingTime(hr, { id: record.id, revision: record.revision, decision: "CONFIRMED", note: "Confirmed with the supervisor" });
    const confirmed = { missingSeconds: 1200 + 1800, confirmedUnpaidSeconds: 3000, pendingSeconds: 0, awayConfirmedSeconds: 1800 };
    expect(await day("alice", "2030-06-04")).toMatchObject(confirmed);
    let r = await db.missingTimeRecord.findUniqueOrThrow({ where: { id: record.id } });
    await w.reopenMissingTime(hr, { id: r.id, revision: r.revision, reason: "Second look" });
    expect(await day("alice", "2030-06-04")).toMatchObject({ missingSeconds: 1200, pending: true });
    r = await db.missingTimeRecord.findUniqueOrThrow({ where: { id: record.id } });
    await w.reviewMissingTime(hr, { id: r.id, revision: r.revision, decision: "CONFIRMED", note: "Confirmed again" });
    expect(await day("alice", "2030-06-04")).toMatchObject(confirmed);
    const actions = (await db.auditLog.findMany({ where: { entityId: record.id }, orderBy: { eventTime: "asc" } })).map(a => a.action);
    expect(actions).toEqual(["MISSING_TIME_RECORDED", "MISSING_TIME_CONFIRMED", "MISSING_TIME_REOPENED", "MISSING_TIME_CONFIRMED"]);
    // A confirmed record's time cannot be rewritten or deleted, even directly in the database.
    await expect(db.missingTimeRecord.update({ where: { id: record.id }, data: { endAt: local("2030-06-04", "11:00"), revision: { increment: 1 } } })).rejects.toThrow();
    await expect(db.missingTimeRecord.delete({ where: { id: record.id } })).rejects.toThrow();
  });
  it("employees see and answer only their own records; they cannot decide them", async () => {
    const w = await svc.work(), record = await db.missingTimeRecord.findFirstOrThrow({ where: { employeeId: people.alice.id } });
    await expect(w.respondToMissingTime(people.bob.who, { id: record.id, revision: record.revision, response: "Not mine" })).rejects.toMatchObject({ status: 404 });
    await expect(w.reviewMissingTime(people.alice.who, { id: record.id, revision: record.revision, decision: "REJECTED", note: "No" })).rejects.toMatchObject({ status: 403 });
    await w.respondToMissingTime(people.alice.who, { id: record.id, revision: record.revision, response: "I was helping a customer at the front." });
    const next = await db.missingTimeRecord.findUniqueOrThrow({ where: { id: record.id } });
    await expect(w.respondToMissingTime(people.alice.who, { id: next.id, revision: next.revision, response: "Again" })).rejects.toMatchObject({ code: "RESPONDED" });
    const own = await w.ownWorkTime(people.alice.who, { month: "2030-06" });
    expect(own!.records.map(r => r.employeeId)).toEqual([people.alice.id]);
    expect(own!.records[0]).toMatchObject({ effectiveMinutes: 30, employeeResponse: "I was helping a customer at the front." });
    expect((await w.ownWorkTime(people.bob.who, { month: "2030-06" }))!.records).toEqual([]);
    for (const call of [() => w.missingTimeList(people.alice.who), () => w.workTimeReport(people.alice.who, {})]) await expect(call()).rejects.toMatchObject({ status: 403 });
  });
  it("9: a pending report never reduces pay and blocks closeout; a rejected report never reduces pay", async () => {
    const w = await svc.work();
    await w.createMissingTime(hr, { employeeId: people.bob.id, date: "2030-06-03", start: "09:00", end: "09:30", category: "EXTENDED_BREAK", reason: "Long break" });
    const id = await w.createMissingTime(hr, { employeeId: people.dana.id, date: "2030-06-03", start: "09:00", end: "09:30", category: "OTHER", reason: "Unclear report" });
    const r = await db.missingTimeRecord.findUniqueOrThrow({ where: { id } });
    await w.reviewMissingTime(hr, { id, revision: r.revision, decision: "REJECTED", note: "Not substantiated" });
    expect(await day("dana", "2030-06-03")).toMatchObject({ missingSeconds: 0, pendingSeconds: 0, confirmedUnpaidSeconds: 0 });
    expect(await day("bob", "2030-06-03")).toMatchObject({ missingSeconds: 0, pendingSeconds: 1800, pending: true });
  });
});

describe("compensation", () => {
  let period: Awaited<ReturnType<PrismaClient["salaryPeriod"]["findFirstOrThrow"]>>;
  const pay = async (key: string) => {
    const { captureEmployee } = await import("@/features/pay/capture"), { calculatePay } = await import("@/features/pay/engine");
    const input = await db.$transaction(tx => captureEmployee(tx, period, people[key].id, now), { timeout: 30000 });
    return { ...calculatePay(input), blockers: input.blockers };
  };
  const covered = (segments: { coveredRegularSeconds: number }[]) => segments.reduce((n, s) => n + s.coveredRegularSeconds, 0);
  const planned = (segments: { scheduledSeconds: number }[]) => segments.reduce((n, s) => n + s.scheduledSeconds, 0);
  beforeAll(async () => {
    // Bob's pending record is confirmed, then his 30 minutes after the period are reviewed and approved as overtime.
    const w = await svc.work(), bob = await db.missingTimeRecord.findFirstOrThrow({ where: { employeeId: people.bob.id } });
    await w.reviewMissingTime(hr, { id: bob.id, revision: bob.revision, decision: "CONFIRMED", note: "Confirmed" });
    const overtime = await import("@/features/review/overtime");
    await overtime.calculateOvertime(hr, { employeeId: people.bob.id, week: "2030-06-03" });
    const review = await db.overtimeReview.findFirstOrThrow({ where: { employeeId: people.bob.id, weekStartDate: new Date("2030-06-03") } });
    await overtime.decideOvertime(hr, { id: review.id, revision: review.revision, decision: "APPROVED", approvedSeconds: 1800, comment: "Stayed to finish an order" });
    at("2030-07-02T06:00:00Z");
    await (await import("@/features/pay/periods")).createPeriod(hr, { month: "2030-06" });
    period = await db.salaryPeriod.findFirstOrThrow({ where: { startDate: new Date("2030-06-01") } });
  }, 60000);
  it("11: monthly base = salary × credited ÷ expected payable time (leave and holiday credited, missing time unpaid)", async () => {
    expect(period.calculationMethod).toBe("MONTHLY_ATTENDANCE");
    const result = await pay("alice"), segments = result.calculationSnapshot.segments;
    // 24 scheduled days × 8 h; credited: Mon 7.5 h, Tue 8 h − 20 min late − 30 min away, Wed 8 h, Thu leave 8 h, Fri holiday 8 h.
    expect(planned(segments)).toBe(24 * 28800);
    expect(covered(segments)).toBe(27000 + 25800 + 28800 + 28800 + 28800);
    expect(result.baseAmount).toBe("6041.67"); // 30000 × 139200 ÷ 691200 = 6041.666…
    expect(result.blockers).not.toContain("Pending missing-time review");
  });
  it("12, 15: hourly pay credits only payable scheduled time; approved overtime is paid separately", async () => {
    const result = await pay("bob");
    // Monday 8 h − 30 min confirmed away (the 30 min after 17:00 are not ordinary time) + the paid holiday on Friday.
    expect(covered(result.calculationSnapshot.segments)).toBe(28800 - 1800 + 28800);
    expect(result.baseAmount).toBe("3100.00"); // 200 × 15.5 h; the confirmed 30 minutes away are unpaid, once
    expect(result.overtimeAmount).toBe("75.00"); // 150 × 0.5 h approved overtime, outside the base
  });
  it("13: daily pay follows the existing partial-day rule (covered ÷ scheduled time, at most one day)", async () => {
    const result = await pay("dana"), units = result.calculationSnapshot.segments.filter(s => Number(s.dailyUnits) > 0).map(s => [s.date, s.dailyUnits]);
    expect(units).toEqual([["2030-06-03", "1"], ["2030-06-04", "0.5"], ["2030-06-07", "1"]]); // Friday is the paid holiday
    expect(result.baseAmount).toBe("2500.00");
  });
  it("14: zero expected payable time gives no salary amount and a clear blocker, never a division by zero", async () => {
    const result = await pay("erin");
    expect(result.baseAmount).toBe("0.00");
    expect(result.blockers.some(b => b.startsWith("Zero planned payable hours"))).toBe(true);
  });
  it("16: confirming missing time resets an unfinished month but never touches a finalized month", async () => {
    const w = await svc.work(), a = await svc.attendance();
    // Gina's May session (unscheduled work), then May is finalized (simulated directly in the disposable database).
    at(local("2030-05-06", "09:00")); const s = await a.checkInUnscheduled(people.gina.who, { operationKey: randomUUID() });
    at(local("2030-05-06", "13:00")); await a.checkOut(people.gina.who, { sessionId: s!.id, operationKey: randomUUID() });
    at("2030-07-02T06:00:00Z");
    await (await import("@/features/pay/periods")).createPeriod(hr, { month: "2030-05" });
    const may = await db.salaryPeriod.findFirstOrThrow({ where: { startDate: new Date("2030-05-01") } });
    await database.owner.query("BEGIN; SET LOCAL session_replication_role = replica");
    await database.owner.query(`UPDATE salary_periods SET status='FINALIZED',calculated_input_revision=input_revision,calculated_by=$2,calculated_at=now(),reviewed_by=$2,reviewed_at=now(),approved_by=$2,approved_at=now(),finalized_by=$2,finalized_at=now() WHERE id=$1`, [may.id, adminId]);
    await database.owner.query("COMMIT");
    const before = await db.salaryPeriod.findUniqueOrThrow({ where: { id: may.id } }), june = await db.salaryPeriod.findUniqueOrThrow({ where: { id: period.id } });
    const mayRecord = await w.createMissingTime(admin, { employeeId: people.gina.id, date: "2030-05-06", start: "10:00", end: "10:30", category: "OTHER", reason: "Away" });
    await w.reviewMissingTime(admin, { id: mayRecord, revision: 1, decision: "CONFIRMED", note: "Confirmed" });
    expect(await db.salaryPeriod.findUniqueOrThrow({ where: { id: may.id } })).toMatchObject({ status: "FINALIZED", inputRevision: before.inputRevision });
    const juneRecord = await w.createMissingTime(admin, { employeeId: people.dana.id, date: "2030-06-03", start: "10:00", end: "10:30", category: "OTHER", reason: "Away" });
    await w.reviewMissingTime(admin, { id: juneRecord, revision: 1, decision: "CONFIRMED", note: "Confirmed" });
    const after = await db.salaryPeriod.findUniqueOrThrow({ where: { id: period.id } });
    expect(after.status).toBe("DRAFT"); expect(after.inputRevision).toBeGreaterThan(june.inputRevision);
    period = after;
  });
});

describe("targets", () => {
  it("17, 18: weekly and monthly targets; a bulk assignment keeps one independent record per employee", async () => {
    at("2030-01-02T06:00:00Z"); const p = await svc.perf();
    const ids = await p.createTargets(hr, { employeeIds: [people.erin.id, people.frank.id, people.gina.id], periodType: "MONTHLY", periodDate: "2030-01-15", title: "Process orders", targetValue: 100, unit: "orders" });
    expect(ids).toHaveLength(3);
    const rows = await db.performanceTarget.findMany({ where: { id: { in: ids } } });
    expect(new Set(rows.map(r => r.assignmentGroup)).size).toBe(1);
    expect(rows.map(r => [r.periodStart.toISOString().slice(0, 10), r.periodEnd.toISOString().slice(0, 10)])).toEqual(Array(3).fill(["2030-01-01", "2030-01-31"]));
    const [weekly] = await p.createTargets(hr, { employeeIds: [people.erin.id], periodType: "WEEKLY", periodDate: "2030-01-09", title: "Answer tickets", targetValue: 20, unit: "tickets" });
    expect(await db.performanceTarget.findUniqueOrThrow({ where: { id: weekly } })).toMatchObject({ periodType: "WEEKLY", periodStart: new Date("2030-01-07"), periodEnd: new Date("2030-01-13") });
    const erin = rows.find(r => r.employeeId === people.erin.id)!;
    await p.recordTargetResult(hr, { id: erin.id, revision: erin.revision, actualValue: 80 });
    expect((await db.performanceTarget.findMany({ where: { id: { in: ids }, actualValue: { not: null } } })).map(r => r.employeeId)).toEqual([people.erin.id]);
  });
  it("only future targets can be redefined; a result correction needs a reason; cancelled targets are not scored", async () => {
    const p = await svc.perf(), started = await db.performanceTarget.findFirstOrThrow({ where: { employeeId: people.frank.id } });
    await expect(p.editTarget(hr, { id: started.id, revision: started.revision, title: "Changed", targetValue: 10, unit: "orders" })).rejects.toMatchObject({ code: "STARTED" });
    const [future] = await p.createTargets(hr, { employeeIds: [people.frank.id], periodType: "MONTHLY", periodDate: "2030-02-01", title: "Process orders", targetValue: 100, unit: "orders" });
    await p.editTarget(hr, { id: future, revision: 1, title: "Process orders", targetValue: 110, unit: "orders" });
    await p.editTarget(hr, { id: future, revision: 2, title: "Process orders", targetValue: 100, unit: "orders" });
    const erin = await db.performanceTarget.findFirstOrThrow({ where: { employeeId: people.erin.id, periodType: "MONTHLY" } });
    await expect(p.recordTargetResult(hr, { id: erin.id, revision: erin.revision, actualValue: 85 })).rejects.toMatchObject({ code: "NOTE" });
    const [extra] = await p.createTargets(hr, { employeeIds: [people.erin.id], periodType: "MONTHLY", periodDate: "2030-01-20", title: "Duplicate target", targetValue: 5, unit: "calls" });
    await p.cancelTarget(hr, { id: extra, revision: 1, reason: "Assigned by mistake" });
    expect((await db.auditLog.findMany({ where: { entityId: future } })).map(a => a.action)).toEqual(["TARGET_CREATED", "TARGET_EDITED", "TARGET_EDITED"]);
  });
  it("19, 21: an awaited result keeps the month incomplete instead of scoring zero", async () => {
    at("2030-02-02T06:00:00Z"); const p = await svc.perf();
    const frank = await p.assessmentDetail(hr, people.frank.id, "2030-01");
    const targets = frank.breakdown!.score.components.find(c => c.key === "targets")!;
    expect(targets).toMatchObject({ status: "INCOMPLETE", points: null });
    expect(frank.raw).toBeNull(); expect(frank.blockers.join(" ")).toContain("target result");
  });
  it("20: achievement is actual ÷ target, capped at 100 %, averaged over the month's targets", async () => {
    const p = await svc.perf(), weekly = await db.performanceTarget.findFirstOrThrow({ where: { employeeId: people.erin.id, periodType: "WEEKLY" } });
    await p.recordTargetResult(hr, { id: weekly.id, revision: weekly.revision, actualValue: 30 }); // 150 % → counts as 100 %
    const erin = await p.assessmentDetail(hr, people.erin.id, "2030-01");
    expect(erin.breakdown!.targets.items.map(t => t.achievement)).toEqual([1, 0.8]);
    expect(erin.breakdown!.score.components.find(c => c.key === "targets")).toMatchObject({ status: "COMPLETE", ratio: 0.9, max: 5, points: 4.5 });
  });
});

describe("monthly ratings, warnings, quarters and rankings", () => {
  const p = () => svc.perf();
  const finalize = async (key: string, month: string) => { const row = await db.performanceAssessment.findUniqueOrThrow({ where: { employeeId_month: { employeeId: people[key].id, month: new Date(`${month}-01`) } } }); return (await p()).finalizeAssessment(hr, { employeeId: people[key].id, month, revision: row.revision }); };
  const manual = async (key: string, month: string, score: number, comment = "") => { const row = await db.performanceAssessment.findUnique({ where: { employeeId_month: { employeeId: people[key].id, month: new Date(`${month}-01`) } } }); return (await p()).saveManualAssessment(hr, { employeeId: people[key].id, month, manualScore: score, comment, privateNote: "Private staff note", revision: row?.revision ?? 0 }); };
  const result = async (key: string, month: string, actual: number) => { const t = await db.performanceTarget.findFirstOrThrow({ where: { employeeId: people[key].id, periodType: "MONTHLY", status: "ACTIVE", periodStart: new Date(`${month}-01`) } }); await (await p()).recordTargetResult(hr, { id: t.id, revision: t.revision, actualValue: actual, note: t.actualValue === null ? "" : "Corrected count" }); };
  it("23: the manual score is 0-5 in steps of 0.5; a low score needs an explanation", async () => {
    for (const score of [5.5, -1, 3.3]) await expect(manual("erin", "2030-01", score)).rejects.toMatchObject({ code: "SCORE" });
    await expect(manual("erin", "2030-01", 2)).rejects.toMatchObject({ code: "COMMENT" });
    await manual("erin", "2030-01", 4);
  });
  it("29: a component without data is Not applicable and its weight goes to the others (no automatic zero)", async () => {
    const erin = await (await p()).assessmentDetail(hr, people.erin.id, "2030-01");
    expect(erin.breakdown!.score.components.map(c => [c.key, c.status, c.max])).toEqual([["workTime", "NOT_APPLICABLE", 0], ["tasks", "NOT_APPLICABLE", 0], ["targets", "COMPLETE", 5]]);
    expect(erin).toMatchObject({ raw: 4.5, deduction: 0, automated: 4.5, total: 8.5, blockers: [] });
  });
  it("January: finalize three employees; equal totals share a rank", async () => {
    await result("frank", "2030-01", 100); await manual("frank", "2030-01", 3.5); // 5.00 + 3.5 = 8.5
    await result("gina", "2030-01", 100); await manual("gina", "2030-01", 3); // 5.00 + 3 = 8.0
    for (const key of ["erin", "frank", "gina"]) await finalize(key, "2030-01");
    const jan = await db.performanceAssessment.findMany({ where: { month: new Date("2030-01-01") } });
    expect(jan.map(r => [r.employeeId, Number(r.totalScore)]).sort()).toEqual([[people.erin.id, 8.5], [people.frank.id, 8.5], [people.gina.id, 8]].sort());
  });
  it("22, 27: February with tasks: on-time completion is its own component and does not change the target score", async () => {
    at("2030-02-03T06:00:00Z");
    const tasks = await import("@/features/tasks/service");
    await tasks.assignTasks(hr, { employeeIds: [people.erin.id], title: "Close February tickets", description: "", assignedDate: "2030-02-03", dueDate: "2030-02-10", operationKey: randomUUID() });
    await tasks.assignTasks(hr, { employeeIds: [people.erin.id], title: "Update price list", description: "", assignedDate: "2030-02-03", dueDate: "2030-02-20", operationKey: randomUUID() });
    const [first] = await db.taskAssignment.findMany({ where: { employeeId: people.erin.id, title: "Close February tickets" } });
    at("2030-02-09T06:00:00Z"); await tasks.updateTaskProgress(people.erin.who, { id: first.id, revision: first.revision, status: "COMPLETED", note: "Done" });
    // Frank's February target was assigned in January (and edited while still in the future).
    await (await p()).createTargets(hr, { employeeIds: [people.erin.id, people.gina.id], periodType: "MONTHLY", periodDate: "2030-02-01", title: "February orders", targetValue: 100, unit: "orders" });
    at("2030-03-02T06:00:00Z");
    await result("erin", "2030-02", 90); await result("frank", "2030-02", 100); await result("gina", "2030-02", 60);
    const erin = await (await p()).assessmentDetail(hr, people.erin.id, "2030-02");
    // Tasks 1 of 2 on time (0.5) and targets 0.9 share the 5 points equally: 1.25 + 2.25 = 3.50.
    expect(erin.breakdown!.tasks).toMatchObject({ total: 2, onTime: 1, notCompleted: 1 });
    expect(erin.breakdown!.score.components.map(c => [c.key, c.points])).toEqual([["workTime", null], ["tasks", 1.25], ["targets", 2.25]]);
    expect(erin.raw).toBe(3.5);
    await manual("erin", "2030-02", 3.5); await manual("frank", "2030-02", 4); await manual("gina", "2030-02", 4);
    for (const key of ["erin", "frank", "gina"]) await finalize(key, "2030-02");
  });
  it("30, 31: only confirmed (published, released, not revoked) warnings deduct, using the configured mapping", async () => {
    at("2030-03-05T06:00:00Z");
    const records = await import("@/features/people-operations/records"), warning = (severity: string) => ({ employeeId: people.erin.id, employmentPeriodId: people.erin.period, issueDate: "2030-03-04", severity, reason: `Synthetic ${severity}`, description: "Synthetic", actionTaken: "Discussed", staffNotes: "Private", attachmentDocumentId: "", employeeVisible: true, acknowledgementRequested: false });
    const published = await records.createRecord(admin, "warnings", warning("WARNING"));
    await records.publishRecord(admin, "warnings", { id: published, revision: 1 });
    await records.createRecord(admin, "warnings", warning("SERIOUS_WARNING")); // draft: no effect
    const revoked = await records.createRecord(admin, "warnings", warning("FINAL_WARNING"));
    await records.publishRecord(admin, "warnings", { id: revoked, revision: 1 });
    const r = await db.disciplinaryRecord.findUniqueOrThrow({ where: { id: revoked } });
    await records.revokeWarning(admin, { id: revoked, revision: r.revision, reason: "Issued in error" });
    for (const key of ["erin", "frank"]) await (await p()).createTargets(hr, { employeeIds: [people[key].id], periodType: "MONTHLY", periodDate: "2030-03-01", title: "March orders", targetValue: 100, unit: "orders" });
    at("2030-04-02T06:00:00Z");
    await result("erin", "2030-03", 100); await result("frank", "2030-03", 50);
    const s = await p();
    await expect(s.updateWarningDeductions(hr, { NOTICE: 0.1, WARNING: 0.4, SERIOUS_WARNING: 0.5, FINAL_WARNING: 1 })).rejects.toMatchObject({ status: 403 });
    await s.updateWarningDeductions(admin, { NOTICE: 0.1, WARNING: 0.4, SERIOUS_WARNING: 0.5, FINAL_WARNING: 1 });
    expect((await s.assessmentDetail(hr, people.erin.id, "2030-03"))).toMatchObject({ raw: 5, deduction: 0.4 });
    await s.updateWarningDeductions(admin, { NOTICE: 0.1, WARNING: 0.25, SERIOUS_WARNING: 0.5, FINAL_WARNING: 1 });
    const erin = await s.assessmentDetail(hr, people.erin.id, "2030-03");
    expect(erin.breakdown!.warnings.map(w => [w.severity, w.points])).toEqual([["WARNING", 0.25]]);
    expect(erin).toMatchObject({ raw: 5, deduction: 0.25, automated: 4.75 });
    expect(Number(erin.manual ?? 0)).toBe(0);
  });
  it("24, 25, 32: March finalized: deduction applied once to the automated score; totals stay within 0-10", async () => {
    await manual("erin", "2030-03", 4); await manual("frank", "2030-03", 2, "Missed most March orders; coaching agreed.");
    for (const key of ["erin", "frank"]) await finalize(key, "2030-03");
    const erin = await db.performanceAssessment.findUniqueOrThrow({ where: { employeeId_month: { employeeId: people.erin.id, month: new Date("2030-03-01") } } });
    expect([erin.automatedRaw, erin.warningDeduction, erin.automatedFinal, erin.totalScore].map(Number)).toEqual([5, 0.25, 4.75, 8.75]);
    const frank = await db.performanceAssessment.findUniqueOrThrow({ where: { employeeId_month: { employeeId: people.frank.id, month: new Date("2030-03-01") } } });
    expect(Number(frank.totalScore)).toBe(4.5); // 2.0 manual + 2.50 automated
    const actions = (await db.auditLog.findMany({ where: { entityId: erin.id }, orderBy: { eventTime: "asc" } })).map(a => a.action);
    expect(actions).toContain("RATING_FINALIZED"); expect(actions).toContain("QUARTER_RATING_FINALIZED");
  });
  it("34, 35, 36, 37: quarter = average of three finalized months; incomplete quarters are provisional; ties share a rank", async () => {
    const ranking = await (await p()).ratingRanking(hr, { quarter: "2030-Q1" });
    // Erin: (8.50 + 7.00 + 8.75) ÷ 3 = 8.08; Frank: (8.50 + 9.00 + 4.50) ÷ 3 = 7.33. Gina has two months: provisional, unranked.
    expect(ranking.official.map(r => [r.name, r.rank, r.total, r.manual, r.automated])).toEqual([["WT erin", 1, 8.08, 3.83, 4.25], ["WT frank", 2, 7.33, 3.17, 4.17]]);
    expect(ranking.provisional.map(r => [r.name, r.status, r.months, r.total])).toEqual([["WT gina", "PROVISIONAL", 2, 7.5]]);
    expect(ranking.monthly[0].ranking.map(r => [r.name, r.rank])).toEqual([["WT erin", 1], ["WT frank", 1], ["WT gina", 3]]);
  });
  it("26, 33: work-time score uses 70 % minutes completed and 30 % days attended; confirmed away time lowers it", async () => {
    at("2030-07-02T06:00:00Z");
    const alice = await (await p()).assessmentDetail(hr, people.alice.id, "2030-06"), work = alice.breakdown!.workTime;
    // 22 eligible days (24 scheduled minus leave and holiday); credited 7.5 h + 7 h 10 min + 8 h; three days attended.
    expect(work).toMatchObject({ requiredSeconds: 22 * 28800, creditedSeconds: 27000 + 25800 + 28800, eligibleDays: 22, attendedDays: 3, confirmedAwaySeconds: 1800 });
    const expected = 0.7 * (81600 / (22 * 28800)) + 0.3 * (3 / 22);
    expect(alice.breakdown!.score.components[0]).toMatchObject({ key: "workTime", status: "COMPLETE", max: 5, points: Math.round(expected * 5 * 100) / 100 });
    const carl = await (await p()).assessmentDetail(hr, people.carl.id, "2030-06");
    expect(carl.breakdown!.score.components[0]).toMatchObject({ key: "workTime", status: "INCOMPLETE" });
  });
  it("38: finalized ratings are frozen snapshots; only an administrator can reopen them, with a reason", async () => {
    const s = await p(), before = await db.performanceAssessment.findUniqueOrThrow({ where: { employeeId_month: { employeeId: people.erin.id, month: new Date("2030-01-01") } } });
    await result("erin", "2030-01", 100); // later correction of January's result
    const after = await db.performanceAssessment.findUniqueOrThrow({ where: { id: before.id } });
    expect([after.totalScore, after.breakdown, after.revision]).toEqual([before.totalScore, before.breakdown, before.revision]);
    expect((await s.assessmentDetail(hr, people.erin.id, "2030-01")).total).toBe(8.5);
    await expect(db.performanceAssessment.update({ where: { id: before.id }, data: { totalScore: "9.99", revision: { increment: 1 } } })).rejects.toThrow();
    await expect(s.reopenAssessment(hr, { employeeId: people.erin.id, month: "2030-01", revision: before.revision, reason: "Corrected result" })).rejects.toMatchObject({ status: 403 });
    await s.reopenAssessment(admin, { employeeId: people.erin.id, month: "2030-01", revision: before.revision, reason: "Corrected result" });
    const log = await db.auditLog.findFirstOrThrow({ where: { entityId: before.id, action: "RATING_REOPENED" } });
    expect((log.before as { totalScore: string }).totalScore).toBe("8.50");
    const reopened = await s.assessmentDetail(hr, people.erin.id, "2030-01");
    expect(reopened).toMatchObject({ status: "DRAFT", manual: 4, raw: 5, total: 9 }); // (1 + 1) ÷ 2 × 5 = 5.00
  });
});

describe("permissions and privacy", () => {
  it("39-43: employees see only their own finalized ratings and targets, never notes, rankings or settings", async () => {
    const s = await svc.perf();
    for (const call of [() => s.assessmentRoster(people.alice.who, {}), () => s.targetList(people.alice.who, {}), () => s.ratingRanking(people.alice.who, {}), () => s.assessmentDetail(people.alice.who, people.erin.id, "2030-01"),
      () => s.saveManualAssessment(people.erin.who, { employeeId: people.erin.id, month: "2030-02", manualScore: 5 }), () => s.finalizeAssessment(people.erin.who, { employeeId: people.erin.id, month: "2030-02", revision: 1 }),
      () => s.updateWarningDeductions(people.erin.who, { NOTICE: 0, WARNING: 0, SERIOUS_WARNING: 0, FINAL_WARNING: 0 }), () => s.createTargets(people.erin.who, { employeeIds: [people.erin.id], periodType: "MONTHLY", periodDate: "2030-08-01", title: "Self", targetValue: 1, unit: "x" })])
      await expect(call()).rejects.toMatchObject({ status: 403 });
    const own = await s.ownRatings(people.erin.who);
    expect(own!.monthly.map(m => m.month)).toEqual(["2030-03-01", "2030-02-01"]); // January is reopened (draft)
    expect(JSON.stringify(own)).not.toContain("Private staff note");
    expect(own!.targets.every(t => t.employeeId === people.erin.id)).toBe(true);
    expect(own!.quarters).toEqual([expect.objectContaining({ key: "2030-Q1", status: "PROVISIONAL", months: 2 })]);
    expect(await s.ownRatings(people.bob.who)).toMatchObject({ monthly: [], targets: [] });
  });
  it("an HR manager cannot rate, target or record missing time about themselves; an administrator can", async () => {
    const s = await svc.perf(), w = await svc.work(), self = people.hrself;
    await expect(s.saveManualAssessment(self.who, { employeeId: self.id, month: "2030-02", manualScore: 5 })).rejects.toMatchObject({ code: "SELF_RECORD" });
    await expect(s.createTargets(self.who, { employeeIds: [self.id], periodType: "MONTHLY", periodDate: "2030-08-01", title: "Self", targetValue: 1, unit: "x" })).rejects.toMatchObject({ code: "SELF_RECORD" });
    await expect(w.createMissingTime(self.who, { employeeId: self.id, date: "2030-06-03", start: "09:00", end: "09:30", category: "OTHER", reason: "Self" })).rejects.toMatchObject({ code: "SELF_RECORD" });
    const roster = await s.assessmentRoster(self.who, { month: "2030-02" });
    expect(roster.records.map(r => r.employee.id)).not.toContain(self.id);
    await s.saveManualAssessment(admin, { employeeId: self.id, month: "2030-02", manualScore: 4, revision: 0 });
  });
});
