import "server-only";
import { db } from "@/lib/db/client";
import { audit, type Database } from "@/lib/db/audit";
import { securityBoundary } from "@/lib/authorization/actor";
import { assertRole } from "@/lib/authorization/policy";
import { authorizedMutation } from "@/lib/db/mutation";
import { validated, uuidSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import { databaseNow } from "@/features/time/clock";
import { addDays, dateKey, dateValue, dayStart, localDate } from "@/features/time/dates";
import type { Actor,Identity } from "@/types/auth";
import { weekCalculation } from "./summary";
import { localWeek, policies, tail } from "./calculation";
import { overtimeCalculationSchema,overtimeDecisionSchema,policySchema,listSchema } from "./validation";
import { notify } from "./notifications";
export function reviewer(actor:Actor,employeeId:string) {
 assertRole(actor,["ADMIN","HR_MANAGER"]);
 if(actor.role==="HR_MANAGER" && actor.employeeId===employeeId) throw new AppError(403,"SELF_REVIEW","An administrator must review your own attendance, leave or overtime.");
}
export async function invalidateOvertime(tx:Database,employeeId:string,actorUserId:string,start:Date,end:Date|null,now:Date) {
 const rows=await tx.overtimeReview.findMany({where:{employeeId}});
 for(const row of rows) {
  const from=dayStart(dateKey(row.weekStartDate),row.timezoneSnapshot),until=dayStart(addDays(dateKey(row.weekStartDate),7),row.timezoneSnapshot);
  if(start>=until || end && end<=from) continue;
  if(row.status==="STALE") continue;
  const next=await tx.overtimeReview.update({where:{id:row.id},data:{status:"STALE",revision:{increment:1}}});
  await audit({actorUserId,employeeId,action:"OVERTIME_REVIEW_STALE",entity:"overtime_reviews",entityId:row.id,before:{status:row.status,approvedSeconds:row.approvedSeconds,revision:row.revision},after:{status:"STALE",revision:next.revision},reason:"Attendance inputs changed; previous approval retained as evidence."},tx);
  await notify(tx,employeeId,"STAFF_OVERTIME_STALE","overtime_reviews",row.id,`overtime-stale:${row.id}:${next.revision}`,"Attendance changed; a weekly overtime result needs review.",true);
  await notify(tx,employeeId,"OVERTIME_STALE","overtime_reviews",row.id,`own-overtime-stale:${row.id}:${next.revision}`,"Attendance changed; your previous overtime result requires a new review.");
 }
 void now;
}
export async function calculateOvertimeInTransaction(tx:Database,actor:Actor,employeeId:string,week:string,now:Date,allowOpen=false) {
 if(!await tx.employee.findUnique({where:{id:employeeId},select:{id:true}})) throw new AppError(404,"NOT_FOUND","Employee not found.");
 const input=await weekCalculation(tx,employeeId,week,now);
 if(!input.ended && !allowOpen) throw new AppError(409,"WEEK_OPEN","Weekly review is available after the organization-local workweek ends.");
 if(input.blockers.length) throw new AppError(409,"UNRESOLVED_ATTENDANCE",`Resolve attendance first: ${input.blockers.join("; ")}.`);
 let old=await tx.overtimeReview.findUnique({where:{employeeId_weekStartDate:{employeeId,weekStartDate:dateValue(input.week)}}});
 if(old && old.status!=="STALE" && old.actualSecondsSnapshot===input.actualSeconds && old.thresholdSeconds===input.thresholdSeconds && old.policyVersion===input.policyVersion) return {row:old,input};
 if(old && ["APPROVED","REJECTED","NOT_REQUIRED"].includes(old.status)) {
  await invalidateOvertime(tx,employeeId,actor.userId,dayStart(input.week,input.timezone),dayStart(input.weekEnd,input.timezone),now);
  old=await tx.overtimeReview.findUniqueOrThrow({where:{id:old.id}});
 }
 const data={timezoneSnapshot:input.timezone,thresholdSeconds:input.thresholdSeconds,policyVersion:input.policyVersion,actualSecondsSnapshot:input.actualSeconds,potentialSecondsSnapshot:input.potentialSeconds,
  status:input.potentialSeconds>0?"PENDING":"NOT_REQUIRED",approvedSeconds:0,reviewedBy:null,reviewedAt:null,reviewComment:null};
 const row=old ? await tx.overtimeReview.update({where:{id:old.id},data:{...data,revision:{increment:1}}}) : await tx.overtimeReview.create({data:{employeeId,weekStartDate:dateValue(input.week),...data}});
 await audit({actorUserId:actor.userId,employeeId,action:old?"OVERTIME_RECALCULATED":"OVERTIME_CALCULATED",entity:"overtime_reviews",entityId:row.id,
  ...(old?{before:{status:old.status,actualSeconds:old.actualSecondsSnapshot,potentialSeconds:old.potentialSecondsSnapshot,approvedSeconds:old.approvedSeconds,revision:old.revision}}:{}),after:{week:input.week,...data,revision:row.revision}},tx);
 if(row.status==="PENDING") await notify(tx,employeeId,"STAFF_OVERTIME_PENDING","overtime_reviews",row.id,`overtime-pending:${row.id}:${row.revision}`,"A completed weekly overtime calculation needs review.",true);
 return {row,input};
}
export async function calculateOvertime(identity:Identity|null,input:unknown) {
 await securityBoundary(identity,async actor=>assertRole(actor,["ADMIN","HR_MANAGER"]));
 const value=validated(overtimeCalculationSchema,input);
 return authorizedMutation(identity,async(actor,tx)=>{assertRole(actor,["ADMIN","HR_MANAGER"]);await tx.$queryRaw`SELECT id FROM employees WHERE id=${value.employeeId}::uuid FOR UPDATE`;return (await calculateOvertimeInTransaction(tx,actor,value.employeeId,value.week,await databaseNow(tx))).row;});
}
export async function decideOvertime(identity:Identity|null,input:unknown) {
 await securityBoundary(identity,async actor=>assertRole(actor,["ADMIN","HR_MANAGER"]));
 const value=validated(overtimeDecisionSchema,input);
 return authorizedMutation(identity,async(actor,tx)=>{
  const old=await tx.overtimeReview.findUnique({where:{id:value.id}});if(!old)throw new AppError(404,"NOT_FOUND","Overtime review not found.");reviewer(actor,old.employeeId);
  await tx.$queryRaw`SELECT id FROM employees WHERE id=${old.employeeId}::uuid FOR UPDATE`;
  const now=await databaseNow(tx),current=await weekCalculation(tx,old.employeeId,dateKey(old.weekStartDate),now);
  if(value.revision!==old.revision || old.status!=="PENDING" || !current.ended || current.blockers.length || old.actualSecondsSnapshot!==current.actualSeconds || old.thresholdSeconds!==current.thresholdSeconds || old.policyVersion!==current.policyVersion) throw new AppError(409,"STALE","This calculation changed or needs attendance resolution. Recalculate and review again.");
  if(value.approvedSeconds>current.potentialSeconds || value.decision==="REJECTED" && value.approvedSeconds!==0) throw new AppError(400,"APPROVAL_AMOUNT","Approved seconds must fit current potential overtime; rejection approves zero.");
  const row=await tx.overtimeReview.update({where:{id:old.id},data:{status:value.decision,approvedSeconds:value.approvedSeconds,reviewedBy:actor.userId,reviewedAt:now,reviewComment:value.comment,revision:{increment:1}}});
  const allocation=tail(current.candidates,row.approvedSeconds);
  await audit({actorUserId:actor.userId,employeeId:old.employeeId,action:`OVERTIME_${value.decision}`,entity:"overtime_reviews",entityId:old.id,reason:value.comment,
   before:{status:old.status,approvedSeconds:old.approvedSeconds,revision:old.revision},after:{status:row.status,approvedSeconds:row.approvedSeconds,actualSeconds:current.actualSeconds,potentialSeconds:current.potentialSeconds,thresholdSeconds:current.thresholdSeconds,policyVersion:current.policyVersion,revision:row.revision,allocation}},tx);
  await notify(tx,old.employeeId,"OVERTIME_DECIDED","overtime_reviews",old.id,`overtime-decision:${old.id}:${row.revision}`,`Your weekly overtime review was ${value.decision.toLowerCase()}.`);
  return row.id;
 });
}
export async function overtimeData(identity:Identity|null,employeeIdInput:unknown,date:string,own=false) {
 return securityBoundary(identity,async actor=>{
  if(!own)assertRole(actor,["ADMIN","HR_MANAGER"]);const employeeId=validated(uuidSchema,employeeIdInput);
  if(own && actor.employeeId!==employeeId)throw new AppError(404,"NOT_FOUND","Overtime information not found.");
  const value=validated(overtimeCalculationSchema,{employeeId,week:date});
  return db.$transaction(async tx=>{
   const employee=await tx.employee.findUnique({where:{id:employeeId},select:{id:true,legalName:true,employeeNumber:true}});if(!employee)throw new AppError(404,"NOT_FOUND","Employee not found.");
   const current=await weekCalculation(tx,employeeId,value.week,await databaseNow(tx));const row=await tx.overtimeReview.findUnique({where:{employeeId_weekStartDate:{employeeId,weekStartDate:dateValue(current.week)}}});
   const stale=!!row && (row.status==="STALE" || row.actualSecondsSnapshot!==current.actualSeconds || row.thresholdSeconds!==current.thresholdSeconds || row.policyVersion!==current.policyVersion || current.blockers.length>0);
   return {employee,current,row:row?{id:row.id,status:stale?"STALE":row.status,revision:row.revision,approvedSeconds:row.approvedSeconds,actualSecondsSnapshot:row.actualSecondsSnapshot,potentialSecondsSnapshot:row.potentialSecondsSnapshot,reviewedAt:row.reviewedAt,reviewComment:row.reviewComment}:null,
    activeApprovedSeconds:row?.status==="APPROVED" && !stale?row.approvedSeconds:0,allocation:row?.status==="APPROVED" && !stale?tail(current.candidates,row.approvedSeconds):[],canDecide:!own && !(actor.role==="HR_MANAGER" && actor.employeeId===employeeId)};
  },{isolationLevel:"RepeatableRead"});
 });
}
export async function updateOvertimePolicy(identity:Identity|null,input:unknown) {
 await securityBoundary(identity,async actor=>assertRole(actor,["ADMIN"]));const value=validated(policySchema,input);
 return authorizedMutation(identity,async(actor,tx)=>{
  assertRole(actor,["ADMIN"]);const old=await tx.organizationSettings.findUniqueOrThrow({where:{id:1}}),now=await databaseNow(tx),today=localDate(now,old.timezone);
  let history=policies(old.overtimePolicyVersions);
  if(!history.length)history.push({effectiveFrom:localWeek("0001-01-07",value.weekStartDay),thresholdSeconds:144000,ruleVersion:1});
  if(value.weekStartDay!==old.weekStartDay && (await tx.workSchedule.count() || await tx.attendanceSession.count() || await tx.overtimeReview.count() || await tx.leaveRequest.count() || await tx.calendarDay.count() || await tx.compensationRate.count() || await tx.salaryPeriod.count()))throw new AppError(409,"WEEK_FROZEN","Week start is fixed after official records. Historical transitions need a reviewed revision.");
  if(value.effectiveFrom<=today || localWeek(value.effectiveFrom,value.weekStartDay)!==value.effectiveFrom || history.length && value.effectiveFrom<=history.at(-1)!.effectiveFrom)throw new AppError(400,"POLICY_DATE","Append a future workweek start later than existing policy versions.");
  if(value.weekStartDay!==old.weekStartDay)history=history.map(p=>({...p,effectiveFrom:localWeek(p.effectiveFrom,value.weekStartDay)}));
  const next=[...history,{effectiveFrom:value.effectiveFrom,thresholdSeconds:value.thresholdSeconds,ruleVersion:(history.at(-1)?.ruleVersion??0)+1}];
  await tx.organizationSettings.update({where:{id:1},data:{weekStartDay:value.weekStartDay,overtimePolicyVersions:next,changedBy:actor.userId,rulesVersion:{increment:1}}});
  await audit({actorUserId:actor.userId,action:"OVERTIME_SETTINGS_CHANGED",entity:"organization_settings",entityId:"1",reason:value.reason,before:{weekStartDay:old.weekStartDay,policies:history},after:{weekStartDay:value.weekStartDay,policies:next}},tx);
 });
}
export async function overtimeQueue(identity:Identity|null,query:unknown={}) {
 return securityBoundary(identity,async actor=>{assertRole(actor,["ADMIN","HR_MANAGER"]);const v=validated(listSchema,query);
 const rows=await db.overtimeReview.findMany({where:v.status?{status:v.status}:{},orderBy:[{weekStartDate:"desc"},{id:"desc"}],skip:(v.page-1)*25,take:26,select:{id:true,employeeId:true,weekStartDate:true,status:true,revision:true,approvedSeconds:true,actualSecondsSnapshot:true,potentialSecondsSnapshot:true,thresholdSeconds:true}});
 return {records:await Promise.all(rows.slice(0,25).map(async r=>({...r,employee:await db.employee.findUniqueOrThrow({where:{id:r.employeeId},select:{legalName:true}})}))),hasNext:rows.length>25,page:v.page};});
}
export async function ownOvertime(identity:Identity|null,query:unknown={}) {
 return securityBoundary(identity,async actor=>{
  const value=validated((await import("./validation")).weekReadSchema,query);
  if(!actor.employeeId)return null;
  const settings=await db.organizationSettings.findUniqueOrThrow({where:{id:1},select:{timezone:true}});
  return overtimeData(identity,actor.employeeId,value.week??localDate(await databaseNow(db),settings.timezone),true);
 });
}
