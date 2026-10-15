import "server-only";
import { z } from "zod";
import type { MissingTimeRecord, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db/client";
import { audit, type Database } from "@/lib/db/audit";
import { authorizedMutation } from "@/lib/db/mutation";
import { securityBoundary } from "@/lib/authorization/actor";
import { assertRole } from "@/lib/authorization/policy";
import { validated, uuidSchema, dateSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import type { Actor, Identity } from "@/types/auth";
import { databaseNow } from "@/features/time/clock";
import { addDays, dateKey, dateValue, localDate, localInstant } from "@/features/time/dates";
import { notify } from "@/features/review/notifications";
import { invalidateOvertime } from "@/features/review/overtime";
import { summary } from "@/features/review/summary";
import { range } from "@/features/review/data";
import { rangeFields } from "@/features/review/validation";
import { interval, intersect, seconds, union } from "@/features/review/calculation";
import { missingTimeCategories, missingTimeStatuses } from "./options";
/*
 * Work-time accounting. Scheduled-time shortfalls are calculated from the authoritative schedule and attendance
 * (summary()); this module adds what timestamps cannot show: time an employee was away while still checked in.
 * Such a record removes its interval from verified work only once CONFIRMED, and summary() subtracts it from the
 * union of worked time, so the same minutes are never deducted twice. Pending reports never reduce pay; they block
 * salary closeout and overtime review until decided. Records are never deleted.
 */
const keys = <T extends Record<string, unknown>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
const optionalId = z.union([uuidSchema, z.literal(""), z.null()]).optional().transform(v => v || null);
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time such as 10:30.");
const revision = { id: uuidSchema, revision: z.coerce.number().int().positive() };
const createSchema = z.object({
  employeeId: uuidSchema, date: dateSchema, start: clock, end: clock, endsNextDay: z.boolean().default(false), category: z.enum(keys(missingTimeCategories)),
  reason: z.string().trim().min(1, "Describe what was observed.").max(1000), evidenceNote: z.string().trim().max(2000).default(""),
}).strict();
const reviewSchema = z.object({ ...revision, decision: z.enum(["CONFIRMED", "REJECTED"]), note: z.string().trim().min(1, "Add a short decision note.").max(1000) }).strict();
const reopenSchema = z.object({ ...revision, reason: z.string().trim().min(1, "Explain why the decision is reopened.").max(1000) }).strict();
const respondSchema = z.object({ ...revision, response: z.string().trim().min(1, "Write your response.").max(2000) }).strict();
const listSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1), employeeId: optionalId, departmentId: optionalId, status: z.union([z.enum(keys(missingTimeStatuses)), z.literal("")]).default(""),
  from: z.union([dateSchema, z.literal("")]).default(""), to: z.union([dateSchema, z.literal("")]).default(""),
}).strict();
const reportSchema = z.object({ employeeId: optionalId, departmentId: optionalId, ...rangeFields, status: z.enum(["", "ALL", "SHORTFALL", "PENDING"]).default(""), page: z.coerce.number().int().min(1).max(10000).default(1) }).strict();
const ownSchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }).strict();
const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
/** Staff guard. An HR manager never records or decides their own work-time records; an administrator does. */
function staff(actor: Actor, employeeId?: string) {
  assertRole(actor, ["ADMIN", "HR_MANAGER"]);
  if (actor.role === "HR_MANAGER" && employeeId && actor.employeeId === employeeId) throw new AppError(403, "SELF_RECORD", "An administrator must manage work-time records about you.");
}
const notOwn = (actor: Actor): Prisma.MissingTimeRecordWhereInput => actor.role === "HR_MANAGER" && actor.employeeId ? { employeeId: { not: actor.employeeId } } : {};
async function load(tx: Database, id: string) { const r = await tx.missingTimeRecord.findUnique({ where: { id } }); if (!r) throw new AppError(404, "NOT_FOUND", "Missing-time record not found."); return r; }
function fresh(r: MissingTimeRecord, value: number) { if (r.revision !== value) throw new AppError(409, "STALE", "This record changed since the page loaded. Refresh and try again."); }
const snapshot = (r: MissingTimeRecord) => ({ status: r.status, workDate: dateKey(r.workDate), startAt: r.startAt.toISOString(), endAt: r.endAt.toISOString(), category: r.category, reason: r.reason, sessionId: r.attendanceSessionId, decisionNote: r.decisionNote, response: r.employeeResponse, revision: r.revision });
async function change(tx: Database, actor: Actor, r: MissingTimeRecord, data: Prisma.MissingTimeRecordUpdateInput, action: string, reason?: string) {
  const next = await tx.missingTimeRecord.update({ where: { id: r.id }, data: { ...data, revision: { increment: 1 } } });
  await audit({ actorUserId: actor.userId, employeeId: r.employeeId, action, entity: "missing_time_records", entityId: r.id, ...(reason ? { reason } : {}), before: snapshot(r), after: snapshot(next) }, tx);
  return next;
}
async function mutate<T>(identity: Identity | null, operation: (actor: Actor, tx: Database) => Promise<T>) {
  await securityBoundary(identity, async actor => staff(actor));
  return authorizedMutation(identity, async (actor, tx) => { staff(actor); return operation(actor, tx); });
}
/** Seconds of a record that fall inside the employee's recorded attendance (open sessions count up to now). */
function effectiveSeconds(record: { startAt: Date; endAt: Date }, sessions: { checkinAt: Date; checkoutAt: Date | null }[], now: Date) {
  return seconds(intersect([interval(record.startAt, record.endAt)], union(sessions.map(s => interval(s.checkinAt, s.checkoutAt ?? now)))));
}
export async function createMissingTime(identity: Identity | null, input: unknown) {
  const v = validated(createSchema, input);
  return mutate(identity, async (actor, tx) => {
    staff(actor, v.employeeId);
    if (!await tx.employee.findUnique({ where: { id: v.employeeId }, select: { id: true } })) throw new AppError(404, "NOT_FOUND", "Employee not found.");
    const zone = (await tx.organizationSettings.findUniqueOrThrow({ where: { id: 1 }, select: { timezone: true } })).timezone, now = await databaseNow(tx);
    const startAt = localInstant(v.date, minutes(v.start), zone), endAt = localInstant(v.endsNextDay ? addDays(v.date, 1) : v.date, minutes(v.end), zone);
    if (endAt <= startAt) throw new AppError(400, "INTERVAL", "The end must be after the start. Tick “ends next day” for time after midnight.");
    if (endAt > now) throw new AppError(400, "FUTURE", "Record only time that has already passed.");
    const sessions = await tx.attendanceSession.findMany({ where: { employeeId: v.employeeId, voidedAt: null, checkinAt: { lt: endAt }, OR: [{ checkoutAt: null }, { checkoutAt: { gt: startAt } }] }, select: { id: true, checkinAt: true, checkoutAt: true } });
    const overlaps = sessions.map(s => ({ id: s.id, seconds: effectiveSeconds({ startAt, endAt }, [s], now) })).filter(o => o.seconds > 0).sort((a, b) => b.seconds - a.seconds);
    // A shortfall already visible from attendance needs no record (and must not be recorded twice).
    if (!overlaps.length) throw new AppError(400, "NOT_WORKED", "No attendance session covers this time, so it already counts as missing from attendance. No separate record is needed.");
    if (await tx.missingTimeRecord.count({ where: { employeeId: v.employeeId, status: { not: "REJECTED" }, startAt: { lt: endAt }, endAt: { gt: startAt } } })) throw new AppError(409, "OVERLAP", "This time overlaps another missing-time record for this employee.");
    const row = await tx.missingTimeRecord.create({ data: { employeeId: v.employeeId, attendanceSessionId: overlaps[0].id, workDate: dateValue(v.date), startAt, endAt, category: v.category, reason: v.reason, evidenceNote: v.evidenceNote, reportedBy: actor.userId } });
    await audit({ actorUserId: actor.userId, employeeId: row.employeeId, action: "MISSING_TIME_RECORDED", entity: "missing_time_records", entityId: row.id, after: snapshot(row) }, tx);
    await notify(tx, row.employeeId, "MISSING_TIME_RECORDED", "missing_time_records", row.id, `missing-time:${row.id}:recorded`, "Time away from work was recorded for review. You can see it and respond under Work time.");
    return row.id;
  });
}
/** Confirm (the interval becomes unpaid, once) or reject (no effect on pay). */
export async function reviewMissingTime(identity: Identity | null, input: unknown) {
  const v = validated(reviewSchema, input);
  return mutate(identity, async (actor, tx) => {
    const r = await load(tx, v.id); staff(actor, r.employeeId); fresh(r, v.revision);
    if (r.status !== "PENDING") throw new AppError(409, "STATUS", "This record already has a decision. Reopen it to decide again.");
    const now = await databaseNow(tx);
    const next = await change(tx, actor, r, { status: v.decision, reviewedBy: actor.userId, reviewedAt: now, decisionNote: v.note }, v.decision === "CONFIRMED" ? "MISSING_TIME_CONFIRMED" : "MISSING_TIME_REJECTED", v.note);
    if (v.decision === "CONFIRMED") await invalidateOvertime(tx, r.employeeId, actor.userId, r.startAt, r.endAt, now);
    await notify(tx, r.employeeId, "MISSING_TIME_DECIDED", "missing_time_records", r.id, `missing-time:${r.id}:decided:${next.revision}`, v.decision === "CONFIRMED" ? "Recorded time away from work was confirmed and is unpaid." : "A missing-time report about you was rejected; it does not affect your pay.");
  });
}
/** Returns a decided record to review; a previously confirmed interval stops counting until decided again. */
export async function reopenMissingTime(identity: Identity | null, input: unknown) {
  const v = validated(reopenSchema, input);
  return mutate(identity, async (actor, tx) => {
    const r = await load(tx, v.id); staff(actor, r.employeeId); fresh(r, v.revision);
    if (r.status === "PENDING") throw new AppError(409, "STATUS", "This record is already awaiting review.");
    if (r.status === "REJECTED" && await tx.missingTimeRecord.count({ where: { employeeId: r.employeeId, id: { not: r.id }, status: { not: "REJECTED" }, startAt: { lt: r.endAt }, endAt: { gt: r.startAt } } })) throw new AppError(409, "OVERLAP", "Another record now covers this time.");
    await change(tx, actor, r, { status: "PENDING", reviewedBy: null, reviewedAt: null, decisionNote: null }, "MISSING_TIME_REOPENED", v.reason);
    if (r.status === "CONFIRMED") await invalidateOvertime(tx, r.employeeId, actor.userId, r.startAt, r.endAt, await databaseNow(tx));
  });
}
/** The employee's one response (an explanation or a dispute); the decision stays with staff. */
export async function respondToMissingTime(identity: Identity | null, input: unknown) {
  const v = validated(respondSchema, input);
  return authorizedMutation(identity, async (actor, tx) => {
    const r = await tx.missingTimeRecord.findUnique({ where: { id: v.id } });
    if (!r || !actor.employeeId || r.employeeId !== actor.employeeId) throw new AppError(404, "NOT_FOUND", "Missing-time record not found.");
    fresh(r, v.revision);
    if (r.respondedAt) throw new AppError(409, "RESPONDED", "You have already responded to this record.");
    if (r.status === "REJECTED") throw new AppError(409, "STATUS", "This report was rejected and does not affect you.");
    await change(tx, actor, r, { employeeResponse: v.response, respondedAt: await databaseNow(tx) }, "MISSING_TIME_RESPONSE");
    await notify(tx, r.employeeId, "STAFF_MISSING_TIME_RESPONSE", "missing_time_records", r.id, `missing-time:${r.id}:response`, "An employee responded to a missing-time record.", true);
  });
}
async function withEffect<T extends MissingTimeRecord>(client: Database, rows: T[], now: Date) {
  if (!rows.length) return [];
  const from = new Date(Math.min(...rows.map(r => r.startAt.getTime()))), until = new Date(Math.max(...rows.map(r => r.endAt.getTime())));
  const sessions = await client.attendanceSession.findMany({ where: { employeeId: { in: [...new Set(rows.map(r => r.employeeId))] }, voidedAt: null, checkinAt: { lt: until }, OR: [{ checkoutAt: null }, { checkoutAt: { gt: from } }] }, select: { employeeId: true, checkinAt: true, checkoutAt: true } });
  return rows.map(r => ({ ...r, minutes: Math.round((r.endAt.getTime() - r.startAt.getTime()) / 60000), effectiveMinutes: Math.round(effectiveSeconds(r, sessions.filter(s => s.employeeId === r.employeeId), now) / 60) }));
}
const departmentFilter = (departmentId: string | null, from: string, until: string): Prisma.EmployeeWhereInput => departmentId ? { employmentPeriods: { some: { departmentId, startDate: { lt: dateValue(until) }, OR: [{ endDate: null }, { endDate: { gt: dateValue(from) } }] } } } : {};
/** Staff list of missing-time records with filters (an HR manager does not see records about themselves). */
export async function missingTimeList(identity: Identity | null, query: unknown = {}) {
  return securityBoundary(identity, async actor => {
    staff(actor); const v = validated(listSchema, query), now = await databaseNow(db);
    const employeeIds = v.departmentId ? (await db.employee.findMany({ where: departmentFilter(v.departmentId, v.from || "1900-01-01", v.to ? addDays(v.to, 1) : "9999-01-01"), select: { id: true } })).map(e => e.id) : null;
    const where: Prisma.MissingTimeRecordWhereInput = { ...notOwn(actor), ...(v.employeeId ? { employeeId: v.employeeId } : {}), ...(employeeIds ? { employeeId: { in: employeeIds } } : {}), ...(v.status ? { status: v.status } : {}),
      ...(v.from || v.to ? { workDate: { ...(v.from ? { gte: dateValue(v.from) } : {}), ...(v.to ? { lte: dateValue(v.to) } : {}) } } : {}) };
    if (v.employeeId && employeeIds && !employeeIds.includes(v.employeeId)) where.employeeId = { in: [] };
    const rows = await db.missingTimeRecord.findMany({ where, orderBy: [{ startAt: "desc" }, { id: "desc" }], skip: (v.page - 1) * 25, take: 26 });
    const people = new Map((await db.employee.findMany({ where: { id: { in: rows.map(r => r.employeeId) } }, select: { id: true, legalName: true, employeeNumber: true } })).map(e => [e.id, e]));
    const [employees, departments, settings] = await Promise.all([
      db.employee.findMany({ where: actor.role === "HR_MANAGER" && actor.employeeId ? { id: { not: actor.employeeId } } : {}, orderBy: { legalName: "asc" }, take: 300, select: { id: true, legalName: true, employeeNumber: true } }),
      db.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      db.organizationSettings.findUniqueOrThrow({ where: { id: 1 }, select: { timezone: true } })]);
    return { records: (await withEffect(db, rows.slice(0, 25), now)).map(r => ({ ...r, employee: people.get(r.employeeId)! })), hasNext: rows.length > 25, page: v.page, employees, departments, timezone: settings.timezone, today: localDate(now, settings.timezone) };
  });
}
type Totals = { requiredSeconds: number; paidLeaveSeconds: number; regularSeconds: number; missingSeconds: number; confirmedUnpaidSeconds: number; pendingSeconds: number; awayConfirmedSeconds: number };
/** One employee's work-time days for a range: scheduled payable, verified, missing, confirmed and pending time. */
async function employeeDays(tx: Database, employeeId: string, from: string, until: string, now: Date) {
  const facts = await summary(tx, employeeId, from, until, now);
  const days = facts.days.map(d => {
    // Pending corrections, missing checkouts or undecided away-time keep a shortfall provisional (never "confirmed").
    const pending = d.pendingCorrections > 0 || d.incompleteCount > 0 || d.pendingMissingReviews > 0;
    return {
      date: d.date, scheduledSeconds: d.scheduledSeconds, requiredSeconds: d.requiredSeconds, paidLeaveSeconds: d.paidAbsenceSeconds, actualSeconds: d.actualSeconds,
      regularSeconds: Math.max(0, d.requiredSeconds - d.missingSeconds), missingSeconds: d.missingEndedSeconds, confirmedUnpaidSeconds: pending ? 0 : d.missingEndedSeconds,
      pendingSeconds: (pending ? d.missingEndedSeconds : 0) + d.pendingMissingSeconds, awayConfirmedSeconds: d.confirmedMissingSeconds, lateSeconds: d.lateSeconds, earlySeconds: d.earlySeconds,
      absenceCount: d.absenceCount, pendingCorrections: d.pendingCorrections, incompleteCount: d.incompleteCount, pendingAway: d.pendingMissingReviews, extraSeconds: d.extraSeconds, pending,
    };
  });
  const totals = days.reduce<Totals>((t, d) => ({ requiredSeconds: t.requiredSeconds + d.requiredSeconds, paidLeaveSeconds: t.paidLeaveSeconds + d.paidLeaveSeconds, regularSeconds: t.regularSeconds + d.regularSeconds, missingSeconds: t.missingSeconds + d.missingSeconds, confirmedUnpaidSeconds: t.confirmedUnpaidSeconds + d.confirmedUnpaidSeconds, pendingSeconds: t.pendingSeconds + d.pendingSeconds, awayConfirmedSeconds: t.awayConfirmedSeconds + d.awayConfirmedSeconds }),
    { requiredSeconds: 0, paidLeaveSeconds: 0, regularSeconds: 0, missingSeconds: 0, confirmedUnpaidSeconds: 0, pendingSeconds: 0, awayConfirmedSeconds: 0 });
  const weekStarts = await tx.overtimeReview.findMany({ where: { employeeId, weekStartDate: { gte: dateValue(addDays(from, -6)), lt: dateValue(until) } }, select: { status: true, potentialSecondsSnapshot: true, approvedSeconds: true } });
  return { days, totals: { ...totals, potentialOvertimeSeconds: weekStarts.reduce((n, w) => n + w.potentialSecondsSnapshot, 0), approvedOvertimeSeconds: weekStarts.filter(w => w.status === "APPROVED").reduce((n, w) => n + w.approvedSeconds, 0) } };
}
/** Staff work-time report: totals per employee plus the days with shortfalls or items awaiting review. */
export async function workTimeReport(identity: Identity | null, query: unknown = {}) {
  return securityBoundary(identity, async actor => {
    staff(actor); const v = validated(reportSchema, query);
    return db.$transaction(async tx => {
      const settings = await tx.organizationSettings.findUniqueOrThrow({ where: { id: 1 } }), now = await databaseNow(tx), r = range(v, localDate(now, settings.timezone), settings.weekStartDay);
      const employees = await tx.employee.findMany({ where: { ...(v.employeeId ? { id: v.employeeId } : {}), ...departmentFilter(v.departmentId, r.from, r.until), employmentPeriods: { some: { startDate: { lt: dateValue(r.until) }, OR: [{ endDate: null }, { endDate: { gt: dateValue(r.from) } }] } } },
        orderBy: [{ legalName: "asc" }, { id: "asc" }], skip: (v.page - 1) * 10, take: 11, select: { id: true, legalName: true, employeeNumber: true } });
      const rows = [];
      for (const employee of employees.slice(0, 10)) {
        const data = await employeeDays(tx, employee.id, r.from, r.until, now);
        const days = data.days.filter(d => v.status === "ALL" || (v.status === "SHORTFALL" ? d.missingSeconds > 0 || d.pendingSeconds > 0 : v.status === "PENDING" ? d.pending : d.scheduledSeconds > 0 || d.actualSeconds > 0 || d.paidLeaveSeconds > 0 || d.pending));
        rows.push({ employee, totals: data.totals, days });
      }
      return { rows, from: r.from, to: r.to, until: r.until, label: r.label, mode: r.mode, timezone: settings.timezone, page: v.page, hasNext: employees.length > 10,
        employees: await tx.employee.findMany({ orderBy: { legalName: "asc" }, take: 300, select: { id: true, legalName: true, employeeNumber: true } }),
        departments: await tx.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) };
    }, { isolationLevel: "RepeatableRead", timeout: 15000 });
  });
}
/** The signed-in employee's own month: totals, days with shortfalls and their missing-time records. */
export async function ownWorkTime(identity: Identity | null, query: unknown = {}) {
  return securityBoundary(identity, async actor => {
    const v = validated(ownSchema, query);
    if (!actor.employeeId) return null;
    const employeeId = actor.employeeId;
    return db.$transaction(async tx => {
      const settings = await tx.organizationSettings.findUniqueOrThrow({ where: { id: 1 }, select: { timezone: true } }), now = await databaseNow(tx), today = localDate(now, settings.timezone);
      const month = v.month ?? today.slice(0, 7), from = `${month}-01`, until = addDays(`${month}-01`, 31).slice(0, 7) + "-01";
      const data = await employeeDays(tx, employeeId, from, until, now);
      const records = await tx.missingTimeRecord.findMany({ where: { employeeId }, orderBy: [{ startAt: "desc" }], take: 50 });
      return { month, from, until, timezone: settings.timezone, ...data, days: data.days.filter(d => d.missingSeconds > 0 || d.pendingSeconds > 0), records: await withEffect(tx, records, now) };
    }, { isolationLevel: "RepeatableRead", timeout: 15000 });
  });
}
