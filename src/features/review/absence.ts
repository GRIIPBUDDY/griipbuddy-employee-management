import "server-only";
import { db } from "@/lib/db/client";
import { audit,type Database } from "@/lib/db/audit";
import { securityBoundary } from "@/lib/authorization/actor";
import { authorizedMutation } from "@/lib/db/mutation";
import { assertRole } from "@/lib/authorization/policy";
import { validated,uuidSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import type { Identity } from "@/types/auth";
import { databaseNow } from "@/features/time/clock";
import { dateValue,localDate,dateKey,dayStart,addDays } from "@/features/time/dates";
import type { Occurrence } from "@/features/time/occurrences";
import { interval,subtract,windowFor } from "./calculation";
import { leaveSchema,datedLeaveSchema,leaveFilterSchema,leaveDecisionSchema,holidaySchema,withdrawSchema } from "./validation";
import {peopleEvent} from "@/features/people/service";
import { reviewer,invalidateOvertime } from "./overtime";
import { notify } from "./notifications";
export async function requiredOccurrence(tx:Database,o:Occurrence,holidayWorkRequired:boolean,timezone:string,earlyMinutes:number) {
 const [leaves,holidays]=await Promise.all([
  tx.leaveRequest.findMany({where:{employeeId:(await tx.employmentPeriod.findUniqueOrThrow({where:{id:o.employmentPeriodId},select:{employeeId:true}})).employeeId,status:"APPROVED",startAt:{lt:o.eligibleEndAt},endAt:{gt:o.scheduledStartAt}},select:{startAt:true,endAt:true}}),
  holidayWorkRequired?Promise.resolve([]):tx.calendarDay.findMany({where:{localDate:{gte:dateValue(o.workDate),lte:dateValue(addDays(o.workDate,1))}},select:{localDate:true}})
 ]);
 const remaining=subtract([interval(o.scheduledStartAt,o.eligibleEndAt)],[...leaves.map(l=>interval(l.startAt,l.endAt)),...holidays.map(h=>windowFor(dateKey(h.localDate),1,timezone))]);
 if(!remaining.length)return {remaining,earliest:null};
 return {remaining,earliest:new Date(remaining[0].start*1000-earlyMinutes*60000)};
}
export async function requestLeave(identity:Identity|null,input:unknown) {
 await securityBoundary(identity,async actor=>{if(!actor.employeeId || !actor.employmentActive)throw new AppError(403,"PROFILE_REQUIRED","An active employee profile is required.");});const v=validated(leaveSchema,input);
 return authorizedMutation(identity,async(actor,tx)=>{
  if(!actor.employeeId || !actor.employmentActive)throw new AppError(403,"PROFILE_REQUIRED","An active employee profile is required.");
  const settings=await tx.organizationSettings.findUniqueOrThrow({where:{id:1}});
  if(v.operationKey){const old=await tx.leaveRequest.findUnique({where:{employeeId_operationKey:{employeeId:actor.employeeId,operationKey:v.operationKey}}});if(old){if(old.startAt.getTime()!==v.startAt.getTime()||old.endAt.getTime()!==v.endAt.getTime()||old.type!==v.type||old.category!==v.category||old.reason!==v.reason)throw new AppError(409,"OPERATION_REUSED","Request key belongs to another leave proposal.");return old.id;}}
  if(await tx.leaveRequest.count({where:{employeeId:actor.employeeId,startAt:v.startAt,endAt:v.endAt,status:{in:["PENDING","APPROVED"]}}}))throw new AppError(409,"DUPLICATE_LEAVE","A current request already covers these exact dates.");
  const period=await tx.employmentPeriod.findFirst({where:{employeeId:actor.employeeId,startDate:{lte:dateValue(localDate(v.startAt,settings.timezone))},OR:[{endDate:null},{endDate:{gt:dateValue(localDate(v.startAt,settings.timezone))}}]}});
  if(!period || period.endDate && v.endAt>dayStart(dateKey(period.endDate),settings.timezone))throw new AppError(400,"EMPLOYMENT_COVERAGE","Leave must fit an employment stint.");
  const row=await tx.leaveRequest.create({data:{employeeId:actor.employeeId,employmentPeriodId:period.id,...v,requestedBy:actor.userId}});
  await audit({actorUserId:actor.userId,employeeId:row.employeeId,action:"LEAVE_REQUESTED",entity:"leave_requests",entityId:row.id,reason:v.reason,after:{startAt:v.startAt.toISOString(),endAt:v.endAt.toISOString(),type:v.type,category:v.category}},tx);
  await peopleEvent(tx,{employeeId:row.employeeId,actorUserId:actor.userId,type:"LEAVE_REQUESTED",title:"Leave requested",sourceType:"leave_requests",sourceId:row.id});
  await notify(tx,row.employeeId,"STAFF_LEAVE_PENDING","leave_requests",row.id,`leave-pending:${row.id}`,"A leave request needs review.",true);return row.id;
 });
}
export async function decideLeave(identity:Identity|null,input:unknown) {
 await securityBoundary(identity,async actor=>assertRole(actor,["ADMIN","HR_MANAGER"]));const v=validated(leaveDecisionSchema,input);
 return authorizedMutation(identity,async(actor,tx)=>{
  const row=await tx.leaveRequest.findUnique({where:{id:v.id}});if(!row)throw new AppError(404,"NOT_FOUND","Leave not found.");reviewer(actor,row.employeeId);
  if(row.revision!==v.revision || (v.decision==="CANCELLED"?row.status!=="APPROVED":row.status!=="PENDING"))throw new AppError(409,"STALE","Leave changed; refresh before reviewing.");
  if(v.decision==="APPROVED"){
   const settings=await tx.organizationSettings.findUniqueOrThrow({where:{id:1}}),period=await tx.employmentPeriod.findUniqueOrThrow({where:{id:row.employmentPeriodId}});
   if(row.startAt<dayStart(dateKey(period.startDate),settings.timezone) || period.endDate && row.endAt>dayStart(dateKey(period.endDate),settings.timezone))throw new AppError(409,"EMPLOYMENT_COVERAGE","Employment dates changed; this leave no longer fits.");
   if(await tx.leaveRequest.count({where:{employeeId:row.employeeId,status:"APPROVED",startAt:{lt:row.endAt},endAt:{gt:row.startAt}}}))throw new AppError(409,"LEAVE_OVERLAP","Approved leave already covers part of this interval.");
  }
  const now=await databaseNow(tx);await tx.leaveRequest.update({where:{id:row.id},data:{status:v.decision,reviewedBy:actor.userId,reviewedAt:now,reviewComment:v.comment,revision:{increment:1}}});
  if(v.decision!=="REJECTED")await invalidateOvertime(tx,row.employeeId,actor.userId,row.startAt,row.endAt,now);
  await audit({actorUserId:actor.userId,employeeId:row.employeeId,action:`LEAVE_${v.decision}`,entity:"leave_requests",entityId:row.id,reason:v.comment,before:{status:row.status,revision:row.revision,reviewedBy:row.reviewedBy,reviewedAt:row.reviewedAt?.toISOString()??null,reviewComment:row.reviewComment},after:{status:v.decision,revision:row.revision+1,reviewedBy:actor.userId,reviewedAt:now.toISOString(),reviewComment:v.comment}},tx);
  await notify(tx,row.employeeId,"LEAVE_DECIDED","leave_requests",row.id,`leave-decision:${row.id}:${row.revision+1}`,`Your leave request was ${v.decision.toLowerCase()}.`);
  await peopleEvent(tx,{employeeId:row.employeeId,actorUserId:actor.userId,type:`LEAVE_${v.decision}`,title:`Leave request ${v.decision.toLowerCase()}`,sourceType:"leave_requests",sourceId:row.id});
 });
}
export async function withdrawLeave(identity:Identity|null,input:unknown) {
 const v=validated(withdrawSchema,input);return authorizedMutation(identity,async(actor,tx)=>{
  const row=await tx.leaveRequest.findFirst({where:{id:v.id,employeeId:actor.employeeId??"00000000-0000-0000-0000-000000000000"}});if(!row)throw new AppError(404,"NOT_FOUND","Leave not found.");
  if(row.status!=="PENDING")throw new AppError(409,"DECIDED","Only pending leave can be withdrawn.");
  await tx.leaveRequest.update({where:{id:row.id},data:{status:"WITHDRAWN",revision:{increment:1}}});await audit({actorUserId:actor.userId,employeeId:row.employeeId,action:"LEAVE_WITHDRAWN",entity:"leave_requests",entityId:row.id},tx);
  await peopleEvent(tx,{employeeId:row.employeeId,actorUserId:actor.userId,type:"LEAVE_WITHDRAWN",title:"Pending leave withdrawn",sourceType:"leave_requests",sourceId:row.id});
 });
}
export async function saveHoliday(identity:Identity|null,input:unknown) {
 await securityBoundary(identity,async actor=>assertRole(actor,["ADMIN","HR_MANAGER"]));const v=validated(holidaySchema,input);
 return authorizedMutation(identity,async(actor,tx)=>{
  assertRole(actor,["ADMIN","HR_MANAGER"]);const old=await tx.calendarDay.findUnique({where:{localDate:dateValue(v.date)}});
  const row=await tx.calendarDay.upsert({where:{localDate:dateValue(v.date)},create:{localDate:dateValue(v.date),name:v.name,createdBy:actor.userId},update:{name:v.name,revision:{increment:1}}});
  await audit({actorUserId:actor.userId,action:"HOLIDAY_SAVED",entity:"calendar_days",entityId:row.id,reason:v.reason,...(old?{before:{name:old.name,revision:old.revision}}:{}),after:{date:v.date,name:v.name,revision:row.revision}},tx);
 });
}
export async function absenceData(identity:Identity|null,staff=false,page=1,idInput?:unknown,filters:unknown={}) {
 return securityBoundary(identity,async actor=>{
  if(staff)assertRole(actor,["ADMIN","HR_MANAGER"]);
  if(!Number.isInteger(page) || page<1 || page>10000)throw new AppError(400,"VALIDATION","Choose a valid page.");
  const id=idInput===undefined?undefined:validated(uuidSchema,idInput);
  const f=validated(leaveFilterSchema,filters);if(!staff&&f.employeeId)throw new AppError(400,"VALIDATION","Own leave identity comes from your account.");const timezone=(await db.organizationSettings.findUniqueOrThrow({where:{id:1}})).timezone;
  const rows=await db.leaveRequest.findMany({where:{...(staff?f.employeeId?{employeeId:f.employeeId}:{}:{employeeId:actor.employeeId??"00000000-0000-0000-0000-000000000000"}),...(id||f.id?{id:id??f.id}:{}),...(f.status?{status:f.status}:{}),...(f.category?{category:f.category}:{}),...(f.from?{endAt:{gt:dayStart(f.from,timezone)}}:{}),...(f.until?{startAt:{lt:dayStart(f.until,timezone)}}:{})},skip:(page-1)*25,take:26,orderBy:[{createdAt:"desc"},{id:"desc"}],select:{id:true,employeeId:true,type:true,category:true,startAt:true,endAt:true,reason:true,status:true,createdAt:true,reviewedBy:true,reviewComment:true,reviewedAt:true,revision:true}});
  if((id||f.id) && !rows.length)throw new AppError(404,"NOT_FOUND","Leave not found.");
  return {records:await Promise.all(rows.slice(0,25).map(async({reviewedBy,...row})=>{const reviewer=reviewedBy?await db.user.findUnique({where:{id:reviewedBy},select:{displayName:true,employee:{select:{legalName:true}}}}):null;const decisions=await db.auditLog.findMany({where:{entity:"leave_requests",entityId:row.id,action:{in:["LEAVE_APPROVED","LEAVE_REJECTED","LEAVE_CANCELLED"]}},orderBy:{eventTime:"asc"},select:{id:true,action:true,reason:true,eventTime:true,actorUserId:true}});const reviewHistory=await Promise.all(decisions.map(async d=>{const person=d.actorUserId?await db.user.findUnique({where:{id:d.actorUserId},select:{displayName:true,employee:{select:{legalName:true}}}}):null;return {id:d.id,decision:d.action.replace("LEAVE_",""),comment:d.reason??"",at:d.eventTime,reviewerName:person?.employee?.legalName??person?.displayName??"Authorized staff"};}));return {...row,reviewHistory,reviewerName:reviewer?.employee?.legalName??reviewer?.displayName??null,employee:staff?await db.employee.findUniqueOrThrow({where:{id:row.employeeId},select:{legalName:true}}):null,canDecide:staff && !(actor.role==="HR_MANAGER" && actor.employeeId===row.employeeId)};})),hasNext:rows.length>25,page,
   holidays:await db.calendarDay.findMany({orderBy:{localDate:"desc"},take:100,select:{id:true,localDate:true,name:true}}),timezone};
 });
}
export async function requestDatedLeave(identity:Identity|null,input:unknown){
 const v=validated(datedLeaveSchema,input),timezone=await securityBoundary(identity,async()=> (await db.organizationSettings.findUniqueOrThrow({where:{id:1}})).timezone);
 return requestLeave(identity,{startAt:dayStart(v.startDate,timezone).toISOString(),endAt:dayStart(addDays(v.endDate,1),timezone).toISOString(),type:v.type,category:v.category,reason:v.reason,operationKey:v.operationKey});
}
