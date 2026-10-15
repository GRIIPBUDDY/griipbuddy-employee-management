import "server-only";
import { localWeek } from "@/features/review/calculation";
import { requiredOccurrence } from "@/features/review/absence";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db/client";
import { securityBoundary } from "@/lib/authorization/actor";
import { assertRole } from "@/lib/authorization/policy";
import { validated, uuidSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import type { Identity } from "@/types/auth";
import { databaseNow } from "./clock";
import { patternInclude } from "./schedules";
import { occurrence, checkinEligibility, type SchedulePattern, type Occurrence } from "./occurrences";
import { scheduleReadSchema, historyReadSchema } from "./validation";
import { addDays, dateKey, dateValue, localDate, dayStart, weekday } from "./dates";
import { resolveRange } from "@/lib/utils/date-range";
import { interval, intersect, seconds, subtract } from "@/features/review/calculation";
const attendanceSelect = { id: true, scheduleSlotId: true, employmentPeriodId: true, workDate: true, scheduledStartAt: true, scheduledEndAt: true, checkinAt: true, checkoutAt: true,
  timezoneSnapshot: true, earlyCheckinMinutesSnapshot: true, earliestCheckinAt: true, source: true, revision: true, voidedAt: true, createdAt: true };
type SessionRecord = Prisma.AttendanceSessionGetPayload<{ select: typeof attendanceSelect }>;
export function sessionView(record: SessionRecord, now: Date) {
  const durationSeconds = record.checkoutAt ? (record.checkoutAt.getTime() - record.checkinAt.getTime()) / 1000 : null;
  const incomplete = !record.checkoutAt && !!record.scheduledEndAt && now > record.scheduledEndAt;
  return { ...record, durationSeconds, provisionalSeconds: record.checkoutAt ? null : Math.max(0, Math.floor((now.getTime() - record.checkinAt.getTime()) / 1000)),
    lateSeconds: record.scheduledStartAt ? Math.max(0, (record.checkinAt.getTime() - record.scheduledStartAt.getTime()) / 1000) : 0,
    status: record.voidedAt ? "VOIDED" : record.checkoutAt ? "COMPLETED" : incomplete ? "INCOMPLETE" : "CURRENTLY_WORKING", incomplete };
}
function resolveDates(patterns: SchedulePattern[], from: string, count: number, timezone: string, early: number) {
  const resolved: Occurrence[] = [], issues: { date: string; message: string }[] = [];
  for (let i = 0; i < count; i++) {
    const day = addDays(from, i);
    for (const pattern of patterns) for (const slot of pattern.slots.filter(s => s.weekday === weekday(day))) {
      try { const value = occurrence(pattern, slot, day, timezone, early); if (value) resolved.push(value); }
      catch (error) { if (!(error instanceof AppError)) throw error; issues.push({ date: day, message: error.message }); }
    }
  }
  return { occurrences: resolved.sort((a, b) => a.scheduledStartAt.getTime() - b.scheduledStartAt.getTime()), issues };
}
function clippedSeconds(start: Date, end: Date, from: Date, until: Date) { return Math.max(0, (Math.min(end.getTime(), until.getTime()) - Math.max(start.getTime(), from.getTime())) / 1000); }
export async function employeeSchedule(identity: Identity | null, inputEmployeeId: unknown, query: unknown = {}, own = false) {
  return securityBoundary(identity, async actor => {
    if (!own) assertRole(actor, ["ADMIN", "HR_MANAGER"]);
    const employeeId = validated(uuidSchema, inputEmployeeId), value = validated(scheduleReadSchema, query);
    if (own && employeeId !== actor.employeeId) throw new AppError(404, "NOT_FOUND", "Employee schedule not found.");
    const employee = await db.employee.findUnique({ where: { id: employeeId }, select: { id: true, legalName: true, employeeNumber: true } });
    if (!employee) throw new AppError(404, "NOT_FOUND", "Employee schedule not found.");
    const settings = await db.organizationSettings.findUniqueOrThrow({ where: { id: 1 }, select: { timezone: true, earlyCheckinMinutes: true, weekStartDay: true,standardHoursVersions:true } });
    const now = await databaseNow(db), today = localDate(now, settings.timezone), week = localWeek(value.week ?? today, settings.weekStartDay), weekEnd = addDays(week, 7);
    const low = dateValue(addDays(week < today ? week : today, -1)), high = dateValue(addDays(weekEnd > addDays(today, 8) ? weekEnd : addDays(today, 8), 1));
    const patterns = await db.workSchedule.findMany({ where: { employeeId, supersededAt: null, effectiveFrom: { lt: high }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: low } }] }, include: patternInclude });
    const [recent, sessions, active, versions, future] = await Promise.all([
      db.attendanceSession.findMany({ where: { employeeId }, orderBy: [{ checkinAt: "desc" }, { id: "desc" }], take: 10, select: attendanceSelect }),
      db.attendanceSession.findMany({ where: { employeeId, voidedAt: null, workDate: { gte: low, lt: high } }, select: attendanceSelect }),
      db.attendanceSession.findFirst({ where: { employeeId, voidedAt: null, checkoutAt: null }, select: attendanceSelect }),
      own ? Promise.resolve([]) : db.workSchedule.findMany({ where: { employeeId }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }], take: 100, select: { id: true, employmentPeriodId: true, effectiveFrom: true, effectiveUntil: true, label: true, revision: true, supersededAt: true, changeReason: true, slots: { select: { id: true, weekday: true, startMinute: true, endMinute: true, endDayOffset: true }, orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] } } }),
      db.workSchedule.findFirst({ where: { employeeId, supersededAt: null, effectiveFrom: { gte: dateValue(addDays(today, 8)) }, slots: { some: {} } }, orderBy: { effectiveFrom: "asc" }, include: patternInclude }),
    ]);
    const live = resolveDates(patterns, addDays(today, -1), 9, settings.timezone, settings.earlyCheckinMinutes);
    const weekly = resolveDates(patterns, addDays(week, -1), 8, settings.timezone, settings.earlyCheckinMinutes);
    const next = live.occurrences.find(o => o.scheduledStartAt > now) ?? (future ? resolveDates([future], dateKey(future.effectiveFrom), 7, settings.timezone, settings.earlyCheckinMinutes).occurrences.find(o => o.scheduledStartAt > now) : undefined) ?? null;
    const periods = await Promise.all(live.occurrences.filter(o => o.workDate === today || o.scheduledStartAt <= now && o.eligibleEndAt >= now || o.workDate === addDays(today, 1) && o.earliestCheckinAt <= now).map(async o => {
      const required = await requiredOccurrence(db, o, patterns.find(p=>p.id===o.scheduleId)?.holidayWorkRequired ?? false, settings.timezone, settings.earlyCheckinMinutes);
      const coverage = sessions.filter(s => s.scheduleSlotId === o.slotId && dateKey(s.workDate) === o.workDate);
      const currentlyWorking = active?.scheduleSlotId === o.slotId && dateKey(active.workDate) === o.workDate;
      if(required.earliest) o.earliestCheckinAt=required.earliest;
      const excused=!required.earliest || now<=o.eligibleEndAt && now>=o.scheduledStartAt && now.getTime()>=required.remaining[0].start*1000 && !required.remaining.some(r=>now.getTime()/1000>=r.start && now.getTime()/1000<=r.end);
      const eligibility = excused?{allowed:false,reason:"Excused by approved leave or holiday. Contact HR for special work."}:checkinEligibility(o, now);
      return { ...o, canCheckin: own && actor.accountStatus!=="ON_HOLD" && actor.employmentActive && !active && eligibility.allowed, reason: active ? "Check out of your current session before checking in again." : eligibility.reason,
        status: currentlyWorking ? "CURRENTLY_WORKING" : coverage.some(s => s.checkoutAt) ? "COMPLETED" : now < o.earliestCheckinAt ? "UPCOMING" : eligibility.allowed ? "READY" : "NOT_ELIGIBLE", late: now > o.scheduledStartAt };
    }));
    const fromInstant = dayStart(week, settings.timezone), untilInstant = dayStart(weekEnd, settings.timezone);
    const actualIntervals = await db.attendanceSession.findMany({ where: { employeeId, voidedAt: null, checkoutAt: { gt: fromInstant }, checkinAt: { lt: untilInstant } }, select: { checkinAt: true, checkoutAt: true } });
    // Confirmed time away while checked in is not worked time (the same rule payroll uses).
    const away = await db.missingTimeRecord.findMany({ where: { employeeId, status: "CONFIRMED", startAt: { lt: untilInstant }, endAt: { gt: fromInstant } }, select: { startAt: true, endAt: true } });
    const hasAssignedToday=live.occurrences.some(o=>o.scheduledStartAt<dayStart(addDays(today,1),settings.timezone) && o.eligibleEndAt>dayStart(today,settings.timezone));
    return { canUnscheduled:own && actor.employmentActive && actor.accountStatus!=="ON_HOLD" && !active && !hasAssignedToday,operational:actor.accountStatus!=="ON_HOLD",standardWeeklyHours:((settings.standardHoursVersions as {effectiveFrom:string;hours:number}[]).filter(v=>v.effectiveFrom<=week).at(-1)?.hours??48),employee, now, today, timezone: settings.timezone, earlyCheckinMinutes: settings.earlyCheckinMinutes, week, weekEnd, next,
      periods, active: active ? sessionView(active, now) : null, recent: recent.map(s => sessionView(s, now)), versions,
      scheduledSeconds: weekly.occurrences.reduce((sum, o) => sum + clippedSeconds(o.scheduledStartAt, o.eligibleEndAt, fromInstant, untilInstant), 0),
      actualSeconds: seconds(intersect(subtract(actualIntervals.map(s => interval(s.checkinAt, s.checkoutAt!)), away.map(a => interval(a.startAt, a.endAt))), [interval(fromInstant, untilInstant)])),
      days: Array.from({ length: 7 }, (_, i) => { const date = addDays(week, i); return { date, periods: weekly.occurrences.filter(o => o.workDate === date), carryover: weekly.occurrences.filter(o => o.workDate === addDays(date, -1) && o.eligibleEndAt > dayStart(date, settings.timezone)) }; }),
      issues: [...live.issues, ...weekly.issues].filter((issue, i, all) => all.findIndex(other => other.date === issue.date && other.message === issue.message) === i) };
  });
}
export async function ownSchedule(identity: Identity | null, query: unknown = {}) {
  return securityBoundary(identity, async actor => actor.employeeId ? employeeSchedule(identity, actor.employeeId, query, true) : null);
}
export async function attendanceHistory(identity: Identity | null, inputEmployeeId: unknown, query: unknown = {}, own = false) {
  return securityBoundary(identity, async actor => {
    if (!own) assertRole(actor, ["ADMIN", "HR_MANAGER"]);
    const employeeId = validated(uuidSchema, inputEmployeeId), value = validated(historyReadSchema, query);
    if (own && employeeId !== actor.employeeId) throw new AppError(404, "NOT_FOUND", "Attendance history not found.");
    const employee = await db.employee.findUnique({ where: { id: employeeId }, select: { id: true, legalName: true, employeeNumber: true } });
    if (!employee) throw new AppError(404, "NOT_FOUND", "Attendance history not found.");
    const settings=await db.organizationSettings.findUniqueOrThrow({where:{id:1},select:{timezone:true,weekStartDay:true}}),now=await databaseNow(db);
    const r=resolveRange(Object.fromEntries(Object.entries(value).filter((e):e is [string,string]=>e[0]!=="page"&&typeof e[1]==="string")),localDate(now,settings.timezone),{weekStartDay:settings.weekStartDay,maxDays:31});
    if(r.error || r.mode==="all")throw new AppError(400,"DATE_RANGE",r.error??"Choose up to 31 organization-local dates.");
    const {from,until}=r;
    const where={employeeId,checkinAt:{lt:dayStart(until,settings.timezone)},OR:[{checkoutAt:null},{checkoutAt:{gt:dayStart(from,settings.timezone)}}]};
    const [total,records]=await Promise.all([db.attendanceSession.count({where}),db.attendanceSession.findMany({where,skip:(value.page-1)*25,take:25,orderBy:[{checkinAt:"desc"},{id:"desc"}],select:attendanceSelect})]);
    return {employee,timezone:settings.timezone,now,from,until,to:r.to,label:r.label,mode:r.mode,operational:actor.accountStatus!=="ON_HOLD",records:records.map(s=>sessionView(s,now)),total,page:value.page,pages:Math.max(1,Math.ceil(total/25))};
  });
}
export async function ownAttendance(identity: Identity | null, query: unknown = {}) {
  return securityBoundary(identity, async actor => actor.employeeId ? attendanceHistory(identity, actor.employeeId, query, true) : null);
}
export async function ownAttendanceDetail(identity: Identity | null, inputId: unknown) {
  return securityBoundary(identity, async actor => {
    const id = validated(uuidSchema, inputId);
    const record = actor.employeeId ? await db.attendanceSession.findFirst({ where: { id, employeeId: actor.employeeId }, select: attendanceSelect }) : null;
    if (!record) throw new AppError(404, "NOT_FOUND", "Attendance session not found.");
    return sessionView(record, await databaseNow(db));
  });
}
