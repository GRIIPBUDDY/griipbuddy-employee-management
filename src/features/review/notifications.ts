import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { visibleNotifications } from "./notification-visibility";
import { documentParentVisible } from "@/features/people-operations/access";
import { db } from "@/lib/db/client";
import type { Database } from "@/lib/db/audit";
import { securityBoundary } from "@/lib/authorization/actor";
import { authorizedMutation } from "@/lib/db/mutation";
import { validated,uuidSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import type { Actor, Identity } from "@/types/auth";
export async function notify(tx:Database,employeeId:string,eventType:string,sourceType:string,sourceId:string,eventKey:string,text:string,staff=false) {
 const employee=await tx.employee.findUniqueOrThrow({where:{id:employeeId},select:{userId:true}});
 const recipients=staff ? await tx.user.findMany({where:{isActive:true,...(sourceType==="preorders"?{OR:[{role:"ADMIN"},{role:"HR_MANAGER",canManageCommissions:true}]}:{role:{in:["ADMIN","HR_MANAGER"]}})},select:{id:true}}) : [{id:employee.userId}];
 for(const r of recipients) await tx.notification.upsert({where:{recipientUserId_eventKey:{recipientUserId:r.id,eventKey}},create:{recipientUserId:r.id,employeeId,eventType,sourceType,sourceId,eventKey,text},update:{}});
}
async function sourceHref(client:Database,actor:Actor,row:{eventType:string,sourceType:string,sourceId:string,employeeId:string|null}) {
 if(row.sourceType==="salary_periods")return row.eventType.startsWith("STAFF_") && actor.role!=="EMPLOYEE" && await client.salaryPeriod.findUnique({where:{id:row.sourceId},select:{id:true}})?`/manage/salary?id=${row.sourceId}`:null;
 if(!row.employeeId)return null;
 const staff=row.eventType.startsWith("STAFF_");
 if(staff && actor.role!=="ADMIN" && actor.role!=="HR_MANAGER" || !staff && actor.employeeId!==row.employeeId)return null;
 const where={id:row.sourceId,employeeId:row.employeeId},prefix=staff?"/manage":"/me";
 if(row.sourceType==="performance_reviews")return await client.performanceReview.findFirst({where:{...where,...(!staff?{publishedAt:{not:null},employeeVisible:true}:{})},select:{id:true}})?`${prefix}/performance?id=${row.sourceId}`:null;
 if(row.sourceType==="disciplinary_records")return await client.disciplinaryRecord.findFirst({where:{...where,...(!staff?{publishedAt:{not:null},employeeVisible:true,revokedAt:null}:{})},select:{id:true}})?`${prefix}/warnings?id=${row.sourceId}`:null;
 if(row.sourceType==="asset_assignments")return await client.assetAssignment.findFirst({where,select:{id:true}})?`${prefix}/assets?assignmentId=${row.sourceId}`:null;
 if(row.sourceType==="preorders") {
  if(staff?!(actor.role==="ADMIN" || actor.role==="HR_MANAGER" && actor.canManageCommissions):!actor.preorderCommissionEnabled)return null;
  return await client.preorder.findFirst({where,select:{id:true}})?`${prefix}/commissions?id=${row.sourceId}`:null;
 }
 if(row.sourceType==="salary_calculations")return await client.salaryCalculation.findFirst({where:{...where,finalizedAt:{not:null}},select:{id:true}})?`${prefix}/salary/${row.sourceId}`:null;
 if(row.sourceType==="employee_documents") {
  const source=await client.employeeDocument.findFirst({where:{...where,deletedAt:null,...(!staff?{employeeVisible:true}:{})},select:{id:true}});
  return source && (staff || await documentParentVisible(client,row.employeeId,row.sourceId))?`${prefix}/documents${staff?`?employeeId=${row.employeeId}`:""}`:null;
 }
 if(row.sourceType==="attendance_sessions") {
  const source=await client.attendanceSession.findFirst({where:{...where,voidedAt:null},select:{workDate:true}});
  return source?staff?`/manage/employees/${row.employeeId}/attendance/day?date=${source.workDate.toISOString().slice(0,10)}`:`/me/attendance`:null;
 }
 if(row.sourceType==="attendance_corrections")return await client.attendanceCorrection.findFirst({where,select:{id:true}})?`${prefix}/corrections?id=${row.sourceId}`:null;
 if(row.sourceType==="leave_requests")return await client.leaveRequest.findFirst({where,select:{id:true}})?`${prefix}/leave?id=${row.sourceId}`:null;
 if(row.sourceType==="overtime_reviews") {
  const source=await client.overtimeReview.findFirst({where,select:{weekStartDate:true}});
  return source?`${prefix}/overtime?${staff?`employeeId=${row.employeeId}&`:""}week=${source.weekStartDate.toISOString().slice(0,10)}`:null;
 }
 return null;
}
const pageSchema=z.object({page:z.coerce.number().int().min(1).max(10000).default(1),status:z.enum(["ALL","UNREAD","READ"]).default("ALL")}).strict();
export function notificationTitle(type:string) { return type.replace(/^STAFF_/,"").toLowerCase().replaceAll("_"," ").replace(/^./,v=>v.toUpperCase()); }
export async function notificationPage(identity:Identity|null,query:unknown={}) {
 return securityBoundary(identity,async actor=>{
  const v=validated(pageSchema,query);
  return db.$transaction(async tx=>{
   const visible=visibleNotifications(actor),read=v.status==="UNREAD"?Prisma.sql`AND n.read_at IS NULL`:v.status==="READ"?Prisma.sql`AND n.read_at IS NOT NULL`:Prisma.empty;
   const counts=await tx.$queryRaw<{total:bigint;unread:bigint}[]>(Prisma.sql`SELECT count(*) FILTER (WHERE true ${read}) AS total,count(*) FILTER (WHERE n.read_at IS NULL) AS unread FROM notifications n WHERE ${visible}`);
   const ids=await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT n.id FROM notifications n WHERE ${visible} ${read} ORDER BY n.created_at DESC,n.id DESC LIMIT 25 OFFSET ${(v.page-1)*25}`);
   const rows=await tx.notification.findMany({where:{id:{in:ids.map(r=>r.id)}},orderBy:[{createdAt:"desc"},{id:"desc"}],select:{id:true,employeeId:true,eventType:true,text:true,sourceType:true,sourceId:true,readAt:true,createdAt:true}});
   const items=await Promise.all(rows.map(async({employeeId,...row})=>{const href=await sourceHref(tx,actor,{...row,employeeId});return href?{...row,title:notificationTitle(row.eventType),href}:null;}));
   return {records:items.filter(item=>item!==null),total:Number(counts[0].total),unread:Number(counts[0].unread),page:v.page,pages:Math.max(1,Math.ceil(Number(counts[0].total)/25))};
  },{isolationLevel:"RepeatableRead"});
 });
}
// Compatibility for existing consumers; new list requests use the paginated service.
export async function notificationList(identity:Identity|null) { return (await notificationPage(identity)).records; }
export async function unreadNotifications(identity:Identity|null) {
 return securityBoundary(identity,async actor=>{const result=await db.$queryRaw<{count:bigint}[]>(Prisma.sql`SELECT count(*) FROM notifications n WHERE ${visibleNotifications(actor)} AND n.read_at IS NULL`);return Number(result[0].count);});
}
export async function readAllNotifications(identity:Identity|null) {
 return authorizedMutation(identity,async(actor,tx)=>({count:await tx.$executeRaw(Prisma.sql`UPDATE notifications n SET read_at=clock_timestamp() WHERE ${visibleNotifications(actor)} AND n.read_at IS NULL`)}));
}
export async function notifySalaryPeriod(tx:Database,periodId:string,revision:number,status:string) {
 const recipients=await tx.user.findMany({where:{isActive:true,role:{in:["ADMIN","HR_MANAGER"]}},select:{id:true}});
 for(const r of recipients)await tx.notification.upsert({where:{recipientUserId_eventKey:{recipientUserId:r.id,eventKey:`salary-period:${periodId}:${revision}:${status}`}},create:{recipientUserId:r.id,eventType:"STAFF_SALARY_REVIEW",text:"A salary period requires review or closeout.",sourceType:"salary_periods",sourceId:periodId,eventKey:`salary-period:${periodId}:${revision}:${status}`},update:{}});
}
export async function readNotification(identity:Identity|null,input:unknown) {
 const id=validated(uuidSchema,input);
 return authorizedMutation(identity,async(actor,tx)=>{
  const record=await tx.notification.findFirst({where:{id,recipientUserId:actor.userId,...(actor.role==="EMPLOYEE"?{eventType:{not:{startsWith:"STAFF_"}}}:{})}});
  if(!record || !await sourceHref(tx,actor,record)) throw new AppError(404,"NOT_FOUND","Notification not found.");
  await tx.notification.update({where:{id},data:{readAt:record.readAt??new Date()}});
 });
}
