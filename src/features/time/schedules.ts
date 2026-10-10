import "server-only";
import { assertRole } from "@/lib/authorization/policy";
import { securityBoundary } from "@/lib/authorization/actor";
import { authorizedMutation } from "@/lib/db/mutation";
import { audit, type Database } from "@/lib/db/audit";
import { validated } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import type { Identity } from "@/types/auth";
import { publishSchema, type SlotInput } from "./validation";
import { validatePattern, validateVersionBoundaries } from "./occurrences";
import { databaseNow } from "./clock";
import { dateValue, dateKey, localDate, addDays } from "./dates";

export const patternInclude = { slots: { orderBy: [{ weekday: "asc" as const }, { startMinute: "asc" as const }] }, employmentPeriod: { select: { startDate: true, endDate: true } } };
export async function timeEvent(tx: Database, employeeId: string, actorUserId: string, now: Date, type: string, title: string, sourceType: string, sourceId: string) {
  await tx.employeeActivity.create({ data: { employeeId, createdBy: actorUserId, eventTime: now, type, title, description: "", sourceType, sourceId, employeeVisible: true } });
}
export async function publishSchedule(identity: Identity | null, input: unknown) {
  await securityBoundary(identity, async actor => assertRole(actor, ["ADMIN", "HR_MANAGER"]));
  const value = validated(publishSchema, input);
  validatePattern(value.slots); if (value.restoreSlots) validatePattern(value.restoreSlots);
  try { return await authorizedMutation(identity, async (actor, tx) => {
    assertRole(actor, ["ADMIN", "HR_MANAGER"]);
    await tx.$queryRaw`SELECT id FROM employees WHERE id=${value.employeeId}::uuid FOR UPDATE`;
    const settings = await tx.organizationSettings.findUniqueOrThrow({ where: { id: 1 } });
    const now = await databaseNow(tx), today = localDate(now, settings.timezone);
    const employee = await tx.employee.findUnique({ where: { id: value.employeeId }, select: { user: { select: { isActive: true } } } });
    if (!employee) throw new AppError(404, "NOT_FOUND", "Employee record not found.");
    if (!employee.user.isActive) throw new AppError(409, "EMPLOYMENT_INACTIVE", "Activate the linked account before assigning work.");
    const stint = await tx.employmentPeriod.findFirst({ where: { id: value.employmentPeriodId, employeeId: value.employeeId } });
    if (!stint) throw new AppError(404, "NOT_FOUND", "Employment record not found.");
    if (value.effectiveFrom < today || value.effectiveFrom < dateKey(stint.startDate) || stint.endDate && (!value.effectiveUntil || value.effectiveUntil > dateKey(stint.endDate))) throw new AppError(400, "SCHEDULE_DATES", "Assign current or future dates within the employment period; a finite employment end needs a bounded schedule.");
    const until = value.effectiveUntil ? dateValue(value.effectiveUntil) : null;
    const base = value.baseScheduleId ? await tx.workSchedule.findFirst({ where: { id: value.baseScheduleId, employeeId: value.employeeId, supersededAt: null }, include: patternInclude }) : null;
    if (value.baseScheduleId && !base) throw new AppError(404, "NOT_FOUND", "Current schedule assignment not found.");
    if (base) {
      if (base.revision !== value.baseRevision) throw new AppError(409, "STALE", "This assignment changed. Reload before replacing it.");
      if (value.effectiveFrom <= today) throw new AppError(409, "HISTORICAL_SCHEDULE", "Normal replacements start tomorrow or later. Historical changes require the reviewed correction workflow.");
      if (base.employmentPeriodId !== stint.id || value.effectiveFrom < dateKey(base.effectiveFrom) || base.effectiveUntil && (!until || until > base.effectiveUntil) || base.effectiveUntil && dateValue(value.effectiveFrom) >= base.effectiveUntil) throw new AppError(400, "SCHEDULE_DATES", "Replace a range inside the selected assignment and employment period.");
      if (until && (!base.effectiveUntil || until < base.effectiveUntil) && !value.restoreSlots) throw new AppError(400, "RESTORE_REQUIRED", "Explicitly confirm the restoring weekly pattern for a temporary replacement.");
      if (await tx.attendanceSession.count({ where: { employeeId: value.employeeId, voidedAt: null, workDate: { gte: dateValue(value.effectiveFrom), ...(until ? { lt: until } : {}) } } })) throw new AppError(409, "ATTENDANCE_STARTED", "Attendance has already started in this range. Use a reviewed correction; normal schedule replacement is unavailable.");
      const data = base.effectiveFrom < dateValue(value.effectiveFrom) ? { effectiveUntil: dateValue(value.effectiveFrom) } : { supersededAt: now };
      await tx.workSchedule.update({ where: { id: base.id }, data: { ...data, revision: { increment: 1 } } });
      await audit({ actorUserId: actor.userId, employeeId: value.employeeId, action: "SCHEDULE_REPLACED", entity: "work_schedules", entityId: base.id, reason: value.reason,
        before: { effectiveFrom: dateKey(base.effectiveFrom), effectiveUntil: base.effectiveUntil ? dateKey(base.effectiveUntil) : null, revision: base.revision }, after: { replacementFrom: value.effectiveFrom, superseded: "supersededAt" in data } }, tx);
    }
    async function create(from: Date, end: Date | null, slots: SlotInput[], label: string | null, action: string, holidayWorkRequired = value.holidayWorkRequired) {
      const schedule = await tx.workSchedule.create({ data: { employeeId: value.employeeId, employmentPeriodId: stint!.id, effectiveFrom: from, effectiveUntil: end, label, holidayWorkRequired,
        createdBy: actor.userId, changeReason: value.reason, slots: { create: slots } } });
      await audit({ actorUserId: actor.userId, employeeId: value.employeeId, action, entity: "work_schedules", entityId: schedule.id, reason: value.reason,
        after: { effectiveFrom: dateKey(from), effectiveUntil: end ? dateKey(end) : null, slots: slots.map(s => ({ ...s })), employmentPeriodId: stint!.id, holidayWorkRequired } }, tx);
      await timeEvent(tx, value.employeeId, actor.userId, now, action, slots.length ? "Work schedule published" : "Future work schedule cancelled / rest pattern published", "work_schedules", schedule.id);
      return schedule.id;
    }
    const id = await create(dateValue(value.effectiveFrom), until, value.slots, value.label, value.slots.length ? base ? "SCHEDULE_CHANGED" : "SCHEDULE_CREATED" : "SCHEDULE_CANCELLED");
    if (base && until && (!base.effectiveUntil || until < base.effectiveUntil)) await create(until, base.effectiveUntil, value.restoreSlots!, base.label, "SCHEDULE_RESTORED", base.holidayWorkRequired);
    validateVersionBoundaries(await tx.workSchedule.findMany({ where: { employeeId: value.employeeId, supersededAt: null }, include: patternInclude }));
    return id;
  }); } catch (error) {
    if (typeof error === "object" && error && "code" in error && ["P2002", "P2004"].includes(String(error.code))) throw new AppError(409, "SCHEDULE_CONFLICT", "The schedule conflicts with an existing assignment. Reload and check its dates and periods.");
    throw error;
  }
}
// Offboarding/shortening employment keeps original slots and session snapshots, while freeing future assignment ranges.
export async function endFutureSchedules(tx: Database, actorUserId: string, employeeId: string, employmentPeriodId: string, end: Date, reason: string) {
  const settings = await tx.organizationSettings.findUniqueOrThrow({ where: { id: 1 }, select: { timezone: true } });
  const now = await databaseNow(tx), tomorrow = dateValue(addDays(localDate(now, settings.timezone), 1)), cutoff = end > tomorrow ? end : tomorrow;
  const patterns = await tx.workSchedule.findMany({ where: { employeeId, employmentPeriodId, supersededAt: null, OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: cutoff } }] } });
  for (const pattern of patterns) {
    const data = pattern.effectiveFrom >= cutoff ? { supersededAt: now } : { effectiveUntil: cutoff };
    await tx.workSchedule.update({ where: { id: pattern.id }, data: { ...data, revision: { increment: 1 } } });
    await audit({ actorUserId, employeeId, action: "SCHEDULE_CANCELLED", entity: "work_schedules", entityId: pattern.id, reason,
      before: { effectiveUntil: pattern.effectiveUntil?.toISOString() ?? null }, after: { cutoff: dateKey(cutoff), superseded: "supersededAt" in data } }, tx);
    await timeEvent(tx, employeeId, actorUserId, now, "SCHEDULE_CANCELLED", "Future schedule ended with employment", "work_schedules", pattern.id);
  }
}
