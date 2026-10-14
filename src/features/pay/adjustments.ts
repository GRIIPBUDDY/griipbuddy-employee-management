import "server-only";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/db/audit";
import { authorizedMutation } from "@/lib/db/mutation";
import { securityBoundary } from "@/lib/authorization/actor";
import { validated,uuidSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import type { Identity } from "@/types/auth";
import { dateKey,dateValue,addDays } from "@/features/time/dates";
import { localWeek } from "@/features/review/calculation";
import { databaseNow } from "@/features/time/clock";
import { adjustmentSchema,decisionSchema,listSchema,editAdjustmentSchema } from "./validation";
import { payStaff,adjustmentReviewer,canCommissionStaff } from "./access";
import { openPeriod } from "./periods";
import { money } from "./money";
import { verifyReconciliation } from "./reconciliation";
export async function createAdjustment(identity:Identity|null,input:unknown) {
 await securityBoundary(identity,async a=>payStaff(a));const v=validated(adjustmentSchema,input);
 return authorizedMutation(identity,async(actor,tx)=>{
  payStaff(actor);const period=await openPeriod(tx,v.periodId);
  if(v.earningWeekDate){const settings=await tx.organizationSettings.findUniqueOrThrow({where:{id:1}});if(period.calculationMethod!=="WEEKLY_ATTENDANCE" || localWeek(v.earningWeekDate,settings.weekStartDay)!==v.earningWeekDate || v.earningWeekDate>=dateKey(period.endDate) || addDays(v.earningWeekDate,7)<=dateKey(period.startDate))throw new AppError(400,"EARNING_WEEK","Choose an organization workweek overlapping this weekly-ledger month.");if(await tx.weeklyEarningStatement.count({where:{employeeId:v.employeeId,weekStartDate:dateValue(v.earningWeekDate),status:"FINALIZED"}}))throw new AppError(409,"FROZEN_WEEK","Use a controlled correction for finalized weekly earnings.");}
  if(!await tx.employee.findUnique({where:{id:v.employeeId},select:{id:true}}))throw new AppError(404,"NOT_FOUND","Employee not found.");
  // The list item labels the adjustment; its kind keeps the payroll arithmetic fixed (bonus, deduction, other).
  const category=await tx.optionItem.findUnique({where:{list_code:{list:"ADJUSTMENT_CATEGORY",code:v.type}}});if(!category?.isActive)throw new AppError(400,"OPTION_INVALID","Choose an available adjustment type.");
  const kind=(category.attributes as {kind?:string}).kind,type=kind==="BONUS"||kind==="DEDUCTION"?kind:"OTHER";if(type!=="OTHER" && v.amount.startsWith("-"))throw new AppError(400,"AMOUNT_SIGN","Bonuses, allowances and deductions use nonnegative amounts.");
  const amount=money(v.amount),old=await tx.salaryAdjustment.findUnique({where:{operationKey:v.operationKey,...(v.earningWeekDate?{earningWeekDate:dateValue(v.earningWeekDate)}:{})}});
  if(old){if(old.employeeId!==v.employeeId || old.salaryPeriodId!==v.periodId || old.type!==type || (old.category??old.type)!==category.code || old.amount.toFixed(2)!==amount || old.reason!==v.reason || (old.earningWeekDate?dateKey(old.earningWeekDate):undefined)!==v.earningWeekDate)throw new AppError(409,"OPERATION_REUSED","This request key belongs to a different proposal.");return old.id;}
  const row=await tx.salaryAdjustment.create({data:{employeeId:v.employeeId,salaryPeriodId:v.periodId,type,category:category.code,amount,reason:v.reason,createdBy:actor.userId,operationKey:v.operationKey}});
  await audit({actorUserId:actor.userId,employeeId:row.employeeId,action:"SALARY_ADJUSTMENT_CREATED",entity:"salary_adjustments",entityId:row.id,reason:v.reason,after:{type,category:category.code,amount,periodId:v.periodId}},tx);return row.id;
 });
}
export async function decideAdjustment(identity:Identity|null,input:unknown) {
 await securityBoundary(identity,async a=>payStaff(a));const v=validated(decisionSchema,input);
 return authorizedMutation(identity,async(actor,tx)=>{
  const row=await tx.salaryAdjustment.findUnique({where:{id:v.id}});if(!row)throw new AppError(404,"NOT_FOUND","Adjustment not found.");adjustmentReviewer(actor,row.employeeId,row.commissionRelated);await openPeriod(tx,row.salaryPeriodId);
  if(row.status!=="PENDING" || row.revision!==v.revision || row.includedSalaryCalculationId)throw new AppError(409,"STALE","Refresh this pending adjustment before review.");
  if(v.decision==="APPROVED" && row.correctsSalaryCalculationId)await verifyReconciliation(tx,row,await databaseNow(tx));
  const now=await databaseNow(tx);await tx.salaryAdjustment.update({where:{id:row.id},data:{status:v.decision,approvedBy:actor.userId,approvedAt:now,reviewComment:v.comment,revision:{increment:1}}});
  await audit({actorUserId:actor.userId,employeeId:row.employeeId,action:`SALARY_ADJUSTMENT_${v.decision}`,entity:"salary_adjustments",entityId:row.id,reason:v.comment,before:{status:row.status,revision:row.revision},after:{status:v.decision,amount:row.amount.toFixed(2),revision:row.revision+1}},tx);
 });
}
export async function adjustmentData(identity:Identity|null,query:unknown={}) {
 return securityBoundary(identity,async actor=>{
  payStaff(actor);const v=validated(listSchema,query),rows=await db.salaryAdjustment.findMany({where:{...(!canCommissionStaff(actor)?{commissionRelated:false}:{}),...(v.id?{id:v.id}:{}),...(v.status?{status:v.status}:{})},orderBy:{createdAt:"desc"},skip:(v.page-1)*25,take:26,select:{id:true,employeeId:true,salaryPeriodId:true,type:true,category:true,amount:true,reason:true,status:true,commissionRelated:true,correctsSalaryCalculationId:true,reconciliationSnapshot:true,operationKey:true,revision:true,includedSalaryCalculationId:true,includedWeeklyStatementId:true,correctsWeeklyStatementId:true,earningWeekDate:true,reviewComment:true}});
  if(v.id && !rows.length)throw new AppError(404,"NOT_FOUND","Adjustment not found.");
  return {records:await Promise.all(rows.slice(0,25).map(async r=>({...r,salaryPeriod:await db.salaryPeriod.findUniqueOrThrow({where:{id:r.salaryPeriodId},select:{currency:true}}),amount:r.amount.toFixed(2),employee:await db.employee.findUniqueOrThrow({where:{id:r.employeeId},select:{legalName:true}}),commissionSources:r.correctsSalaryCalculationId && r.commissionRelated?await db.preorder.findMany({where:{includedSalaryCalculationId:r.correctsSalaryCalculationId},select:{id:true,reference:true}}):[],canDecide:actor.role!=="HR_MANAGER" || actor.employeeId!==r.employeeId}))),page:v.page,hasNext:rows.length>25};
 });
}
export async function adjustmentOptions(identity:Identity|null,periodInput:unknown) {
 return securityBoundary(identity,async actor=>{payStaff(actor);const id=validated(uuidSchema,periodInput);const p=await db.salaryPeriod.findUnique({where:{id}});if(!p)throw new AppError(404,"NOT_FOUND","Salary period not found.");return {id:p.id,currency:p.currency,finalized:p.status==="FINALIZED",employees:await db.employee.findMany({orderBy:{legalName:"asc"},take:200,select:{id:true,legalName:true}})};});
}

export async function editAdjustment(identity:Identity|null,input:unknown) {
 await securityBoundary(identity,async actor=>payStaff(actor));const v=validated(editAdjustmentSchema,input);
 return authorizedMutation(identity,async(actor,tx)=>{
  const row=await tx.salaryAdjustment.findUnique({where:{id:v.id}});if(!row)throw new AppError(404,"NOT_FOUND","Adjustment not found.");payStaff(actor,row.commissionRelated);await openPeriod(tx,row.salaryPeriodId);
  if(row.includedSalaryCalculationId || row.includedWeeklyStatementId || row.correctsWeeklyStatementId || row.correctsSalaryCalculationId || row.revision!==v.revision)throw new AppError(409,"STALE","Refresh unincluded manual adjustments. Historical corrections must be recomputed.");
  if(["BONUS","DEDUCTION"].includes(row.type) && v.amount.startsWith("-"))throw new AppError(400,"AMOUNT_SIGN","Bonus and deduction proposals must be nonnegative.");
  await tx.salaryAdjustment.update({where:{id:row.id},data:{amount:money(v.amount),reason:v.reason,status:"PENDING",approvedBy:null,approvedAt:null,reviewComment:null,revision:{increment:1}}});
  await audit({actorUserId:actor.userId,employeeId:row.employeeId,action:"SALARY_ADJUSTMENT_CHANGED",entity:"salary_adjustments",entityId:row.id,reason:v.reason,before:{amount:row.amount.toFixed(2),status:row.status,revision:row.revision},after:{amount:money(v.amount),status:"PENDING",revision:row.revision+1}},tx);
 });
}
