import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db/client";
import { securityBoundary } from "@/lib/authorization/actor";
import { assertRole } from "@/lib/authorization/policy";
import { validated,uuidSchema } from "@/lib/validation/schemas";
import { redactAudit } from "@/lib/db/audit-redaction";
import { AppError } from "@/lib/utils/errors";
import type { Actor,Identity } from "@/types/auth";
import { dayStart } from "@/features/time/dates";
import { auditQuery } from "./validation";
const hrEntities=["task_assignments","leave_allowances","weekly_earning_statements","shift_swap_requests","employees","employment_periods","departments","positions","work_schedules","attendance_sessions","attendance_corrections","overtime_reviews","leave_requests","employee_documents","employee_activities","performance_reviews","disciplinary_records","assets","asset_assignments","compensation_rates","salary_periods","salary_calculations","salary_adjustments","preorders"];
export function auditPermission(actor:Actor) {
 if(actor.role==="ADMIN")return Prisma.sql`true`;
 return Prisma.sql`((a.entity='users' AND a.action='ACCOUNT_STATUS_CHANGED' AND EXISTS (SELECT 1 FROM users u WHERE u.id::text=a.entity_id AND u.role='EMPLOYEE')) OR a.entity IN (${Prisma.join(hrEntities)})) AND a.action NOT IN ('EMPLOYEE_COMMISSION_FEATURE_CHANGED','COMMISSION_ELIGIBILITY_CHANGED') AND
 (${actor.canManageCommissions} OR (a.entity NOT IN ('preorders','salary_calculations','salary_adjustments','weekly_earning_statements') AND a.action NOT LIKE '%COMMISSION%' OR
 a.entity='salary_calculations' AND a.after->>'commissionRelated'='false' AND EXISTS (SELECT 1 FROM salary_calculations c WHERE c.id::text=a.entity_id AND c.calculation_snapshot->>'commissionRelated'='false') OR
 a.entity='weekly_earning_statements' AND a.after->>'commissionRelated'='false' AND EXISTS(SELECT 1 FROM weekly_earning_statements w WHERE w.id::text=a.entity_id AND w.calculation_snapshot->>'commissionRelated'='false') OR
 a.entity='salary_adjustments' AND EXISTS (SELECT 1 FROM salary_adjustments s WHERE s.id::text=a.entity_id AND NOT s.commission_related)))`;
}
export async function auditData(identity:Identity|null,input:unknown={},detailId?:unknown) {
 return securityBoundary(identity,async actor=>{
  assertRole(actor,["ADMIN","HR_MANAGER"]);const v=validated(auditQuery,input),id=detailId===undefined?undefined:validated(uuidSchema,detailId);
  const settings=await db.organizationSettings.findUniqueOrThrow({where:{id:1},select:{timezone:true}});
  if(v.from&&v.until&&v.until<=v.from)throw new AppError(400,"RANGE","End date must follow start date (exclusive).");
  const search=v.search.replaceAll("\\","\\\\").replaceAll("%","\\%").replaceAll("_","\\_");
  const predicate=Prisma.sql`${auditPermission(actor)} ${id?Prisma.sql`AND a.id=${id}::uuid`:Prisma.empty}
   ${v.from?Prisma.sql`AND a.event_time>=${dayStart(v.from,settings.timezone)}`:Prisma.empty} ${v.until?Prisma.sql`AND a.event_time<${dayStart(v.until,settings.timezone)}`:Prisma.empty}
   ${v.actorId?Prisma.sql`AND a.actor_user_id=${v.actorId}::uuid`:Prisma.empty} ${v.employeeId?Prisma.sql`AND a.employee_id=${v.employeeId}::uuid`:Prisma.empty}
   ${v.action?Prisma.sql`AND a.action=${v.action}`:Prisma.empty} ${v.entity?Prisma.sql`AND a.entity=${v.entity}`:Prisma.empty} ${v.recordId?Prisma.sql`AND a.entity_id=${v.recordId}`:Prisma.empty}
   ${search?Prisma.sql`AND (a.action ILIKE ${`%${search}%`} OR a.entity ILIKE ${`%${search}%`} OR a.entity_id ILIKE ${`%${search}%`} OR a.system_source ILIKE ${`%${search}%`})`:Prisma.empty}`;
  return db.$transaction(async tx=>{
   const total=Number((await tx.$queryRaw<{count:bigint}[]>(Prisma.sql`SELECT count(*) FROM audit_logs a WHERE ${predicate}`))[0].count);
   const ids=await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT a.id FROM audit_logs a WHERE ${predicate} ORDER BY a.event_time DESC,a.id DESC LIMIT ${id?1:25} OFFSET ${id?0:(v.page-1)*25}`);
   const rows=await tx.auditLog.findMany({where:{id:{in:ids.map(row=>row.id)}},orderBy:[{eventTime:"desc"},{id:"desc"}],select:{id:true,actorUserId:true,employeeId:true,action:true,entity:true,entityId:true,eventTime:true,requestId:true,systemSource:true,...(id?{before:true,after:true,reason:true}:{}),actor:{select:{displayName:true,employee:{select:{legalName:true}}}},employee:{select:{legalName:true,employeeNumber:true}}}});
   if(id&&!rows.length)throw new AppError(404,"NOT_FOUND","Audit event not found.");
   const records=rows.map(({actor,employee,...row})=>({...row,actorName:actor?.employee?.legalName??actor?.displayName??(row.actorUserId?`User ${row.actorUserId}`:row.systemSource??"System"),employeeName:employee?`${employee.employeeNumber} · ${employee.legalName}`:null,...(id?{before:redactAudit(row.before),after:redactAudit(row.after)}:{})}));
   return {records,total,page:v.page,pages:Math.max(1,Math.ceil(total/25)),timezone:settings.timezone};
  },{isolationLevel:"RepeatableRead"});
 });
}
