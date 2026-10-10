import "server-only";
import type { AttendanceSession } from "@/generated/prisma/client";
import { db } from "@/lib/db/client";
import { audit,type Database } from "@/lib/db/audit";
import { authorizedMutation } from "@/lib/db/mutation";
import { securityBoundary } from "@/lib/authorization/actor";
import { assertRole } from "@/lib/authorization/policy";
import { validated,uuidSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import type { Identity,Actor } from "@/types/auth";
import { databaseNow } from "@/features/time/clock";
import { dateKey,dateValue,localDate,dayStart,addDays } from "@/features/time/dates";
import { occurrence } from "@/features/time/occurrences";
import { patternInclude,timeEvent } from "@/features/time/schedules";
import { correctionSchema,correctionDecisionSchema,withdrawSchema,listSchema } from "./validation";
import { reviewer,invalidateOvertime } from "./overtime";
import { notify } from "./notifications";
function subject(actor:Actor,staffEmployeeId?:unknown) {
 if(staffEmployeeId!==undefined){assertRole(actor,["ADMIN","HR_MANAGER"]);return validated(uuidSchema,staffEmployeeId);}
 if(!actor.employeeId)throw new AppError(403,"PROFILE_REQUIRED","A linked employee profile is required.");return actor.employeeId;
}
export function original(session:AttendanceSession|null) {
 return session ? {id:session.id,revision:session.revision,workDate:dateKey(session.workDate),scheduleSlotId:session.scheduleSlotId,checkinAt:session.checkinAt.toISOString(),checkoutAt:session.checkoutAt?.toISOString()??null,
  scheduledStartAt:session.scheduledStartAt?.toISOString()??null,scheduledEndAt:session.scheduledEndAt?.toISOString()??null,source:session.source,voidedAt:session.voidedAt?.toISOString()??null} : {};
}
async function validateProposal(tx:Database,employeeId:string,v:ReturnType<typeof correctionSchema.parse>,now:Date,target:AttendanceSession|null) {
 const settings=await tx.organizationSettings.findUniqueOrThrow({where:{id:1}});
 if(target?.voidedAt)throw new AppError(409,"VOIDED","A voided fact cannot be corrected again.");
 if(v.type==="VOID")return {periodId:target!.employmentPeriodId,settings,selected:null};
 const start=v.checkinAt!,end=v.checkoutAt!;
 if(end>now || start>now)throw new AppError(400,"FUTURE_FACT","Actual attendance cannot be recorded in the future.");
 if(!v.scheduleSlotId ? localDate(start,settings.timezone)!==v.workDate : localDate(start,settings.timezone)<addDays(v.workDate,-1) || localDate(start,settings.timezone)>addDays(v.workDate,1))throw new AppError(400,"WORK_DATE","Use the actual start date, or the assigned overnight occurrence's start date.");
 const period=await tx.employmentPeriod.findFirst({where:{employeeId,startDate:{lte:dateValue(localDate(start,settings.timezone))},OR:[{endDate:null},{endDate:{gt:dateValue(localDate(start,settings.timezone))}}]}});
 if(!period || period.endDate && end>dayStart(dateKey(period.endDate),settings.timezone) || target && target.employmentPeriodId!==period.id)throw new AppError(409,"EMPLOYMENT_COVERAGE","Proposed work must fit the same employment stint. Correct employment evidence separately if necessary.");
 let selected=null;
 if(v.scheduleSlotId){
  const slot=await tx.scheduleSlot.findFirst({where:{id:v.scheduleSlotId,workSchedule:{employeeId,employmentPeriodId:period.id}},include:{workSchedule:{include:patternInclude}}});
  if(!slot)throw new AppError(404,"NOT_FOUND","Own assigned period not found.");
  selected=occurrence(slot.workSchedule,slot,v.workDate,settings.timezone,settings.earlyCheckinMinutes);
  if(!selected || start>selected.scheduledEndAt || end<selected.scheduledStartAt)throw new AppError(409,"OCCURRENCE","Select the assigned occurrence related to the proposed attendance.");
 }
 if(await tx.attendanceSession.findFirst({where:{employeeId,voidedAt:null,...(target?{id:{not:target.id}}:{}),checkinAt:{lt:end},OR:[{checkoutAt:null},{checkoutAt:{gt:start}}]},select:{id:true}}))throw new AppError(409,"ATTENDANCE_OVERLAP","The proposed interval overlaps another actual session. Resolve that session first.");
 return {periodId:period.id,settings,selected};
}
export async function submitCorrection(identity:Identity|null,input:unknown,staffEmployeeId?:unknown) {
 await securityBoundary(identity,async actor=>subject(actor,staffEmployeeId));const v=validated(correctionSchema,input);
 return authorizedMutation(identity,async(actor,tx)=>{
  const employeeId=subject(actor,staffEmployeeId);await tx.$queryRaw`SELECT id FROM employees WHERE id=${employeeId}::uuid FOR UPDATE`;const now=await databaseNow(tx);
  const replay=await tx.attendanceCorrection.findUnique({where:{employeeId_operationKey:{employeeId,operationKey:v.operationKey}}});
  if(replay){if(replay.type!==v.type || replay.sessionId!==v.sessionId || dateKey(replay.workDate)!==v.workDate || replay.reason!==v.reason || replay.scheduleSlotId!==v.scheduleSlotId || replay.proposedCheckinAt?.getTime()!==(v.checkinAt?.getTime()) || replay.proposedCheckoutAt?.getTime()!==(v.checkoutAt?.getTime()))throw new AppError(409,"OPERATION_REUSED","This submission key belongs to a different request.");return replay.id;}
  const target=v.sessionId?await tx.attendanceSession.findFirst({where:{id:v.sessionId,employeeId}}):null;
  if(v.sessionId && !target)throw new AppError(404,"NOT_FOUND","Attendance session not found.");
  if(v.type==="VOID" && dateKey(target!.workDate)!==v.workDate)throw new AppError(400,"WORK_DATE","Use the target session's work date.");
  const resolved=await validateProposal(tx,employeeId,v,now,target);
  if(target && await tx.attendanceCorrection.count({where:{employeeId,sessionId:target.id,status:"PENDING"}}))throw new AppError(409,"REQUEST_PENDING","This session already has a pending correction.");
  const row=await tx.attendanceCorrection.create({data:{employeeId,employmentPeriodId:resolved.periodId,sessionId:v.sessionId,type:v.type,workDate:dateValue(v.workDate),scheduleSlotId:v.scheduleSlotId,
   proposedCheckinAt:v.checkinAt,proposedCheckoutAt:v.checkoutAt,reason:v.reason,originalValues:original(target),targetRevision:target?.revision,requestedBy:actor.userId,operationKey:v.operationKey}});
  await audit({actorUserId:actor.userId,employeeId,action:"CORRECTION_SUBMITTED",entity:"attendance_corrections",entityId:row.id,reason:v.reason,before:original(target),after:{type:v.type,checkinAt:v.checkinAt?.toISOString()??null,checkoutAt:v.checkoutAt?.toISOString()??null,workDate:v.workDate,status:"PENDING"}},tx);
  await timeEvent(tx,employeeId,actor.userId,now,"CORRECTION_SUBMITTED","Attendance correction requested","attendance_corrections",row.id);
  await notify(tx,employeeId,"STAFF_CORRECTION_PENDING","attendance_corrections",row.id,`correction-submitted:${row.id}`,"An attendance correction request needs review.",true);
  // A pending request blocks confirmation but does not change official actual totals.
  if(target)await invalidateOvertime(tx,employeeId,actor.userId,target.checkinAt,target.checkoutAt,now);
  if(v.checkinAt)await invalidateOvertime(tx,employeeId,actor.userId,v.checkinAt,v.checkoutAt,now);
  return row.id;
 });
}
export async function decideCorrection(identity:Identity|null,input:unknown) {
 await securityBoundary(identity,async actor=>assertRole(actor,["ADMIN","HR_MANAGER"]));const v=validated(correctionDecisionSchema,input);
 return authorizedMutation(identity,async(actor,tx)=>{
  const row=await tx.attendanceCorrection.findUnique({where:{id:v.id}});if(!row)throw new AppError(404,"NOT_FOUND","Correction request not found.");reviewer(actor,row.employeeId);
  await tx.$queryRaw`SELECT id FROM employees WHERE id=${row.employeeId}::uuid FOR UPDATE`;const now=await databaseNow(tx);
  if(row.status!=="PENDING")throw new AppError(409,"DECIDED","This request has already been decided or withdrawn.");
  const target=row.sessionId?await tx.attendanceSession.findUnique({where:{id:row.sessionId}}):null;
  let appliedId:string|null=null;
  if(v.decision==="APPROVED"){
   if(target && target.revision!==row.targetRevision)throw new AppError(409,"STALE","The official session changed after submission. Reject or withdraw this request and submit current evidence.");
   const proposal=validated(correctionSchema,{type:row.type,sessionId:row.sessionId??"",workDate:dateKey(row.workDate),scheduleSlotId:row.scheduleSlotId??"",checkinAt:row.proposedCheckinAt?.toISOString()??"",checkoutAt:row.proposedCheckoutAt?.toISOString()??"",reason:row.reason,operationKey:row.operationKey});
   const resolved=await validateProposal(tx,row.employeeId,proposal,now,target);
   await tx.$queryRaw`SELECT set_config('app.attendance_correction',${row.id},true)`;
   if(row.type==="VOID"){
    await tx.attendanceSession.update({where:{id:target!.id},data:{voidedAt:now,voidReason:row.reason,revision:{increment:1}}});appliedId=target!.id;
   } else {
    const times={workDate:row.workDate,scheduleSlotId:row.scheduleSlotId,checkinAt:row.proposedCheckinAt!,checkoutAt:row.proposedCheckoutAt!};
    if(target){await tx.attendanceSession.update({where:{id:target.id},data:{...times,source:"CORRECTION",revision:{increment:1}}});appliedId=target.id;}
    else {const selected=resolved.selected;appliedId=(await tx.attendanceSession.create({data:{employeeId:row.employeeId,employmentPeriodId:resolved.periodId,...times,source:"CORRECTION",createdBy:actor.userId,
      timezoneSnapshot:resolved.settings.timezone,rulesVersionSnapshot:resolved.settings.rulesVersion,earlyCheckinMinutesSnapshot:resolved.settings.earlyCheckinMinutes,
      scheduledStartAt:selected?.scheduledStartAt,scheduledEndAt:selected?.scheduledEndAt,earliestCheckinAt:selected?.earliestCheckinAt}})).id;}
   }
   await tx.$queryRaw`SELECT set_config('app.attendance_correction','',true)`;
   const updated=await tx.attendanceSession.findUniqueOrThrow({where:{id:appliedId!}});
   await audit({actorUserId:actor.userId,employeeId:row.employeeId,action:row.type==="ADD"?"ATTENDANCE_CORRECTION_CREATED":"ATTENDANCE_CORRECTED",entity:"attendance_sessions",entityId:appliedId!,reason:row.reason,before:original(target),after:{...original(updated),correctionId:row.id,reviewComment:v.comment}},tx);
   if(target)await invalidateOvertime(tx,row.employeeId,actor.userId,target.checkinAt,target.checkoutAt,now);
   await invalidateOvertime(tx,row.employeeId,actor.userId,updated.checkinAt,updated.checkoutAt,now);
  }
  await tx.attendanceCorrection.update({where:{id:row.id},data:{status:v.decision,reviewedBy:actor.userId,reviewedAt:now,reviewComment:v.comment,appliedSessionId:appliedId}});
  await audit({actorUserId:actor.userId,employeeId:row.employeeId,action:`CORRECTION_${v.decision}`,entity:"attendance_corrections",entityId:row.id,reason:v.comment,before:{status:"PENDING"},after:{status:v.decision,appliedSessionId:appliedId}},tx);
  await timeEvent(tx,row.employeeId,actor.userId,now,`CORRECTION_${v.decision}`,`Attendance correction ${v.decision.toLowerCase()}`,"attendance_corrections",row.id);
  await notify(tx,row.employeeId,"CORRECTION_DECIDED","attendance_corrections",row.id,`correction-decision:${row.id}`,v.decision==="APPROVED"?"Your attendance correction was approved and your official record was corrected.":"Your attendance correction was rejected. See the review comment.");
  return row.id;
 });
}
export async function withdrawCorrection(identity:Identity|null,input:unknown) {
 const v=validated(withdrawSchema,input);return authorizedMutation(identity,async(actor,tx)=>{
  const row=await tx.attendanceCorrection.findFirst({where:{id:v.id,employeeId:actor.employeeId??"00000000-0000-0000-0000-000000000000"}});
  if(!row)throw new AppError(404,"NOT_FOUND","Correction request not found.");if(row.status!=="PENDING")throw new AppError(409,"DECIDED","Only pending requests can be withdrawn.");
  await tx.attendanceCorrection.update({where:{id:row.id},data:{status:"WITHDRAWN"}});
  await audit({actorUserId:actor.userId,employeeId:row.employeeId,action:"CORRECTION_WITHDRAWN",entity:"attendance_corrections",entityId:row.id},tx);
 });
}
export async function correctionList(identity:Identity|null,query:unknown={},staff=false,idInput?:unknown) {
 return securityBoundary(identity,async actor=>{
  if(staff)assertRole(actor,["ADMIN","HR_MANAGER"]);const v=validated(listSchema,query),id=idInput===undefined?null:validated(uuidSchema,idInput);
  const where={...(staff?{}:{employeeId:actor.employeeId??"00000000-0000-0000-0000-000000000000"}),...(v.status?{status:v.status}:{}),...(id?{id}:{})};
  const rows=await db.attendanceCorrection.findMany({where,orderBy:[{createdAt:"desc"},{id:"desc"}],skip:(v.page-1)*25,take:26,
   select:{id:true,employeeId:true,sessionId:true,type:true,workDate:true,scheduleSlotId:true,proposedCheckinAt:true,proposedCheckoutAt:true,reason:true,originalValues:true,status:true,reviewedAt:true,reviewedBy:true,reviewComment:true,createdAt:true,appliedSessionId:true}});
  if(id && !rows.length)throw new AppError(404,"NOT_FOUND","Correction request not found.");
  return {records:await Promise.all(rows.slice(0,25).map(async record=>{const {reviewedBy,...row}=record;return {...row,reviewerName:reviewedBy?(await db.user.findUniqueOrThrow({where:{id:reviewedBy},select:{displayName:true,employee:{select:{legalName:true}}}})).displayName??"Authorized reviewer":null,
   relatedSchedule:row.scheduleSlotId?await db.scheduleSlot.findFirst({where:{id:row.scheduleSlotId,workSchedule:{employeeId:row.employeeId}},select:{weekday:true,startMinute:true,endMinute:true,endDayOffset:true,workSchedule:{select:{label:true}}}}):null,employee:staff?await db.employee.findUniqueOrThrow({where:{id:row.employeeId},select:{legalName:true,employeeNumber:true}}):null,canDecide:staff && !(actor.role==="HR_MANAGER" && actor.employeeId===row.employeeId)};})),page:v.page,hasNext:rows.length>25};
 });
}
export async function correctionOptions(identity:Identity|null,staffEmployeeId?:unknown,targetId?:unknown) {
 return securityBoundary(identity,async actor=>{
  const employeeId=subject(actor,staffEmployeeId);
  const [settings,sessions,patterns]=await Promise.all([
   db.organizationSettings.findUniqueOrThrow({where:{id:1},select:{timezone:true}}),
   db.attendanceSession.findMany({where:{employeeId,voidedAt:null},orderBy:[{checkinAt:"desc"},{id:"desc"}],take:25,select:{id:true,workDate:true,scheduleSlotId:true,checkinAt:true,checkoutAt:true}}),
   db.workSchedule.findMany({where:{employeeId,supersededAt:null},orderBy:{effectiveFrom:"desc"},take:100,select:{label:true,effectiveFrom:true,effectiveUntil:true,slots:{orderBy:[{weekday:"asc"},{startMinute:"asc"}],select:{id:true,weekday:true,startMinute:true,endMinute:true,endDayOffset:true}}}})
  ]);
  if(targetId){const id=validated(uuidSchema,targetId);if(!sessions.some(s=>s.id===id)){const row=await db.attendanceSession.findFirst({where:{id,employeeId,voidedAt:null},select:{id:true,workDate:true,scheduleSlotId:true,checkinAt:true,checkoutAt:true}});if(!row)throw new AppError(404,"NOT_FOUND","Attendance session not found.");sessions.push(row);}}
  return {employeeId,timezone:settings.timezone,sessions,patterns};
 });
}
