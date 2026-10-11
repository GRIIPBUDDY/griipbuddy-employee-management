import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/db/audit";
import { authorizedMutation } from "@/lib/db/mutation";
import { securityBoundary } from "@/lib/authorization/actor";
import { assertRole,assertOperational } from "@/lib/authorization/policy";
import { validated,uuidSchema,dateSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import type { Identity } from "@/types/auth";
import { databaseNow } from "@/features/time/clock";
import { dateValue,localDate,addDays } from "@/features/time/dates";
import { notify } from "@/features/review/notifications";
import { timeEvent } from "@/features/time/schedules";
const fields=z.object({title:z.string().trim().min(1).max(150),description:z.string().trim().max(5000),assignedDate:dateSchema,dueDate:dateSchema.nullable().default(null),priority:z.enum(["LOW","NORMAL","HIGH"]).default("NORMAL")}).refine(v=>!v.dueDate||v.dueDate>=v.assignedDate,"Due date must follow assignment date.");
const assignSchema=fields.safeExtend({employeeIds:z.array(uuidSchema).min(1).max(100).refine(v=>new Set(v).size===v.length,"Choose each employee once."),operationKey:uuidSchema}).strict();
const progressSchema=z.object({id:uuidSchema,revision:z.number().int().positive(),status:z.enum(["IN_PROGRESS","COMPLETED"]),note:z.string().trim().max(2000).default("")}).strict();
const editSchema=fields.safeExtend({id:uuidSchema,revision:z.number().int().positive(),reason:z.string().trim().min(1).max(500)}).strict();
const filterSchema=z.object({from:dateSchema.optional(),until:dateSchema.optional(),dateBy:z.enum(["ASSIGNED","DUE","COMPLETED"]).default("ASSIGNED"),employeeId:uuidSchema.optional(),status:z.enum(["ASSIGNED","IN_PROGRESS","COMPLETED"]).optional(),page:z.coerce.number().int().min(1).max(10000).default(1)}).strict();
export async function assignTasks(identity:Identity|null,input:unknown){
 await securityBoundary(identity,async a=>assertRole(a,["ADMIN","HR_MANAGER"]));const v=validated(assignSchema,input);
 return authorizedMutation(identity,async(a,tx)=>{
  assertRole(a,["ADMIN","HR_MANAGER"]);const ids=[...v.employeeIds].sort(),old=await tx.taskAssignment.findMany({where:{operationKey:v.operationKey},orderBy:{employeeId:"asc"}});
  if(old.length){if(JSON.stringify(old.map(r=>r.employeeId))!==JSON.stringify(ids) || old.some(r=>r.title!==v.title || r.description!==v.description || r.assignedDate.getTime()!==dateValue(v.assignedDate).getTime() || (r.dueDate?.getTime()??null)!==(v.dueDate?dateValue(v.dueDate).getTime():null) || r.priority!==v.priority || r.createdBy!==a.userId))throw new AppError(409,"OPERATION_REUSED","Bulk request key was used for another assignment.");return old.map(r=>r.id);}
  const now=await databaseNow(tx),created:string[]=[];
  for(const employeeId of ids){
   const e=await tx.employee.findFirst({where:{id:employeeId,user:{role:"EMPLOYEE",accountStatus:"ACTIVE",isActive:true},employmentPeriods:{some:{startDate:{lte:dateValue(v.assignedDate)},OR:[{endDate:null},{endDate:{gt:dateValue(v.assignedDate)}}]}}},select:{id:true}});if(!e)throw new AppError(409,"ASSIGNMENT_INELIGIBLE","Each assignee must have active employment and an active employee account.");
   const r=await tx.taskAssignment.create({data:{employeeId,title:v.title,description:v.description,assignedDate:dateValue(v.assignedDate),dueDate:v.dueDate?dateValue(v.dueDate):null,priority:v.priority,operationKey:v.operationKey,createdBy:a.userId}});created.push(r.id);
   await audit({actorUserId:a.userId,employeeId,action:"TASK_ASSIGNED",entity:"task_assignments",entityId:r.id,after:{title:r.title,assignedDate:v.assignedDate,dueDate:v.dueDate,status:r.status}},tx);
   await timeEvent(tx,employeeId,a.userId,now,"TASK_ASSIGNED","Task assigned","task_assignments",r.id);await notify(tx,employeeId,"TASK_ASSIGNED","task_assignments",r.id,`task:${r.id}`,"A task has been assigned to you.");
  }return created;
 });
}
export async function updateTaskProgress(identity:Identity|null,input:unknown){
 await securityBoundary(identity,async a=>assertOperational(a));const v=validated(progressSchema,input);
 return authorizedMutation(identity,async(a,tx)=>{
  assertOperational(a);const r=await tx.taskAssignment.findFirst({where:{id:v.id,employeeId:a.employeeId??"00000000-0000-0000-0000-000000000000"}});if(!r)throw new AppError(404,"NOT_FOUND","Task not found.");
  if(r.status===v.status && (v.status!=="COMPLETED" || r.completionNote===v.note))return r.id;
  if(!a.employmentActive || r.revision!==v.revision || r.status==="COMPLETED" || v.status==="IN_PROGRESS" && r.status!=="ASSIGNED")throw new AppError(409,"STALE","Refresh the current task before changing progress.");
  const now=await databaseNow(tx),settings=await tx.organizationSettings.findUniqueOrThrow({where:{id:1}});if(r.assignedDate>dateValue(localDate(now,settings.timezone)))throw new AppError(409,"TASK_FUTURE","The assignment date has not arrived.");
  await tx.taskAssignment.update({where:{id:r.id},data:{status:v.status,...(v.status==="COMPLETED"?{completedAt:now,completedBy:a.userId,completionNote:v.note}:{}),revision:{increment:1}}});
  await audit({actorUserId:a.userId,employeeId:r.employeeId,action:`TASK_${v.status}`,entity:"task_assignments",entityId:r.id,before:{status:r.status},after:{status:v.status,completedAt:v.status==="COMPLETED"?now.toISOString():null}},tx);
  await timeEvent(tx,r.employeeId,a.userId,now,`TASK_${v.status}`,v.status==="COMPLETED"?"Task completed":"Task started","task_assignments",r.id);
  if(v.status==="COMPLETED")await notify(tx,r.employeeId,"STAFF_TASK_COMPLETED","task_assignments",r.id,`task-done:${r.id}`,"An assigned task was completed.",true);return r.id;
 });
}
export async function editTask(identity:Identity|null,input:unknown){
 await securityBoundary(identity,async a=>assertRole(a,["ADMIN","HR_MANAGER"]));const v=validated(editSchema,input);
 return authorizedMutation(identity,async(a,tx)=>{
  assertRole(a,["ADMIN","HR_MANAGER"]);const r=await tx.taskAssignment.findUnique({where:{id:v.id}});if(!r)throw new AppError(404,"NOT_FOUND","Task not found.");if(r.revision!==v.revision || r.status==="COMPLETED")throw new AppError(409,"STALE","Completed assignments are retained. Refresh pending tasks.");
  await tx.taskAssignment.update({where:{id:r.id},data:{title:v.title,description:v.description,assignedDate:dateValue(v.assignedDate),dueDate:v.dueDate?dateValue(v.dueDate):null,priority:v.priority,revision:{increment:1}}});
  await audit({actorUserId:a.userId,employeeId:r.employeeId,action:"TASK_CHANGED",entity:"task_assignments",entityId:r.id,reason:v.reason,before:{title:r.title,description:r.description,assignedDate:r.assignedDate.toISOString()},after:{title:v.title,description:v.description,assignedDate:v.assignedDate,dueDate:v.dueDate}},tx);
  await notify(tx,r.employeeId,"TASK_CHANGED","task_assignments",r.id,`task-update:${r.id}:${r.revision+1}`,"Your task assignment was updated.");
 });
}
export async function taskData(identity:Identity|null,input:unknown={},own=false){return securityBoundary(identity,async a=>{
 if(!own)assertRole(a,["ADMIN","HR_MANAGER"]);const v=validated(filterSchema,input),settings=await db.organizationSettings.findUniqueOrThrow({where:{id:1}}),today=localDate(await databaseNow(db),settings.timezone),from=v.from??today,until=v.until??addDays(from,1);if(until<=from)throw new AppError(400,"RANGE","End date must follow start (exclusive).");
 if(own && v.employeeId && v.employeeId!==a.employeeId)throw new AppError(404,"NOT_FOUND","Task not found.");
 const employeeId=own?a.employeeId??"00000000-0000-0000-0000-000000000000":v.employeeId;
 const span=v.dateBy==="COMPLETED"?{gte:new Date((await import("@/features/time/dates")).dayStart(from,settings.timezone)),lt:(await import("@/features/time/dates")).dayStart(until,settings.timezone)}:{gte:dateValue(from),lt:dateValue(until)};
 const where={...(employeeId?{employeeId}:{}),...(v.status?{status:v.status}:{}),[v.dateBy==="DUE"?"dueDate":v.dateBy==="COMPLETED"?"completedAt":"assignedDate"]:span};
 const [records,total]=await Promise.all([db.taskAssignment.findMany({where,orderBy:[{assignedDate:"desc"},{id:"desc"}],skip:(v.page-1)*25,take:25}),db.taskAssignment.count({where})]);
 return {records:await Promise.all(records.map(async r=>({...r,employee:own?null:await db.employee.findUniqueOrThrow({where:{id:r.employeeId},select:{legalName:true}})}))),total,page:v.page,pages:Math.max(1,Math.ceil(total/25)),from,until,dateBy:v.dateBy,timezone:settings.timezone,operational:a.accountStatus!=="ON_HOLD"};
});}
