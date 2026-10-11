import "server-only";
import { assertOperational } from "@/lib/authorization/policy";
import { requiredOccurrence } from "@/features/review/absence";
import { invalidateOvertime,calculateOvertimeInTransaction } from "@/features/review/overtime";
import { securityBoundary } from "@/lib/authorization/actor";
import { authorizedMutation } from "@/lib/db/mutation";
import { audit } from "@/lib/db/audit";
import { validated } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import type { Identity, Actor } from "@/types/auth";
import { checkinSchema, checkoutSchema } from "./validation";
import { patternInclude, timeEvent } from "./schedules";
import { occurrence, checkinEligibility } from "./occurrences";
import { databaseNow } from "./clock";
import { addDays, dateKey, dateValue, localDate } from "./dates";
export function ownTimeEmployee(actor: Actor) {
  assertOperational(actor);
  if (!actor.employeeId || !actor.employmentActive) throw new AppError(403, "EMPLOYMENT_INACTIVE", "An active employee profile is required for check-in/check-out. Contact HR.");
  return actor.employeeId;
}
function attendanceConflict(error: unknown): never {
  if (typeof error === "object" && error && "code" in error && ["P2002", "P2004"].includes(String(error.code))) throw new AppError(409, "ATTENDANCE_CONFLICT", "This action conflicts with an existing attendance session. Refresh your attendance.");
  throw error;
}
export async function checkIn(identity: Identity | null, input: unknown) {
  await securityBoundary(identity, async actor => ownTimeEmployee(actor));
  const value = validated(checkinSchema, input);
  try { return await authorizedMutation(identity, async (actor, tx) => {
    const employeeId = ownTimeEmployee(actor);
    await tx.$queryRaw`SELECT id FROM employees WHERE id=${employeeId}::uuid FOR UPDATE`;
    const now = await databaseNow(tx);
    const replay = await tx.attendanceSession.findUnique({ where: { employeeId_checkinOperationKey: { employeeId, checkinOperationKey: value.operationKey } } });
    if (replay) {
      if (replay.scheduleSlotId !== value.slotId || dateKey(replay.workDate) !== value.workDate) throw new AppError(409, "OPERATION_REUSED", "This request key was used for another period. Refresh before checking in.");
      return { id: replay.id, replayed: true };
    }
    if (await tx.attendanceSession.findFirst({ where: { employeeId, checkoutAt: null, voidedAt: null }, select: { id: true } })) throw new AppError(409, "OPEN_SESSION", "You are currently working. Check out before starting another session.");
    const slot = await tx.scheduleSlot.findFirst({ where: { id: value.slotId, workSchedule: { employeeId } }, include: { workSchedule: { include: patternInclude } } });
    if (!slot) throw new AppError(404, "NOT_FOUND", "Scheduled period not found.");
    const settings = await tx.organizationSettings.findUniqueOrThrow({ where: { id: 1 } });
    const today = localDate(now, settings.timezone);
    if (value.workDate < addDays(today, -1) || value.workDate > addDays(today, 1)) throw new AppError(409, "SCHEDULE_INELIGIBLE", "Choose a current eligible assigned period. Missed dates require a reviewed correction.");
    const selected = occurrence(slot.workSchedule, slot, value.workDate, settings.timezone, settings.earlyCheckinMinutes);
    if (!selected) throw new AppError(409, "SCHEDULE_INELIGIBLE", "This assignment is not eligible on this date. Refresh your schedule or contact HR.");
    const required = await requiredOccurrence(tx, selected, slot.workSchedule.holidayWorkRequired, settings.timezone, settings.earlyCheckinMinutes);
    if (!required.earliest) throw new AppError(409, "EXCUSED", "This period is fully excused by approved leave or a holiday. Contact HR for required special work.");
    selected.earliestCheckinAt = required.earliest;
    if (now <= selected.eligibleEndAt && now >= selected.scheduledStartAt && !required.remaining.some(r => now.getTime()/1000 >= r.start && now.getTime()/1000 <= r.end) && now.getTime() >= required.remaining[0].start*1000) throw new AppError(409, "EXCUSED", "This portion is excused by approved leave or a holiday. Contact HR.");
    const eligibility = checkinEligibility(selected, now);
    if (!eligibility.allowed) throw new AppError(409, now < selected.earliestCheckinAt ? "CHECKIN_EARLY" : "CHECKIN_ENDED", eligibility.reason);
    const session = await tx.attendanceSession.create({ data: { employeeId, employmentPeriodId: selected.employmentPeriodId, scheduleSlotId: slot.id, workDate: dateValue(value.workDate),
      scheduledStartAt: selected.scheduledStartAt, scheduledEndAt: selected.scheduledEndAt, timezoneSnapshot: settings.timezone, rulesVersionSnapshot: settings.rulesVersion,
      earlyCheckinMinutesSnapshot: settings.earlyCheckinMinutes, earliestCheckinAt: selected.earliestCheckinAt, checkinAt: now, source: "SELF", createdBy: actor.userId, checkinOperationKey: value.operationKey } });
    await invalidateOvertime(tx, employeeId, actor.userId, session.checkinAt, null, now);
    await audit({ actorUserId: actor.userId, employeeId, action: "ATTENDANCE_CHECKED_IN", entity: "attendance_sessions", entityId: session.id,
      after: { checkinAt: now.toISOString(), workDate: value.workDate, scheduleSlotId: slot.id, scheduledStartAt: selected.scheduledStartAt.toISOString(), scheduledEndAt: selected.scheduledEndAt.toISOString(), timezone: settings.timezone, earlyCheckinMinutes: settings.earlyCheckinMinutes } }, tx);
    await timeEvent(tx, employeeId, actor.userId, now, "ATTENDANCE_CHECKED_IN", "Employee checked in", "attendance_sessions", session.id);
    return { id: session.id, replayed: false };
  }); } catch (error) { attendanceConflict(error); }
}
export async function checkOut(identity: Identity | null, input: unknown) {
  await securityBoundary(identity, async actor => ownTimeEmployee(actor));
  const value = validated(checkoutSchema, input);
  try { return await authorizedMutation(identity, async (actor, tx) => {
    const employeeId = ownTimeEmployee(actor);
    await tx.$queryRaw`SELECT id FROM employees WHERE id=${employeeId}::uuid FOR UPDATE`;
    const now = await databaseNow(tx);
    const replay = await tx.attendanceSession.findUnique({ where: { employeeId_checkoutOperationKey: { employeeId, checkoutOperationKey: value.operationKey } } });
    if (replay) {
      if (replay.id !== value.sessionId) throw new AppError(409, "OPERATION_REUSED", "This checkout key belongs to an earlier session. Refresh your attendance.");
      return { id: replay.id, replayed: true };
    }
    const session = await tx.attendanceSession.findFirst({ where: { id: value.sessionId, employeeId, voidedAt: null } });
    if (!session) throw new AppError(404, "NOT_FOUND", "Attendance session not found.");
    if (session.checkoutAt) throw new AppError(409, "SESSION_CLOSED", "This session is already completed. Refresh your attendance.");
    if (now <= session.checkinAt) throw new AppError(409, "CHECKOUT_TIME", "Checkout must be later than check-in. Wait a moment and retry; contact HR if the server clock remains earlier.");
    await tx.attendanceSession.update({ where: { id: session.id }, data: { checkoutAt: now, checkoutOperationKey: value.operationKey, revision: { increment: 1 } } });
    await invalidateOvertime(tx, employeeId, actor.userId, session.checkinAt, now, now);
    await audit({ actorUserId: actor.userId, employeeId, action: "ATTENDANCE_CHECKED_OUT", entity: "attendance_sessions", entityId: session.id,
      before: { checkoutAt: null }, after: { checkoutAt: now.toISOString(), actualSeconds: (now.getTime() - session.checkinAt.getTime()) / 1000 } }, tx);
    if(!await tx.attendanceSession.count({where:{employeeId,checkoutAt:null,voidedAt:null}})){const settings=await tx.organizationSettings.findUniqueOrThrow({where:{id:1}});if(session.source==="UNSCHEDULED" || session.scheduledEndAt && now>session.scheduledEndAt){const first=(await import("@/features/review/calculation")).localWeek(localDate(session.checkinAt,settings.timezone),settings.weekStartDay),last=(await import("@/features/review/calculation")).localWeek(localDate(now,settings.timezone),settings.weekStartDay);for(let week=first;week<=last;week=addDays(week,7)){const facts=await (await import("@/features/review/summary")).weekCalculation(tx,employeeId,week,now);if(!facts.blockers.length)await calculateOvertimeInTransaction(tx,actor,employeeId,week,now,true);}}}
    await timeEvent(tx, employeeId, actor.userId, now, "ATTENDANCE_CHECKED_OUT", "Employee checked out", "attendance_sessions", session.id);
    return { id: session.id, replayed: false };
  }); } catch (error) { attendanceConflict(error); }
}
// Explicit unscheduled workflow: never a fallback for a missed assigned slot.
export async function checkInUnscheduled(identity:Identity|null,input:unknown){
 await securityBoundary(identity,async a=>ownTimeEmployee(a));const value=validated((await import("zod")).z.object({operationKey:(await import("@/lib/validation/schemas")).uuidSchema}).strict(),input);
 try{return await authorizedMutation(identity,async(a,tx)=>{
  const employeeId=ownTimeEmployee(a);await tx.$queryRaw`SELECT id FROM employees WHERE id=${employeeId}::uuid FOR UPDATE`;
  const settings=await tx.organizationSettings.findUniqueOrThrow({where:{id:1}}),now=await databaseNow(tx),today=localDate(now,settings.timezone),dates=await import("./dates");
  const replay=await tx.attendanceSession.findUnique({where:{employeeId_checkinOperationKey:{employeeId,checkinOperationKey:value.operationKey}}});if(replay){if(replay.source!=="UNSCHEDULED" || dateKey(replay.workDate)!==today)throw new AppError(409,"OPERATION_REUSED","Request key already used.");return {id:replay.id,replayed:true};}
  if(await tx.attendanceSession.findFirst({where:{employeeId,checkoutAt:null,voidedAt:null}}))throw new AppError(409,"OPEN_SESSION","Check out before starting another session.");
  const patterns=await tx.workSchedule.findMany({where:{employeeId,supersededAt:null,effectiveFrom:{lt:dateValue(addDays(today,1))},OR:[{effectiveUntil:null},{effectiveUntil:{gt:dateValue(addDays(today,-1))}}]},include:patternInclude});
  const start=dates.dayStart(today,settings.timezone),end=dates.dayStart(addDays(today,1),settings.timezone);
  for(const p of patterns)for(const date of [addDays(today,-1),today])for(const slot of p.slots){const o=occurrence(p,slot,date,settings.timezone,settings.earlyCheckinMinutes);if(o && o.scheduledStartAt<end && o.eligibleEndAt>start)throw new AppError(409,"SCHEDULE_EXISTS","A work schedule exists on this date. Use an eligible assigned session or request an authorized exception.");}
  const stint=await tx.employmentPeriod.findFirst({where:{employeeId,startDate:{lte:dateValue(today)},OR:[{endDate:null},{endDate:{gt:dateValue(today)}}]}});if(!stint)throw new AppError(409,"EMPLOYMENT_INACTIVE","Active employment is required.");
  const row=await tx.attendanceSession.create({data:{employeeId,employmentPeriodId:stint.id,workDate:dateValue(today),timezoneSnapshot:settings.timezone,rulesVersionSnapshot:settings.rulesVersion,earlyCheckinMinutesSnapshot:settings.earlyCheckinMinutes,checkinAt:now,source:"UNSCHEDULED",createdBy:a.userId,checkinOperationKey:value.operationKey}});
  await invalidateOvertime(tx,employeeId,a.userId,now,null,now);await audit({actorUserId:a.userId,employeeId,action:"UNSCHEDULED_CHECKED_IN",entity:"attendance_sessions",entityId:row.id,after:{checkinAt:now.toISOString(),source:"UNSCHEDULED",workDate:today}},tx);await timeEvent(tx,employeeId,a.userId,now,"UNSCHEDULED_CHECKED_IN","Unscheduled work recorded","attendance_sessions",row.id);return {id:row.id,replayed:false};
 });}catch(error){attendanceConflict(error);}
}
