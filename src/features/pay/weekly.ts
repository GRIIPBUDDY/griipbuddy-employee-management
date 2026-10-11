import "server-only";
import { createHash } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit,type Database } from "@/lib/db/audit";
import { authorizedMutation } from "@/lib/db/mutation";
import { securityBoundary } from "@/lib/authorization/actor";
import { validated,uuidSchema,dateSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import type { Actor,Identity } from "@/types/auth";
import type { SalaryPeriod,Prisma } from "@/generated/prisma/client";
import { databaseNow } from "@/features/time/clock";
import { dateKey,dateValue,addDays,localDate,dayStart } from "@/features/time/dates";
import { localWeek,seconds } from "@/features/review/calculation";
import { weekCalculation } from "@/features/review/summary";
import { notify } from "@/features/review/notifications";
import { payStaff,adjustmentReviewer,canCommissionStaff } from "./access";
import { captureEmployee } from "./capture";
import { calculatePay,type PayInput } from "./engine";
import { decimal,money } from "./money";
const json=(v:unknown)=>JSON.parse(JSON.stringify(v)) as Prisma.InputJsonObject;
export const amountKeys=["baseAmount","overtimeAmount","commissionAmount","bonusAmount","deductionAmount","otherAmount"] as const;
export type Amounts=Record<typeof amountKeys[number],string> & {finalAmount:string};
export const zero=():Amounts=>({baseAmount:"0.00",overtimeAmount:"0.00",commissionAmount:"0.00",bonusAmount:"0.00",deductionAmount:"0.00",otherAmount:"0.00",finalAmount:"0.00"});
export function total(v:Omit<Amounts,"finalAmount">){return money(decimal(v.baseAmount).plus(v.overtimeAmount).plus(v.commissionAmount).plus(v.bonusAmount).plus(v.otherAmount).minus(v.deductionAmount));}
const calculateSchema=z.object({employeeId:uuidSchema,week:dateSchema,revision:z.number().int().positive().optional()}).strict();
const transitionSchema=z.object({id:uuidSchema,revision:z.number().int().positive(),status:z.enum(["REVIEWED","FINALIZED"])}).strict();
async function monthPeriod(tx:Database,actor:Actor,month:string){
 let p=await tx.salaryPeriod.findUnique({where:{startDate:dateValue(month)}});if(p)return p;
 const settings=await tx.organizationSettings.findUniqueOrThrow({where:{id:1}});
 p=await tx.salaryPeriod.create({data:{startDate:dateValue(month),endDate:dateValue(Temporal.PlainDate.from(month).add({months:1}).toString()),timezoneSnapshot:settings.timezone,currency:settings.currency,calculationMethod:"WEEKLY_ATTENDANCE",createdBy:actor.userId}});
 await audit({actorUserId:actor.userId,action:"SALARY_PERIOD_CREATED",entity:"salary_periods",entityId:p.id,after:{method:p.calculationMethod,from:month}},tx);return p;
}
export async function weeklyCapture(tx:Database,actor:Actor,employeeId:string,week:string,now:Date){
 const settings=await tx.organizationSettings.findUniqueOrThrow({where:{id:1}}),until=addDays(week,7),current=await weekCalculation(tx,employeeId,week,now);
 if(!await tx.employee.findUnique({where:{id:employeeId},select:{id:true}}))throw new AppError(404,"NOT_FOUND","Employee not found.");
 if(week!==localWeek(week,settings.weekStartDay))throw new AppError(400,"WEEK","Choose an organization-local week start.");
 if(week<localWeek(dateKey(settings.earningsEffectiveFrom),settings.weekStartDay))throw new AppError(409,"LEGACY_PERIOD","Weekly statements start at the new formula's effective month.");
 const components:Record<string,Amounts>={},inputs:PayInput[]=[],commissions:PayInput["commissions"]=[],adjustments:PayInput["adjustments"]=[],blockers=[...current.blockers,...(!current.ended?["Week has not ended"]:[])];
 for(let month=week.slice(0,7)+"-01";month<until;month=Temporal.PlainDate.from(month).add({months:1}).toString()){
  // Boundary portions before cutover stay in the legacy month; never claim them twice.
  if(month<dateKey(settings.earningsEffectiveFrom))continue;
  const p=await monthPeriod(tx,actor,month);if(p.calculationMethod!=="WEEKLY_ATTENDANCE" || p.status==="FINALIZED")throw new AppError(409,"MONTH_CLOSED","Weekly calculation requires an open month using the attendance formula.");
  if(p.currency!==settings.currency)throw new AppError(409,"CURRENCY_MISMATCH","Weekly earnings must use the monthly period currency. No currency conversion is available.");
  const input=await captureEmployee(tx,p,employeeId,now),output=calculatePay(input),part=zero(),key=month.slice(0,7);inputs.push(input);
  for(const type of ["base","overtime"] as const){let before=decimal(0),through=decimal(0);for(const day of output.calculationSnapshot.segments){const value=decimal(type==="base"?day.baseUnrounded:day.overtimeUnrounded);if(day.date<week)before=before.plus(value);if(day.date<until)through=through.plus(value);}part[type==="base"?"baseAmount":"overtimeAmount"]=money(decimal(money(through)).minus(money(before)));}
  const eligibleCommissions=input.commissions.filter(c=>{const date=localDate(new Date(c.orderAt),p.timezoneSnapshot);return date>=week && date<until;});
  const eligibleAdjustments=await tx.salaryAdjustment.findMany({where:{employeeId,salaryPeriodId:p.id,earningWeekDate:dateValue(week),includedWeeklyStatementId:null,includedSalaryCalculationId:null,status:{in:["PENDING","APPROVED"]}}});
  if(eligibleCommissions.length || eligibleAdjustments.some(a=>a.commissionRelated))payStaff(actor,true);
  part.commissionAmount=money(eligibleCommissions.reduce((a,c)=>a.plus(c.amount),decimal(0)));commissions.push(...eligibleCommissions);
  for(const a of eligibleAdjustments){if(a.status==="PENDING"){blockers.push("Pending weekly adjustment");continue;}const k=a.type==="DEDUCTION"?"deductionAmount":a.type==="BONUS"?"bonusAmount":"otherAmount";part[k]=money(decimal(part[k]).plus(a.amount));adjustments.push({id:a.id,type:a.type,amount:a.amount.toFixed(2),reason:a.reason,revision:a.revision,commissionRelated:a.commissionRelated});}
  const pending=await tx.preorder.count({where:{employeeId,salaryPeriodId:p.id,status:"PENDING",orderAt:{gte:dayStart(week,p.timezoneSnapshot),lt:dayStart(until,p.timezoneSnapshot)}}});if(pending)blockers.push("Pending weekly commission");
  blockers.push(...input.blockers.filter(b=>{const date=b.match(/\d{4}-\d{2}-\d{2}/)?.[0];return date?date>=week && date<until:b.startsWith("Zero planned") && input.days.some(d=>d.date>=week && d.date<until && b.includes(d.rate?.id??"not-a-rate"));}));
  part.finalAmount=total(part);components[key]=part;
 }
 const amounts=zero();for(const part of Object.values(components))for(const k of amountKeys)amounts[k]=money(decimal(amounts[k]).plus(part[k]));amounts.finalAmount=total(amounts);
 const snapshot={formatVersion:1,formulaVersion:"weekly-attendance-v2",employeeId,week,until,timezone:settings.timezone,currency:settings.currency,commissionRelated:commissions.length>0 || adjustments.some(a=>a.commissionRelated),monthlyInputs:inputs.map(i=>({...i,period:{...i.period,inputRevision:0}})),commissions,adjustments,potentialOvertimeSeconds:current.potentialSeconds,approvedOvertimeSeconds:inputs.flatMap(i=>i.days).filter(d=>d.date>=week && d.date<until).reduce((n,d)=>n+seconds(d.approvedOvertime),0),blockers:[...new Set(blockers)]};
 const fingerprint=createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");return {amounts,components,snapshot,fingerprint,settings};
}
export async function calculateWeekly(identity:Identity|null,input:unknown){
 await securityBoundary(identity,async a=>payStaff(a));const v=validated(calculateSchema,input);
 return authorizedMutation(identity,async(a,tx)=>{
  payStaff(a);const old=await tx.weeklyEarningStatement.findUnique({where:{employeeId_weekStartDate:{employeeId:v.employeeId,weekStartDate:dateValue(v.week)}}});
  if(old?.status==="FINALIZED")throw new AppError(409,"FINALIZED","Use a later reviewed correction for a frozen weekly statement.");if(old && v.revision!==old.revision)throw new AppError(409,"STALE","Refresh the weekly statement before recalculation.");
  const captured=await weeklyCapture(tx,a,v.employeeId,v.week,await databaseNow(tx)),data={...captured.amounts,status:"CALCULATED",timezoneSnapshot:captured.settings.timezone,currency:captured.settings.currency,calculationSnapshot:json(captured.snapshot),monthComponents:json(captured.components),sourceFingerprint:captured.fingerprint,calculatedBy:a.userId,reviewedBy:null};
  const row=old?await tx.weeklyEarningStatement.update({where:{id:old.id},data:{...data,revision:{increment:1}}}):await tx.weeklyEarningStatement.create({data:{...data,employeeId:v.employeeId,weekStartDate:dateValue(v.week),weekEndDate:dateValue(addDays(v.week,7))}});
  await audit({actorUserId:a.userId,employeeId:v.employeeId,action:"WEEKLY_EARNINGS_CALCULATED",entity:"weekly_earning_statements",entityId:row.id,after:{week:v.week,finalAmount:row.finalAmount.toFixed(2),commissionRelated:captured.snapshot.commissionRelated,blockers:captured.snapshot.blockers}},tx);await notify(tx,v.employeeId,"STAFF_WEEKLY_EARNINGS_CALCULATED","weekly_earning_statements",row.id,`weekly-calculated:${row.id}:${row.revision}`,"A weekly earning statement needs review.",true);return row.id;
 });
}
export async function transitionWeekly(identity:Identity|null,input:unknown){
 await securityBoundary(identity,async a=>payStaff(a));const v=validated(transitionSchema,input);
 return authorizedMutation(identity,async(a,tx)=>{
  const old=await tx.weeklyEarningStatement.findUnique({where:{id:v.id}});if(!old)throw new AppError(404,"NOT_FOUND","Weekly statement not found.");adjustmentReviewer(a,old.employeeId,(old.calculationSnapshot as {commissionRelated:boolean}).commissionRelated);
  if(old.status===v.status && old.revision===v.revision+1)return old.id;
  if(old.revision!==v.revision || old.status!==(v.status==="REVIEWED"?"CALCULATED":"REVIEWED"))throw new AppError(409,"STALE","Follow calculated → reviewed → finalized using the current revision.");
  const now=await databaseNow(tx),captured=await weeklyCapture(tx,a,old.employeeId,dateKey(old.weekStartDate),now);
  if(captured.fingerprint!==old.sourceFingerprint || captured.snapshot.blockers.length)throw new AppError(409,"WEEKLY_UNRESOLVED","Sources changed or are unresolved. Recalculate the week before review.");if(decimal(old.finalAmount).isNegative())throw new AppError(409,"NEGATIVE_PAY","Resolve deductions before finalization.");
  await tx.weeklyEarningStatement.update({where:{id:old.id},data:{status:v.status,...(v.status==="REVIEWED"?{reviewedBy:a.userId}:{finalizedBy:a.userId,finalizedAt:now}),revision:{increment:1}}});
  if(v.status==="FINALIZED"){
   for(const c of captured.snapshot.commissions){const claimed=await tx.preorder.updateMany({where:{id:c.id,employeeId:old.employeeId,revision:c.revision,status:"APPROVED",includedWeeklyStatementId:null,includedSalaryCalculationId:null},data:{includedWeeklyStatementId:old.id,revision:{increment:1}}});if(claimed.count!==1)throw new AppError(409,"CLAIM_CONFLICT","Commission already claimed or changed.");}
   for(const adjustment of captured.snapshot.adjustments){const claimed=await tx.salaryAdjustment.updateMany({where:{id:adjustment.id,employeeId:old.employeeId,revision:adjustment.revision,status:"APPROVED",includedWeeklyStatementId:null,includedSalaryCalculationId:null},data:{includedWeeklyStatementId:old.id,revision:{increment:1}}});if(claimed.count!==1)throw new AppError(409,"CLAIM_CONFLICT","Adjustment already claimed or changed.");}
   await notify(tx,old.employeeId,"WEEKLY_EARNINGS_FINALIZED","weekly_earning_statements",old.id,`weekly-final:${old.id}`,"Your weekly earning statement is finalized. Monthly payment is recorded separately.");
  }
  await audit({actorUserId:a.userId,employeeId:old.employeeId,action:`WEEKLY_EARNINGS_${v.status}`,entity:"weekly_earning_statements",entityId:old.id,before:{status:old.status},after:{status:v.status,commissionRelated:captured.snapshot.commissionRelated}},tx);return old.id;
 });
}
// Monthly payroll consumes immutable ledger components, never re-runs frozen attendance.
export async function captureWeeklyMonth(tx:Database,p:SalaryPeriod,employeeId:string,now:Date):Promise<PayInput>{
 const from=dateKey(p.startDate),until=dateKey(p.endDate),month=from.slice(0,7),settings=await tx.organizationSettings.findUniqueOrThrow({where:{id:1}}),rows=await tx.weeklyEarningStatement.findMany({where:{employeeId,status:"FINALIZED",weekStartDate:{lt:p.endDate},weekEndDate:{gt:p.startDate}},orderBy:{weekStartDate:"asc"}}),blockers:string[]=[],amounts=zero();
 const stints=await tx.employmentPeriod.findMany({where:{employeeId,startDate:{lt:p.endDate},OR:[{endDate:null},{endDate:{gt:p.startDate}}]}});
 for(let week=localWeek(from,settings.weekStartDay);week<until;week=addDays(week,7))if(stints.some(s=>s.startDate<dateValue(addDays(week,7)) && (!s.endDate || s.endDate>dateValue(week))) && !rows.some(r=>dateKey(r.weekStartDate)===week))blockers.push(`Week ${week} requires a finalized statement`);
 const sources:Record<string,unknown>={weekly:rows.map(r=>({id:r.id,revision:r.revision,week:dateKey(r.weekStartDate),fingerprint:r.sourceFingerprint}))},commissions:PayInput["commissions"]=[],adjustments:PayInput["adjustments"]=[];let restricted=false;
 for(const row of rows){const part=(row.monthComponents as unknown as Record<string,Amounts>)[month];if(!part)continue;if(row.currency!==p.currency)throw new AppError(409,"CURRENCY_MISMATCH","Weekly and monthly earnings must have the same currency.");for(const k of amountKeys)amounts[k]=money(decimal(amounts[k]).plus(part[k]));const snap=row.calculationSnapshot as unknown as {commissionRelated:boolean;commissions:PayInput["commissions"];adjustments:PayInput["adjustments"]};restricted||=snap.commissionRelated;
  for(const c of snap.commissions){const order=await tx.preorder.findUniqueOrThrow({where:{id:c.id}});if(order.salaryPeriodId===p.id)commissions.push({...c,revision:order.revision});}
  for(const a of snap.adjustments){const adjustment=await tx.salaryAdjustment.findUniqueOrThrow({where:{id:a.id}});if(adjustment.salaryPeriodId===p.id)adjustments.push({...a,revision:adjustment.revision});}
 }
 const monthly=await tx.salaryAdjustment.findMany({where:{employeeId,salaryPeriodId:p.id,includedWeeklyStatementId:null,includedSalaryCalculationId:null,status:{in:["PENDING","APPROVED"]}}});
 if(monthly.some(a=>a.status==="PENDING"))blockers.push("Pending monthly adjustment");for(const a of monthly.filter(a=>a.status==="APPROVED"))adjustments.push({id:a.id,type:a.type,amount:a.amount.toFixed(2),reason:a.reason,revision:a.revision,commissionRelated:a.commissionRelated});
 sources.ledgerAmounts=amounts;sources.commissionRelated=restricted;sources.monthlyAdjustmentIds=monthly.filter(a=>a.status==="APPROVED").map(a=>a.id);
 void now;return {employeeId,period:{id:p.id,from,until,timezone:p.timezoneSnapshot,currency:p.currency,inputRevision:p.inputRevision,method:"WEEKLY_ATTENDANCE"},days:[],sources,commissions,adjustments,blockers};
}
export function calculateWeeklyMonth(input:PayInput){
 const amounts={...(input.sources.ledgerAmounts as Amounts)},monthlyIds=input.sources.monthlyAdjustmentIds as string[];
 for(const a of input.adjustments.filter(a=>monthlyIds.includes(a.id))){const k=a.type==="BONUS"?"bonusAmount":a.type==="DEDUCTION"?"deductionAmount":"otherAmount";amounts[k]=money(decimal(amounts[k]).plus(a.amount));}amounts.finalAmount=total(amounts);
 return {...amounts,calculationSnapshot:{formatVersion:1,formulaVersion:"weekly-ledger-v2",rounding:"Weekly month components use cumulative Decimal half-up rounding; month sums frozen amounts",employeeId:input.employeeId,period:input.period,commissionRelated:input.sources.commissionRelated===true || input.adjustments.some(a=>a.commissionRelated),sources:input.sources,segments:[],commissions:input.commissions,adjustments:input.adjustments,blockers:input.blockers}};
}
export async function recordPayment(identity:Identity|null,input:unknown){
 await securityBoundary(identity,async a=>payStaff(a));const v=validated(z.object({periodId:uuidSchema,paidAt:z.iso.datetime({offset:true}),reference:z.string().trim().max(150).default(""),note:z.string().trim().max(500).default("")}).strict(),input);
 return authorizedMutation(identity,async(a,tx)=>{
  payStaff(a);const p=await tx.salaryPeriod.findUnique({where:{id:v.periodId}});if(!p)throw new AppError(404,"NOT_FOUND","Period not found.");if(p.status!=="FINALIZED")throw new AppError(409,"NOT_FINAL","Finalize the month before recording payment.");
  const rows=await tx.salaryCalculation.findMany({where:{salaryPeriodId:p.id}});if(rows.some(r=>(r.calculationSnapshot as {commissionRelated:boolean}).commissionRelated))payStaff(a,true);if(a.role==="HR_MANAGER" && rows.some(r=>r.employeeId===a.employeeId))throw new AppError(403,"SELF_REVIEW","Another authorized administrator must record your own payment.");
  const paidAt=new Date(v.paidAt),now=await databaseNow(tx);if(paidAt>now || paidAt<dayStart(dateKey(p.endDate),p.timezoneSnapshot))throw new AppError(400,"PAYMENT_DATE","Payment date must be after the month ends and no later than server time.");
  if(p.paymentStatus==="PAID"){if(p.paidAt?.getTime()===paidAt.getTime() && (p.paymentReference??"")===v.reference && (p.paymentNote??"")===v.note)return p.id;throw new AppError(409,"ALREADY_PAID","Payment was already recorded; retained evidence cannot be rewritten.");}
  await tx.salaryPeriod.update({where:{id:p.id},data:{paymentStatus:"PAID",paidAt,paidBy:a.userId,paymentReference:v.reference,paymentNote:v.note}});
  await audit({actorUserId:a.userId,action:"MONTHLY_PAYMENT_RECORDED",entity:"salary_periods",entityId:p.id,after:{paidAt:v.paidAt,reference:v.reference,paymentStatus:"PAID"}},tx);
  for(const r of rows)await notify(tx,r.employeeId,"SALARY_PAID","salary_calculations",r.id,`salary-paid:${p.id}:${r.id}`,"Payment has been recorded for your finalized monthly statement.");return p.id;
 });
}
export async function weeklyData(identity:Identity|null,own=false){return securityBoundary(identity,async a=>{
 if(!own)payStaff(a);const rows=await db.weeklyEarningStatement.findMany({where:{...(own?{employeeId:a.employeeId??"00000000-0000-0000-0000-000000000000"}:{})},orderBy:{weekStartDate:"desc"},take:100});
 return Promise.all(rows.map(async r=>{const permitted=own?a.preorderCommissionEnabled:canCommissionStaff(a),restricted=(r.calculationSnapshot as {commissionRelated:boolean}).commissionRelated===true;const safe={id:r.id,employeeId:r.employeeId,week:dateKey(r.weekStartDate),until:dateKey(r.weekEndDate),status:r.status,revision:r.revision,currency:r.currency,finalAmount:r.finalAmount.toFixed(2),finalizedAt:r.finalizedAt,potentialOvertimeSeconds:(r.calculationSnapshot as {potentialOvertimeSeconds:number}).potentialOvertimeSeconds,approvedOvertimeSeconds:(r.calculationSnapshot as {approvedOvertimeSeconds:number}).approvedOvertimeSeconds,employee:own?null:await db.employee.findUniqueOrThrow({where:{id:r.employeeId},select:{legalName:true}})};
 return {...safe,...(!restricted || permitted?{baseAmount:r.baseAmount.toFixed(2),overtimeAmount:r.overtimeAmount.toFixed(2),bonusAmount:r.bonusAmount.toFixed(2),deductionAmount:r.deductionAmount.toFixed(2),otherAmount:r.otherAmount.toFixed(2),...(permitted?{commissionAmount:r.commissionAmount.toFixed(2)}:{})}:{}),...(!own && (!restricted||permitted)?{blockers:(r.calculationSnapshot as {blockers:string[]}).blockers}: {})};}));
});}
const correctionSchema=z.object({originalStatementId:uuidSchema,targetPeriodId:uuidSchema,amount:z.string().regex(/^-?\d{1,12}(\.\d{1,2})?$/),reason:z.string().trim().min(1).max(500),operationKey:uuidSchema}).strict();
export async function correctWeekly(identity:Identity|null,input:unknown){
 await securityBoundary(identity,async a=>payStaff(a));const v=validated(correctionSchema,input);
 return authorizedMutation(identity,async(a,tx)=>{
  const original=await tx.weeklyEarningStatement.findUnique({where:{id:v.originalStatementId}}),period=await tx.salaryPeriod.findUnique({where:{id:v.targetPeriodId}});if(!original || original.status!=="FINALIZED" || !period)throw new AppError(404,"NOT_FOUND","Final weekly statement or target month not found.");
  if(original.currency!==period.currency)throw new AppError(409,"CURRENCY_MISMATCH","Corrections must remain in the original statement currency.");
  const restricted=(original.calculationSnapshot as {commissionRelated:boolean}).commissionRelated===true;payStaff(a,restricted);
  if(period.status==="FINALIZED" || period.startDate<dateValue(dateKey(original.weekEndDate).slice(0,7)+"-01"))throw new AppError(409,"CORRECTION_TARGET","Choose a later open month after the frozen earning week.");
  const old=await tx.salaryAdjustment.findUnique({where:{operationKey:v.operationKey}});if(old){if(old.correctsWeeklyStatementId!==original.id || old.salaryPeriodId!==period.id || old.amount.toFixed(2)!==money(v.amount) || old.reason!==v.reason || old.createdBy!==a.userId)throw new AppError(409,"OPERATION_REUSED","Correction key belongs to another proposal.");return old.id;}
  const row=await tx.salaryAdjustment.create({data:{employeeId:original.employeeId,salaryPeriodId:period.id,correctsWeeklyStatementId:original.id,type:"OTHER",amount:v.amount,reason:v.reason,operationKey:v.operationKey,commissionRelated:restricted,createdBy:a.userId}});
  await audit({actorUserId:a.userId,employeeId:original.employeeId,action:"WEEKLY_CORRECTION_PROPOSED",entity:"salary_adjustments",entityId:row.id,reason:v.reason,after:{correctsWeeklyStatementId:original.id,targetPeriodId:period.id,amount:v.amount,commissionRelated:restricted}},tx);return row.id;
 });
}
export async function monthToDate(identity:Identity|null){return securityBoundary(identity,async a=>{
 if(!a.employeeId)return null;
 return db.$transaction(async tx=>{
  const settings=await tx.organizationSettings.findUniqueOrThrow({where:{id:1}}),now=await databaseNow(tx),today=localDate(now,settings.timezone),from=today.slice(0,7)+"-01",until=Temporal.PlainDate.from(from).add({months:1}).toString();
  if(dateValue(from)<settings.earningsEffectiveFrom)return {month:from.slice(0,7),currency:settings.currency,legacy:true,finalized:"0.00",awaitingReview:"0.00",paymentStatus:"UNPAID"};
  const stored=await tx.salaryPeriod.findUnique({where:{startDate:dateValue(from)}}),p=stored??{id:"00000000-0000-0000-0000-000000000000",startDate:dateValue(from),endDate:dateValue(until),timezoneSnapshot:settings.timezone,currency:settings.currency,inputRevision:1,calculationMethod:"WEEKLY_ATTENDANCE"} as SalaryPeriod;
  const captured=await captureEmployee(tx,p,a.employeeId!,now),calculated=calculatePay(captured),rows=await tx.weeklyEarningStatement.findMany({where:{employeeId:a.employeeId!,status:"FINALIZED",weekStartDate:{lt:p.endDate},weekEndDate:{gt:p.startDate}}}),frozen=zero(),pending=zero();
  for(const r of rows){const part=(r.monthComponents as unknown as Record<string,Amounts>)[from.slice(0,7)];if(part && r.currency!==p.currency)throw new AppError(409,"CURRENCY_MISMATCH","Accumulated earnings must retain the monthly period currency.");if(part)for(const k of amountKeys)frozen[k]=money(decimal(frozen[k]).plus(part[k]));}
  const unfrozen=(date:string)=>!rows.some(r=>date>=dateKey(r.weekStartDate)&&date<dateKey(r.weekEndDate));
  for(const d of calculated.calculationSnapshot.segments.filter(d=>d.date<=today && unfrozen(d.date))){pending.baseAmount=decimal(pending.baseAmount).plus(d.baseUnrounded).toString();pending.overtimeAmount=decimal(pending.overtimeAmount).plus(d.overtimeUnrounded).toString();}
  for(const c of captured.commissions)if(unfrozen(localDate(new Date(c.orderAt),settings.timezone)))pending.commissionAmount=money(decimal(pending.commissionAmount).plus(c.amount));
  for(const adj of await tx.salaryAdjustment.findMany({where:{employeeId:a.employeeId!,salaryPeriodId:p.id,status:"APPROVED",includedWeeklyStatementId:null,includedSalaryCalculationId:null}})){const k=adj.type==="BONUS"?"bonusAmount":adj.type==="DEDUCTION"?"deductionAmount":"otherAmount";pending[k]=money(decimal(pending[k]).plus(adj.amount));}
  pending.baseAmount=money(pending.baseAmount);pending.overtimeAmount=money(pending.overtimeAmount);frozen.finalAmount=total(frozen);pending.finalAmount=total(pending);const aggregateOnly=!a.preorderCommissionEnabled && (captured.commissions.length>0 || captured.adjustments.some(r=>r.commissionRelated) || rows.some(r=>(r.calculationSnapshot as {commissionRelated:boolean}).commissionRelated));
  const show=(v:Amounts)=>aggregateOnly?{total:v.finalAmount}:{base:v.baseAmount,approvedOvertime:v.overtimeAmount,bonuses:v.bonusAmount,deductions:v.deductionAmount,other:v.otherAmount,...(a.preorderCommissionEnabled?{commissions:v.commissionAmount}:{}),total:v.finalAmount};
  return {month:from.slice(0,7),currency:p.currency,legacy:false,finalized:frozen.finalAmount,awaitingReview:pending.finalAmount,total:money(decimal(frozen.finalAmount).plus(pending.finalAmount)),finalizedBreakdown:show(frozen),awaitingReviewBreakdown:show(pending),paymentStatus:stored?.paymentStatus??"UNPAID",paidAt:stored?.paidAt??null};
 },{isolationLevel:"RepeatableRead"});
});}
