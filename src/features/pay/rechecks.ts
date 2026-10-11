import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { authorizedMutation } from "@/lib/db/mutation";
import { audit } from "@/lib/db/audit";
import { securityBoundary } from "@/lib/authorization/actor";
import { assertOwnCommission, assertManageCommissions } from "@/lib/authorization/policy";
import { validated, uuidSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import type { Identity } from "@/types/auth";
import { databaseNow } from "@/features/time/clock";
import { notify } from "@/features/review/notifications";
import { adjustmentReviewer } from "./access";
import { decimal, money } from "./money";
const requestSchema=z.object({preorderId:uuidSchema,reason:z.string().trim().min(1).max(500),explanation:z.string().trim().max(2000).default(""),operationKey:uuidSchema}).strict();
const resolveSchema=z.object({id:uuidSchema,revision:z.number().int().positive(),decision:z.enum(["REJECTED","CONFIRMED","CORRECTED"]),comment:z.string().trim().min(1).max(500),amount:z.string().regex(/^\d{1,12}(\.\d{1,2})?$/).optional(),correctionAdjustmentId:uuidSchema.optional()}).strict();
export async function requestCommissionRecheck(identity:Identity|null,input:unknown){
 await securityBoundary(identity,a=>{assertOwnCommission(a);return Promise.resolve();});const v=validated(requestSchema,input);
 return authorizedMutation(identity,async(a,tx)=>{
  assertOwnCommission(a);const order=await tx.preorder.findFirst({where:{id:v.preorderId,employeeId:a.employeeId!}});if(!order)throw new AppError(404,"NOT_FOUND","Record not found.");
  const old=await tx.commissionRecheck.findUnique({where:{operationKey:v.operationKey}});
  if(old){if(old.employeeId!==a.employeeId || old.preorderId!==v.preorderId || old.reason!==v.reason || old.explanation!==v.explanation)throw new AppError(409,"OPERATION_REUSED","Request key already used.");return old.id;}
  if(await tx.commissionRecheck.findFirst({where:{preorderId:order.id,status:"PENDING"}}))throw new AppError(409,"PENDING_RECHECK","This record already has a pending recheck.");
  const r=await tx.commissionRecheck.create({data:{...v,employeeId:a.employeeId!,requestedBy:a.userId}});
  await audit({actorUserId:a.userId,employeeId:a.employeeId!,action:"COMMISSION_RECHECK_REQUESTED",entity:"preorders",entityId:order.id,reason:v.reason,after:{recheckId:r.id,commissionRelated:true}},tx);
  await notify(tx,a.employeeId!,"STAFF_COMMISSION_RECHECK","preorders",order.id,`recheck:${r.id}`,"A recorded amount needs authorized review.",true);return r.id;
 });
}
export async function resolveCommissionRecheck(identity:Identity|null,input:unknown){
 await securityBoundary(identity,a=>{assertManageCommissions(a);return Promise.resolve();});const v=validated(resolveSchema,input);
 return authorizedMutation(identity,async(a,tx)=>{
  assertManageCommissions(a);const r=await tx.commissionRecheck.findUnique({where:{id:v.id}});if(!r)throw new AppError(404,"NOT_FOUND","Record not found.");adjustmentReviewer(a,r.employeeId,true);
  if(r.status!=="PENDING" || r.revision!==v.revision)throw new AppError(409,"STALE","Refresh this pending request.");
  const order=await tx.preorder.findUniqueOrThrow({where:{id:r.preorderId}}),now=await databaseNow(tx);let correctionAdjustmentId:string|null=null;
  if(v.decision==="CORRECTED"){
   if(v.amount===undefined)throw new AppError(400,"AMOUNT","Enter the corrected amount.");
   if(order.includedSalaryCalculationId || order.includedWeeklyStatementId){
    const adjustment=v.correctionAdjustmentId?await tx.salaryAdjustment.findFirst({where:{id:v.correctionAdjustmentId,employeeId:r.employeeId,status:"APPROVED",commissionRelated:true,includedSalaryCalculationId:null,includedWeeklyStatementId:null}}):null;
    if(!adjustment || (order.includedSalaryCalculationId?adjustment.correctsSalaryCalculationId!==order.includedSalaryCalculationId:adjustment.correctsWeeklyStatementId!==order.includedWeeklyStatementId) || !decimal(adjustment.amount).equals(decimal(v.amount).minus(order.commissionAmount)))throw new AppError(409,"CONTROLLED_CORRECTION","Create and approve a later-period correction linked to this frozen statement and its exact difference first.");
    correctionAdjustmentId=adjustment.id;
   }else{
    await tx.preorder.update({where:{id:order.id},data:{commissionType:"FIXED",commissionValue:v.amount,commissionAmount:money(v.amount),status:"APPROVED",approvedBy:a.userId,approvedAt:now,reviewComment:v.comment,revision:{increment:1}}});
   }
  }
  await tx.commissionRecheck.update({where:{id:r.id},data:{status:v.decision,reviewedBy:a.userId,reviewComment:v.comment,resolvedAt:now,correctionAdjustmentId,revision:{increment:1}}});
  await audit({actorUserId:a.userId,employeeId:r.employeeId,action:`COMMISSION_RECHECK_${v.decision}`,entity:"preorders",entityId:order.id,reason:v.comment,before:{amount:order.commissionAmount.toFixed(2)},after:{recheckId:r.id,amount:v.amount??order.commissionAmount.toFixed(2),correctionAdjustmentId,commissionRelated:true}},tx);
  await notify(tx,r.employeeId,"COMMISSION_RECHECK_RESOLVED","preorders",order.id,`recheck-resolved:${r.id}`,"Your recheck request has been reviewed.");
 });
}
export async function commissionRechecks(identity:Identity|null,staff=false){return securityBoundary(identity,async a=>{
 if(staff)assertManageCommissions(a);else assertOwnCommission(a);
 const rows=await db.commissionRecheck.findMany({where:staff?{}:{employeeId:a.employeeId!},orderBy:{createdAt:"desc"},take:100,select:{id:true,preorderId:true,employeeId:true,reason:true,explanation:true,status:true,createdAt:true,reviewedBy:true,reviewComment:true,resolvedAt:true,revision:true,correctionAdjustmentId:true}});return rows;
});}
