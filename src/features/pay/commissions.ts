import "server-only";
import { db } from "@/lib/db/client";
import { audit,type Database } from "@/lib/db/audit";
import { authorizedMutation } from "@/lib/db/mutation";
import { securityBoundary } from "@/lib/authorization/actor";
import { assertOwnCommission,assertManageCommissions,assertRole } from "@/lib/authorization/policy";
import { validated,uuidSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import type { Identity } from "@/types/auth";
import { databaseNow,databaseOrderNow } from "@/features/time/clock";
import { localDate,dateValue,dayStart,dateKey } from "@/features/time/dates";
import { localWeek } from "@/features/review/calculation";
import { notify } from "@/features/review/notifications";
import { ownPreorderSchema,staffPreorderSchema,decisionSchema,assignSchema,commissionPolicySchema,listSchema } from "./validation";
import { adjustmentReviewer } from "./access";
import { commission } from "./money";
export async function eligibilityEvidence(tx:Database,employeeId:string,at:Date,expectedId?:string) {
 const records=await tx.auditLog.findMany({where:{employeeId,eventTime:{lte:at},action:{in:["ACCOUNT_SECURITY_CHANGED","EMPLOYEE_ELIGIBILITY_RESET"]}},orderBy:[{eventTime:"desc"},{id:"desc"}],select:{id:true,after:true}});
 const evidence=records.find(r=>r.after && typeof r.after==="object" && !Array.isArray(r.after) && "preorderCommissionEnabled" in r.after);
 if(!evidence || (evidence.after as Record<string,unknown>).preorderCommissionEnabled!==true || expectedId && expectedId!==evidence.id)throw new AppError(409,"ELIGIBILITY_EVIDENCE","A retained eligibility grant valid at the order instant is required.");
 return evidence.id;
}
export async function submitPreorder(identity:Identity|null,input:unknown,staff=false) {
 await securityBoundary(identity,async a=>{if(staff)assertManageCommissions(a);else assertOwnCommission(a);});
 if(!staff)throw new AppError(403,"READ_ONLY","Recorded amounts are managed by authorized staff. Submit a recheck instead.");
 const staffValue=staff?validated(staffPreorderSchema,input):undefined,v=staffValue??validated(ownPreorderSchema,input);
 try{return await authorizedMutation(identity,async(actor,tx)=>{
  if(staff)assertManageCommissions(actor);else assertOwnCommission(actor);
  const employeeId=staffValue?.employeeId??actor.employeeId!,settings=await tx.organizationSettings.findUniqueOrThrow({where:{id:1}});
  await tx.$queryRaw`SELECT id FROM employees WHERE id=${employeeId}::uuid FOR UPDATE`;
  if(!await tx.employee.findFirst({where:{id:employeeId,preorderCommissionEnabled:true},select:{id:true}}))throw new AppError(404,"NOT_FOUND","Eligible record not found.");
  const now=staff?await databaseNow(tx):await databaseOrderNow(tx),at=staffValue?new Date(staffValue.orderAt):now;if(at>now || staff && at.getMilliseconds())throw new AppError(400,"ORDER_TIME","Historical order time must be a past or current whole-second instant.");
  const date=localDate(at,settings.timezone),stint=await tx.employmentPeriod.findFirst({where:{employeeId,startDate:{lte:dateValue(date)},OR:[{endDate:null},{endDate:{gt:dateValue(date)}}]}});if(!stint)throw new AppError(404,"NOT_FOUND","Employment coverage not found.");
  const evidence=await eligibilityEvidence(tx,employeeId,at,staffValue?.eligibilityEvidenceId);
  const type=staffValue?.commissionType??settings.commissionRuleType,value=staffValue?.commissionValue??settings.commissionRuleValue.toString(),orderValue=v.orderValue||null;
  if(type==="PERCENT" && (orderValue===null || Number(value)>100))throw new AppError(400,"COMMISSION_RULE","Percentage commission requires an order value and a rate from zero through 100.");
  const old=staffValue?.id?await tx.preorder.findFirst({where:{id:staffValue!.id,employeeId}}):null;if(staffValue?.id && !old)throw new AppError(404,"NOT_FOUND","Pre-order not found.");
  if(old && (old.includedSalaryCalculationId || old.includedWeeklyStatementId || old.revision!==staffValue?.revision))throw new AppError(409,"STALE","Included pre-orders are immutable; refresh other proposals before editing.");
  const data={reference:v.reference,orderAt:at,orderValue,currency:settings.currency,commissionType:type,commissionValue:value,policyVersion:settings.rulesVersion,commissionAmount:commission(type,value,orderValue),eligibilityEvidenceId:evidence,reason:v.reason,status:"PENDING",approvedBy:null,approvedAt:null,reviewComment:null};
  if(old && old.employmentPeriodId!==stint.id)throw new AppError(400,"EMPLOYMENT_COVERAGE","A pre-order cannot move to another employment stint.");
  const row=old?await tx.preorder.update({where:{id:old.id},data:{...data,revision:{increment:1}}}):await tx.preorder.create({data:{...data,employeeId,employmentPeriodId:stint.id,createdBy:actor.userId}});
  await audit({actorUserId:actor.userId,employeeId,action:old?"PREORDER_CHANGED":"PREORDER_CREATED",entity:"preorders",entityId:row.id,reason:v.reason,...(old?{before:{reference:old.reference,commissionAmount:old.commissionAmount.toFixed(2),status:old.status,revision:old.revision}}:{}),after:{reference:row.reference,commissionAmount:row.commissionAmount.toFixed(2),status:row.status,eligibilityEvidenceId:evidence,revision:row.revision}},tx);
  await notify(tx,employeeId,"STAFF_COMMISSION_PENDING","preorders",row.id,`commission-pending:${row.id}:${row.revision}`,"A pre-order claim needs authorized verification.",true);return row.id;
 });}catch(error){if(typeof error==="object" && error && "code" in error && error.code==="P2002")throw new AppError(409,"DUPLICATE_REFERENCE","This reference is already recorded, including cancelled claims.");throw error;}
}
export async function decidePreorder(identity:Identity|null,input:unknown) {
 await securityBoundary(identity,async a=>assertManageCommissions(a));const v=validated(decisionSchema,input);
 return authorizedMutation(identity,async(actor,tx)=>{
  assertManageCommissions(actor);const row=await tx.preorder.findUnique({where:{id:v.id}});if(!row)throw new AppError(404,"NOT_FOUND","Pre-order not found.");
  adjustmentReviewer(actor,row.employeeId,true);
  if(row.status!=="PENDING" || row.revision!==v.revision)throw new AppError(409,"STALE","Refresh this pending pre-order before reviewing.");
  await eligibilityEvidence(tx,row.employeeId,row.orderAt,row.eligibilityEvidenceId);
  const now=await databaseNow(tx);await tx.preorder.update({where:{id:row.id},data:{status:v.decision,approvedBy:actor.userId,approvedAt:now,reviewComment:v.comment,revision:{increment:1}}});
  await audit({actorUserId:actor.userId,employeeId:row.employeeId,action:`COMMISSION_${v.decision}`,entity:"preorders",entityId:row.id,reason:v.comment,before:{status:row.status,revision:row.revision},after:{status:v.decision,commissionAmount:row.commissionAmount.toFixed(2),revision:row.revision+1}},tx);
  await notify(tx,row.employeeId,"COMMISSION_DECIDED","preorders",row.id,`commission-decision:${row.id}:${row.revision+1}`,`Your pre-order claim was ${v.decision.toLowerCase()}.`);
  await tx.employeeActivity.create({data:{employeeId:row.employeeId,createdBy:actor.userId,type:"COMMISSION_DECIDED",title:"Pre-order claim reviewed",description:"",sourceType:"preorders",sourceId:row.id,eventKey:`commission-decision:${row.id}:${row.revision+1}`,eventTime:now,employeeVisible:true,commissionRestricted:true}});
 });
}
export async function assignPreorder(identity:Identity|null,input:unknown) {
 await securityBoundary(identity,async a=>assertManageCommissions(a));const v=validated(assignSchema,input);
 return authorizedMutation(identity,async(actor,tx)=>{
  assertManageCommissions(actor);const row=await tx.preorder.findUnique({where:{id:v.id}}),p=await tx.salaryPeriod.findUnique({where:{id:v.periodId}});
  if(!row || !p)throw new AppError(404,"NOT_FOUND","Pre-order or salary period not found.");
  if(!["PENDING","APPROVED"].includes(row.status) || row.revision!==v.revision || p.status==="FINALIZED")throw new AppError(409,"STALE","Assign a current unincluded claim to an open month.");
  if(row.orderAt>=dayStart(dateKey(p.endDate),p.timezoneSnapshot) || row.currency!==p.currency)throw new AppError(400,"ASSIGNMENT_DATE","The target month must include or follow the earned order date and use its currency.");
  await tx.preorder.update({where:{id:row.id},data:{salaryPeriodId:p.id,revision:{increment:1}}});
  await audit({actorUserId:actor.userId,employeeId:row.employeeId,action:"COMMISSION_ASSIGNED",entity:"preorders",entityId:row.id,reason:v.reason,before:{periodId:row.salaryPeriodId},after:{periodId:p.id,revision:row.revision+1}},tx);
 });
}
export async function withdrawPreorder(identity:Identity|null,idInput:unknown,staff=false) {
 await securityBoundary(identity,async a=>{if(staff)assertManageCommissions(a);else assertOwnCommission(a);});
 if(!staff)throw new AppError(403,"READ_ONLY","Recorded amounts are managed by authorized staff. Submit a recheck instead.");
 const id=validated(uuidSchema,idInput);return authorizedMutation(identity,async(a,tx)=>{
  assertManageCommissions(a);const row=await tx.preorder.findUnique({where:{id}});if(!row)throw new AppError(404,"NOT_FOUND","Record not found.");adjustmentReviewer(a,row.employeeId,true);
  if(row.status==="CANCELLED")return;if(row.includedWeeklyStatementId || row.includedSalaryCalculationId || !["PENDING","APPROVED"].includes(row.status))throw new AppError(409,"IMMUTABLE","Use a controlled correction for an included claim.");
  await tx.preorder.update({where:{id},data:{status:"CANCELLED",revision:{increment:1}}});await audit({actorUserId:a.userId,employeeId:row.employeeId,action:"COMMISSION_CANCELLED",entity:"preorders",entityId:id,before:{status:row.status},after:{status:"CANCELLED",commissionRelated:true}},tx);
 });
}
export async function commissionData(identity:Identity|null,query:unknown={},staff=false) {
 return securityBoundary(identity,async actor=>{
  if(staff)assertManageCommissions(actor);else assertOwnCommission(actor);const v=validated(listSchema,query);
  const rows=await db.preorder.findMany({where:{...(staff?{}:{employeeId:actor.employeeId!}),...(v.id?{id:v.id}:{}),...(v.status?{status:v.status}:{})},orderBy:[{createdAt:"desc"},{id:"desc"}],skip:(v.page-1)*25,take:26,select:{id:true,employeeId:true,reference:true,orderAt:true,orderValue:true,currency:true,commissionType:true,commissionValue:true,commissionAmount:true,status:true,salaryPeriodId:true,reviewComment:true,approvedAt:true,approvedBy:true,createdBy:true,createdAt:true,includedWeeklyStatementId:true,includedAt:true,revision:true,reason:true,...(staff?{eligibilityEvidenceId:true}:{})}});
  if(v.id && !rows.length)throw new AppError(404,"NOT_FOUND","Pre-order not found.");
  const settings=await db.organizationSettings.findUniqueOrThrow({where:{id:1},select:{commissionRuleType:true,commissionRuleValue:true,timezone:true,currency:true,weekStartDay:true}});
  return {records:await Promise.all(rows.slice(0,25).map(async r=>({...r,earningWeek:localWeek(localDate(r.orderAt,settings.timezone),settings.weekStartDay),...(!staff?{reason:undefined,reviewComment:undefined}:{}),orderValue:r.orderValue?.toString()??null,commissionValue:r.commissionValue.toString(),commissionAmount:r.commissionAmount.toFixed(2),employee:staff?await db.employee.findUniqueOrThrow({where:{id:r.employeeId},select:{legalName:true}}):null}))),page:v.page,hasNext:rows.length>25,rule:{type:settings.commissionRuleType,value:settings.commissionRuleValue.toString(),currency:settings.currency},timezone:settings.timezone,isAdmin:actor.role==="ADMIN",
   periods:staff?await db.salaryPeriod.findMany({where:{status:{not:"FINALIZED"}},orderBy:{startDate:"desc"},take:100,select:{id:true,startDate:true,endDate:true}}):[]};
 });
}
export async function updateCommissionPolicy(identity:Identity|null,input:unknown) {
 await securityBoundary(identity,async a=>assertRole(a,["ADMIN"]));const v=validated(commissionPolicySchema,input);
 return authorizedMutation(identity,async(actor,tx)=>{assertRole(actor,["ADMIN"]);const old=await tx.organizationSettings.findUniqueOrThrow({where:{id:1}});await tx.organizationSettings.update({where:{id:1},data:{commissionRuleType:v.type,commissionRuleValue:v.value,rulesVersion:{increment:1},changedBy:actor.userId}});await audit({actorUserId:actor.userId,action:"COMMISSION_POLICY_CHANGED",entity:"organization_settings",entityId:"1",reason:v.reason,before:{type:old.commissionRuleType,value:old.commissionRuleValue.toString()},after:{type:v.type,value:v.value}},tx);});
}
export async function commissionOptions(identity:Identity|null) {
 return securityBoundary(identity,async actor=>{
  assertManageCommissions(actor);
  const eligible=await db.employee.findMany({where:{preorderCommissionEnabled:true},select:{id:true}});
  const grants=await db.auditLog.findMany({where:{employeeId:{in:eligible.map(e=>e.id)},action:"ACCOUNT_SECURITY_CHANGED",after:{path:["preorderCommissionEnabled"],equals:true}},orderBy:{eventTime:"desc"},take:200,select:{id:true,employeeId:true,eventTime:true}});
  return {isAdmin:actor.role==="ADMIN",grants:await Promise.all(grants.filter(g=>g.employeeId).map(async g=>({...g,employee:await db.employee.findUniqueOrThrow({where:{id:g.employeeId!},select:{legalName:true}})})))};
 });
}
