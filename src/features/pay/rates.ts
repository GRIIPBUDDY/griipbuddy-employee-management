import "server-only";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/db/audit";
import { securityBoundary } from "@/lib/authorization/actor";
import { authorizedMutation } from "@/lib/db/mutation";
import { validated,uuidSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import type { Identity } from "@/types/auth";
import { dateKey,dateValue } from "@/features/time/dates";
import { databaseNow } from "@/features/time/clock";
import { rateSchema } from "./validation";
import { payStaff } from "./access";
import { timeEvent } from "@/features/time/schedules";
export async function publishRate(identity:Identity|null,input:unknown) {
 await securityBoundary(identity,async actor=>payStaff(actor));const v=validated(rateSchema,input);
 return authorizedMutation(identity,async(actor,tx)=>{
  payStaff(actor);await tx.$queryRaw`SELECT id FROM employees WHERE id=${v.employeeId}::uuid FOR UPDATE`;
  const stint=await tx.employmentPeriod.findFirst({where:{id:v.employmentPeriodId,employeeId:v.employeeId}});if(!stint)throw new AppError(404,"NOT_FOUND","Employment record not found.");
  const from=dateValue(v.effectiveFrom),until=v.effectiveUntil?dateValue(v.effectiveUntil):null;
  if(from<stint.startDate || stint.endDate && (!until || until>stint.endDate))throw new AppError(400,"RATE_DATES","Compensation must fit the selected employment stint.");
  const now=await databaseNow(tx),settings=await tx.organizationSettings.findUniqueOrThrow({where:{id:1}});
  const old=v.baseRateId?await tx.compensationRate.findFirst({where:{id:v.baseRateId,employeeId:v.employeeId,employmentPeriodId:stint.id,supersededAt:null}}):null;
  if(v.baseRateId && !old)throw new AppError(404,"NOT_FOUND","Current compensation rate not found.");
  if(old && (old.revision!==v.revision || from<old.effectiveFrom || old.effectiveUntil && (!until || until>old.effectiveUntil)))throw new AppError(409,"STALE","Replace a range inside the current rate and refresh its revision.");
  if(!old && await tx.compensationRate.count({where:{employeeId:v.employeeId,supersededAt:null,effectiveFrom:until?{lt:until}:undefined,OR:[{effectiveUntil:null},{effectiveUntil:{gt:from}}]}}))throw new AppError(409,"RATE_OVERLAP","Select the current rate to replace its effective interval.");
  if(old){
   await tx.compensationRate.update({where:{id:old.id},data:{supersededAt:now,revision:{increment:1}}});
   const retained={employeeId:old.employeeId,employmentPeriodId:old.employmentPeriodId,payType:old.payType,baseAmount:old.baseAmount,currency:old.currency,overtimeHourlyEquivalent:old.overtimeHourlyEquivalent,overtimeMultiplier:old.overtimeMultiplier,changeReason:v.reason,createdBy:actor.userId};
   if(old.effectiveFrom<from)await tx.compensationRate.create({data:{...retained,effectiveFrom:old.effectiveFrom,effectiveUntil:from}});
   if(until && (!old.effectiveUntil || until<old.effectiveUntil))await tx.compensationRate.create({data:{...retained,effectiveFrom:until,effectiveUntil:old.effectiveUntil}});
  }
  const row=await tx.compensationRate.create({data:{employeeId:v.employeeId,employmentPeriodId:stint.id,effectiveFrom:from,effectiveUntil:until,payType:v.payType,baseAmount:v.baseAmount,currency:settings.currency,overtimeHourlyEquivalent:v.payType==="HOURLY"?null:v.overtimeHourlyEquivalent||null,overtimeMultiplier:v.overtimeMultiplier,changeReason:v.reason,createdBy:actor.userId}});
  await audit({actorUserId:actor.userId,employeeId:v.employeeId,action:old?"COMPENSATION_CHANGED":"COMPENSATION_CREATED",entity:"compensation_rates",entityId:row.id,reason:v.reason,...(old?{before:{id:old.id,baseAmount:old.baseAmount.toString(),payType:old.payType,effectiveFrom:dateKey(old.effectiveFrom)}}:{}),after:{baseAmount:v.baseAmount,payType:v.payType,effectiveFrom:v.effectiveFrom,effectiveUntil:v.effectiveUntil||null,overtimeHourlyEquivalent:v.overtimeHourlyEquivalent||null,overtimeMultiplier:v.overtimeMultiplier}},tx);
  await timeEvent(tx,v.employeeId,actor.userId,now,"COMPENSATION_CHANGED","Compensation terms updated","compensation_rates",row.id);return row.id;
 });
}
export async function rateHistory(identity:Identity|null,employeeIdInput:unknown,own=false) {
 return securityBoundary(identity,async actor=>{
  if(!own)payStaff(actor);const employeeId=validated(uuidSchema,employeeIdInput);if(own && actor.employeeId!==employeeId)throw new AppError(404,"NOT_FOUND","Compensation not found.");
  const employee=await db.employee.findUnique({where:{id:employeeId},select:{id:true,legalName:true,employeeNumber:true}});if(!employee)throw new AppError(404,"NOT_FOUND","Compensation not found.");
  const rows=await db.compensationRate.findMany({where:{employeeId},orderBy:[{effectiveFrom:"desc"},{createdAt:"desc"}],take:100,select:{id:true,employmentPeriodId:true,effectiveFrom:true,effectiveUntil:true,supersededAt:true,payType:true,baseAmount:true,currency:true,overtimeHourlyEquivalent:true,overtimeMultiplier:true,revision:true,...(!own?{changeReason:true}:{})}});
  return {employee,rates:rows.map(r=>({...r,baseAmount:r.baseAmount.toString(),overtimeHourlyEquivalent:r.overtimeHourlyEquivalent?.toString()??null,overtimeMultiplier:r.overtimeMultiplier.toString()})),stints:await db.employmentPeriod.findMany({where:{employeeId},orderBy:{startDate:"desc"},select:{id:true,startDate:true,endDate:true}})};
 });
}
