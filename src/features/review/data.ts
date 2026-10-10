import "server-only";
import { db } from "@/lib/db/client";
import { securityBoundary } from "@/lib/authorization/actor";
import { assertRole } from "@/lib/authorization/policy";
import { validated,uuidSchema,dateSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import type { Identity } from "@/types/auth";
import { databaseNow } from "@/features/time/clock";
import { addDays,localDate,dateValue,dayStart } from "@/features/time/dates";
import { filterSchema,ownSummarySchema } from "./validation";
import { localWeek } from "./calculation";
import { summary,weekCalculation } from "./summary";
function range(from:string|undefined,until:string|undefined,today:string, firstDay=1) {
 const start=from??localWeek(today,firstDay),end=until??addDays(start,7);
 if(end<=start || end>addDays(start,31))throw new AppError(400,"DATE_RANGE","Select a positive date range of at most 31 days. End date is exclusive.");return {from:start,until:end};
}
export async function ownSummary(identity:Identity|null,query:unknown={}) {
 return securityBoundary(identity,async actor=>{
  const v=validated(ownSummarySchema,query);if(!actor.employeeId)return null;
  const employeeId=actor.employeeId;
  return db.$transaction(async tx=>{const settings=await tx.organizationSettings.findUniqueOrThrow({where:{id:1}}),now=await databaseNow(tx),r=range(v.from,v.until,localDate(now,settings.timezone),settings.weekStartDay);return summary(tx,employeeId,r.from,r.until,now);},{isolationLevel:"RepeatableRead"});
 });
}
export async function attendanceManagement(identity:Identity|null,query:unknown={}) {
 return securityBoundary(identity,async actor=>{
  assertRole(actor,["ADMIN","HR_MANAGER"]);const v=validated(filterSchema,query);
  return db.$transaction(async tx=>{
   const settings=await tx.organizationSettings.findUniqueOrThrow({where:{id:1}}),now=await databaseNow(tx),r=range(v.from,v.until,localDate(now,settings.timezone),settings.weekStartDay);
   const employees=await tx.employee.findMany({where:{...(v.employeeId?{id:v.employeeId}:{}),...(v.departmentId?{employmentPeriods:{some:{departmentId:v.departmentId,startDate:{lt:dateValue(r.until)},OR:[{endDate:null},{endDate:{gt:dateValue(r.from)}}]}}}:{})},orderBy:[{legalName:"asc"},{id:"asc"}],skip:(v.page-1)*10,take:11,select:{id:true,legalName:true,employeeNumber:true}});
   const records=[];
   for(const employee of employees.slice(0,10)){
    const totals=await summary(tx,employee.id,r.from,r.until,now);
    const weeks=[...new Set(totals.days.map(d=>localWeek(d.date,settings.weekStartDay)))];
    const reviews=new Map<string,{status:string,potentialSeconds:number,approvedSeconds:number}>();
    for(const week of weeks){const input=await weekCalculation(tx,employee.id,week,now),row=await tx.overtimeReview.findUnique({where:{employeeId_weekStartDate:{employeeId:employee.id,weekStartDate:dateValue(week)}}});
     const stale=!!row && (row.status==="STALE" || row.actualSecondsSnapshot!==input.actualSeconds || input.blockers.length>0);
     reviews.set(week,{status:stale?"STALE":row?.status??"UNREVIEWED",potentialSeconds:input.potentialSeconds,approvedSeconds:row?.status==="APPROVED" && !stale?row.approvedSeconds:0});}
    for(const day of totals.days){const overtime=reviews.get(localWeek(day.date,settings.weekStartDay))!;
     const statuses=[...(day.lateSeconds?["LATE"]:[]),...(day.incompleteCount?["INCOMPLETE"]:[]),...(day.missingEndedSeconds?["MISSING"]:[]),...(day.earlySeconds?["EARLY"]:[]),...(day.pendingCorrections?["PENDING_CORRECTION"]:[])];
     if(v.status && !statuses.includes(v.status) || v.overtimeStatus && overtime.status!==v.overtimeStatus)continue;
     records.push({employee,...day,pendingCorrections:day.pendingCorrections,overtime,issues:totals.issues,leaveConflictSeconds:totals.leaveConflictSeconds});
    }
   }
   return {records,from:r.from,until:r.until,timezone:settings.timezone,page:v.page,hasNext:employees.length>10,
    employees:await tx.employee.findMany({orderBy:{legalName:"asc"},take:200,select:{id:true,legalName:true,employeeNumber:true}}),departments:await tx.department.findMany({where:{isActive:true},orderBy:{name:"asc"},select:{id:true,name:true}})};
  },{isolationLevel:"RepeatableRead",timeout:15000});
 });
}
export async function attendanceDay(identity:Identity|null,employeeIdInput:unknown,dateInput:unknown) {
 return securityBoundary(identity,async actor=>{
  assertRole(actor,["ADMIN","HR_MANAGER"]);const employeeId=validated(uuidSchema,employeeIdInput),date=validated(dateSchema,dateInput);
  return db.$transaction(async tx=>{
   const employee=await tx.employee.findUnique({where:{id:employeeId},select:{id:true,legalName:true,employeeNumber:true}});if(!employee)throw new AppError(404,"NOT_FOUND","Attendance not found.");
   const now=await databaseNow(tx),totals=await summary(tx,employeeId,date,addDays(date,1),now);
   const sessions=await tx.attendanceSession.findMany({where:{employeeId,checkinAt:{lt:dayStart(addDays(date,1),totals.timezone)},OR:[{checkoutAt:null},{checkoutAt:{gt:dayStart(date,totals.timezone)}}]},orderBy:{checkinAt:"asc"},select:{id:true,scheduleSlotId:true,workDate:true,checkinAt:true,checkoutAt:true,source:true,revision:true,voidedAt:true,scheduledStartAt:true,scheduledEndAt:true,timezoneSnapshot:true}});
   const corrections=await tx.attendanceCorrection.findMany({where:{employeeId,OR:[{workDate:dateValue(date)},{sessionId:{in:sessions.map(s=>s.id)}}]},orderBy:{createdAt:"desc"},select:{id:true,type:true,status:true,reason:true,reviewComment:true}});
   return {employee,...totals,sessions,corrections};
  },{isolationLevel:"RepeatableRead"});
 });
}
