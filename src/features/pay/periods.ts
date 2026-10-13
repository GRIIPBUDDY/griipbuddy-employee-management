import "server-only";
import { summarizeBlockers } from "./blockers";
import { Temporal } from "@js-temporal/polyfill";
import { db } from "@/lib/db/client";
import { audit,type Database } from "@/lib/db/audit";
import { securityBoundary } from "@/lib/authorization/actor";
import { authorizedMutation } from "@/lib/db/mutation";
import { validated } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import type { Identity,Actor } from "@/types/auth";
import type { Prisma,SalaryPeriod,SalaryCalculation } from "@/generated/prisma/client";
import { databaseNow } from "@/features/time/clock";
import { dateValue,dateKey,dayStart,addDays } from "@/features/time/dates";
import { localWeek } from "@/features/review/calculation";
import { verifyReconciliation } from "./reconciliation";
import { notify,notifySalaryPeriod } from "@/features/review/notifications";
import { payStaff,commissionRestricted,canCommissionStaff } from "./access";
import { capturePeriod,payrollRoster } from "./capture";
import { calculateWeeklyMonth } from "./weekly";
import { calculatePay } from "./engine";
import { decimal } from "./money";
import { moduleState } from "@/features/settings/config";
import { periodSchema,calculationSchema,transitionSchema,listSchema } from "./validation";
export const payJson=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
export async function openPeriod(tx:Database,id:string) {
 const p=await tx.salaryPeriod.findUnique({where:{id}});if(!p)throw new AppError(404,"NOT_FOUND","Salary period not found.");if(p.status==="FINALIZED")throw new AppError(409,"FINALIZED","Finalized salary is immutable. Use a later reviewed correction.");return p;
}
// Salary is paid monthly. With weekly statements switched off, an open weekly-ledger month moves to the
// monthly attendance method; a month that already froze weekly statements must finish on that ledger.
async function monthlyMethod(tx:Database,actor:Actor,p:SalaryPeriod) {
 if(p.calculationMethod!=="WEEKLY_ATTENDANCE" || moduleState((await tx.organizationSettings.findUniqueOrThrow({where:{id:1},select:{enabledModules:true}})).enabledModules).weeklyEarnings)return p;
 if(await tx.weeklyEarningStatement.count({where:{status:"FINALIZED",weekStartDate:{lt:p.endDate},weekEndDate:{gt:p.startDate}}}))throw new AppError(409,"WEEKLY_LEDGER_MONTH","This month already has finalized weekly statements. Turn on “Weekly earning statements (legacy)” in Settings → Modules to finish it.");
 const next=await tx.salaryPeriod.update({where:{id:p.id},data:{calculationMethod:"MONTHLY_ATTENDANCE"}});
 await audit({actorUserId:actor.userId,action:"SALARY_PERIOD_METHOD_CHANGED",entity:"salary_periods",entityId:p.id,before:{calculationMethod:p.calculationMethod},after:{calculationMethod:next.calculationMethod}},tx);return next;
}
async function restrictedPeriod(tx:Database,actor:Actor,p:SalaryPeriod) {
 if(await tx.preorder.count({where:{salaryPeriodId:p.id,status:{in:["PENDING","APPROVED","INCLUDED"]}}}) || await tx.salaryAdjustment.count({where:{salaryPeriodId:p.id,commissionRelated:true}}))payStaff(actor,true);
}
export async function createPeriod(identity:Identity|null,input:unknown) {
 await securityBoundary(identity,async actor=>payStaff(actor));const v=validated(periodSchema,input);
 let from:string,until:string;try{const date=Temporal.PlainDate.from(`${v.month}-01`);if(date.year<1900 || date.year>2199)throw new Error();from=date.toString();until=date.add({months:1}).toString();}catch{throw new AppError(400,"MONTH","Choose a valid calendar month from 1900 through 2199.");}
 return authorizedMutation(identity,async(actor,tx)=>{
  payStaff(actor);const existing=await tx.salaryPeriod.findUnique({where:{startDate:dateValue(from)}});if(existing)return existing.id;
  const settings=await tx.organizationSettings.findUniqueOrThrow({where:{id:1}}),p=await tx.salaryPeriod.create({data:{startDate:dateValue(from),endDate:dateValue(until),timezoneSnapshot:settings.timezone,currency:settings.currency,calculationMethod:dateValue(from)>=settings.earningsEffectiveFrom?(moduleState(settings.enabledModules).weeklyEarnings?"WEEKLY_ATTENDANCE":"MONTHLY_ATTENDANCE"):"LEGACY_MONTHLY",createdBy:actor.userId}});
  await audit({actorUserId:actor.userId,action:"SALARY_PERIOD_CREATED",entity:"salary_periods",entityId:p.id,after:{from,until,currency:p.currency}},tx);return p.id;
 });
}
export async function calculatePeriod(identity:Identity|null,input:unknown) {
 await securityBoundary(identity,async actor=>payStaff(actor));const v=validated(calculationSchema,input);
 // Capture the revision and authoritative facts under the existing mutation lock; arithmetic
 // runs outside it. The second lock validates revision/roster/current authority before commit.
 const captured=await authorizedMutation(identity,async(actor,tx)=>{
  payStaff(actor);const p=await monthlyMethod(tx,actor,await openPeriod(tx,v.periodId));await restrictedPeriod(tx,actor,p);
  if(v.revision!==p.inputRevision)throw new AppError(409,"STALE","Salary inputs changed. Refresh before calculating.");
  const facts=await capturePeriod(tx,p,await databaseNow(tx));if(facts.unassigned && !canCommissionStaff(actor))payStaff(actor,true);return {p,...facts};
 });
 const outputs=captured.inputs.map(i=>({employeeId:i.employeeId,...(captured.p.calculationMethod==="WEEKLY_ATTENDANCE"?calculateWeeklyMonth(i):calculatePay(i))}));
 return authorizedMutation(identity,async(actor,tx)=>{
  payStaff(actor);const p=await openPeriod(tx,v.periodId);await restrictedPeriod(tx,actor,p);
  if(p.inputRevision!==captured.p.inputRevision || JSON.stringify(await payrollRoster(tx,p))!==JSON.stringify(captured.ids))throw new AppError(409,"STALE","Salary sources changed during calculation. Calculate again.");
  const now=await databaseNow(tx);
  for(const output of outputs){
   const {employeeId,calculationSnapshot,...amounts}=output,old=await tx.salaryCalculation.findUnique({where:{employeeId_salaryPeriodId:{employeeId,salaryPeriodId:p.id}}});
   const data={...amounts,inputRevision:p.inputRevision,calculationSnapshot:payJson(calculationSnapshot),calculatedBy:actor.userId,calculatedAt:now};
   const row=await tx.salaryCalculation.upsert({where:{employeeId_salaryPeriodId:{employeeId,salaryPeriodId:p.id}},create:{employeeId,salaryPeriodId:p.id,...data},update:data});
   await audit({actorUserId:actor.userId,employeeId,action:old?"SALARY_RECALCULATED":"SALARY_CALCULATED",entity:"salary_calculations",entityId:row.id,...(old?{before:{finalAmount:old.finalAmount.toFixed(2),inputRevision:old.inputRevision}}:{}),after:{...amounts,commissionRelated:calculationSnapshot.commissionRelated,inputRevision:p.inputRevision,blockers:calculationSnapshot.blockers}},tx);
  }
  await tx.salaryPeriod.update({where:{id:p.id},data:{status:"CALCULATED",calculatedInputRevision:p.inputRevision,calculatedBy:actor.userId,calculatedAt:now,reviewedBy:null,reviewedAt:null,approvedBy:null,approvedAt:null}});
  await audit({actorUserId:actor.userId,action:"SALARY_PERIOD_CALCULATED",entity:"salary_periods",entityId:p.id,before:{status:p.status},after:{status:"CALCULATED",inputRevision:p.inputRevision}},tx);
  await notifySalaryPeriod(tx,p.id,p.inputRevision,"CALCULATED");return p.id;
 });
}
export async function transitionPeriod(identity:Identity|null,input:unknown) {
 await securityBoundary(identity,async actor=>payStaff(actor));const v=validated(transitionSchema,input);
 return authorizedMutation(identity,async(actor,tx)=>{
  payStaff(actor);
  const p=await tx.salaryPeriod.findUnique({where:{id:v.periodId}});if(!p)throw new AppError(404,"NOT_FOUND","Salary period not found.");
  if(p.status===v.status && p.inputRevision===v.revision)return p.id;
  await restrictedPeriod(tx,actor,p);
  const required={REVIEWED:"CALCULATED",APPROVED:"REVIEWED",FINALIZED:"APPROVED"}[v.status];
  if(p.status!==required || p.inputRevision!==v.revision || p.calculatedInputRevision!==p.inputRevision)throw new AppError(409,"STALE","Follow the current calculated → reviewed → approved → finalized lifecycle.");
  const now=await databaseNow(tx),settings=await tx.organizationSettings.findUniqueOrThrow({where:{id:1}}),lastWeek=localWeek(addDays(dateKey(p.endDate),-1),settings.weekStartDay);
  if(now<dayStart(addDays(lastWeek,7),p.timezoneSnapshot))throw new AppError(409,"BOUNDARY_WEEK_OPEN","Every week intersecting this month must finish before closeout.");
  const facts=await capturePeriod(tx,p,now),rows=await tx.salaryCalculation.findMany({where:{salaryPeriodId:p.id},orderBy:{employeeId:"asc"}});
  if(actor.role==="HR_MANAGER" && rows.some(r=>r.employeeId===actor.employeeId))throw new AppError(403,"SELF_REVIEW","Another authorized staff member must review your own monthly pay.");
  if(rows.length!==facts.ids.length || rows.some((r,i)=>r.employeeId!==facts.ids[i] || r.inputRevision!==p.inputRevision))throw new AppError(409,"ROSTER_INCOMPLETE","Recalculate every employee on the current monthly roster.");
  const blockers=[...facts.inputs.flatMap(i=>i.blockers),...(facts.unassigned?["Assign or explicitly defer unresolved pre-orders"]:[])];
  if(blockers.length){
   // Name the affected employees and condense per-date messages so the reviewer can act on them.
   const named=await Promise.all(facts.inputs.filter(i=>i.blockers.length).map(async i=>`${(await tx.employee.findUnique({where:{id:i.employeeId},select:{legalName:true}}))?.legalName??"Employee"}: ${summarizeBlockers(i.blockers).join("; ")}`));
   throw new AppError(409,"UNRESOLVED_PAY",`Resolve sources before closeout. ${[...named,...(facts.unassigned?["Assign or explicitly defer unresolved pre-orders"]:[])].join(" · ")}`);
  }
  if(rows.some(r=>decimal(r.finalAmount).isNegative()))throw new AppError(409,"NEGATIVE_SALARY","Reduce or defer approved deductions; final salary cannot be negative.");
  if(rows.some(r=>{const snap=r.calculationSnapshot as {blockers?:unknown[]};return !Array.isArray(snap.blockers) || snap.blockers.length>0;}))throw new AppError(409,"RECALCULATE","The stored estimate had blockers. Calculate again with resolved sources.");
  for(const adjustment of await tx.salaryAdjustment.findMany({where:{salaryPeriodId:p.id,status:"APPROVED",correctsSalaryCalculationId:{not:null},includedSalaryCalculationId:null}}))await verifyReconciliation(tx,adjustment,now);
  if(v.status==="FINALIZED"){
   await tx.$executeRaw`SELECT set_config('app.salary_finalizing',${p.id},true)`;
   for(const row of rows){
    const snap=row.calculationSnapshot as {commissions:{id:string;revision:number}[];adjustments:{id:string;revision:number}[]};
    for(const c of snap.commissions){const result=await tx.preorder.updateMany({where:{id:c.id,employeeId:row.employeeId,salaryPeriodId:p.id,status:"APPROVED",revision:c.revision,includedSalaryCalculationId:null},data:{status:"INCLUDED",includedSalaryCalculationId:row.id,includedAt:now,revision:{increment:1}}});if(result.count!==1)throw new AppError(409,"STALE","A commission claim changed; recalculate before finalization.");await audit({actorUserId:actor.userId,employeeId:row.employeeId,action:"COMMISSION_INCLUDED",entity:"preorders",entityId:c.id,before:{status:"APPROVED",revision:c.revision},after:{status:"INCLUDED",calculationId:row.id,periodId:p.id,revision:c.revision+1}},tx);await notify(tx,row.employeeId,"COMMISSION_INCLUDED","preorders",c.id,`commission-included:${c.id}:${row.id}`,"Your approved commission was included in a finalized salary period.");}
    for(const a of snap.adjustments){const result=await tx.salaryAdjustment.updateMany({where:{id:a.id,employeeId:row.employeeId,salaryPeriodId:p.id,status:"APPROVED",revision:a.revision,includedSalaryCalculationId:null},data:{includedSalaryCalculationId:row.id,revision:{increment:1}}});if(result.count!==1)throw new AppError(409,"STALE","An adjustment claim changed; recalculate before finalization.");await audit({actorUserId:actor.userId,employeeId:row.employeeId,action:"SALARY_ADJUSTMENT_INCLUDED",entity:"salary_adjustments",entityId:a.id,before:{revision:a.revision},after:{calculationId:row.id,periodId:p.id,revision:a.revision+1}},tx);}
    await tx.salaryCalculation.update({where:{id:row.id},data:{finalizedAt:now}});
    await audit({actorUserId:actor.userId,employeeId:row.employeeId,action:"SALARY_FINALIZED",entity:"salary_calculations",entityId:row.id,after:{periodId:p.id,commissionRelated:commissionRestricted(row.calculationSnapshot),inputRevision:p.inputRevision,finalAmount:row.finalAmount.toFixed(2)}},tx);
    await notify(tx,row.employeeId,"SALARY_FINALIZED","salary_calculations",row.id,`salary-finalized:${row.id}`,"Your monthly salary statement is finalized.");
    await tx.employeeActivity.create({data:{employeeId:row.employeeId,createdBy:actor.userId,type:"SALARY_FINALIZED",title:"Salary statement finalized",description:"",eventTime:now,sourceType:"salary_calculations",sourceId:row.id,eventKey:`salary-finalized:${row.id}`,employeeVisible:true,commissionRestricted:commissionRestricted(row.calculationSnapshot)}});
   }
  }
  await tx.salaryPeriod.update({where:{id:p.id},data:{status:v.status,...(v.status==="REVIEWED"?{reviewedBy:actor.userId,reviewedAt:now}:v.status==="APPROVED"?{approvedBy:actor.userId,approvedAt:now}:{finalizedBy:actor.userId,finalizedAt:now})}});
  if(v.status!=="FINALIZED")await notifySalaryPeriod(tx,p.id,p.inputRevision,v.status);
  await audit({actorUserId:actor.userId,action:`SALARY_PERIOD_${v.status}`,entity:"salary_periods",entityId:p.id,before:{status:p.status},after:{status:v.status,inputRevision:p.inputRevision}},tx);return p.id;
 });
}
function statement(row:SalaryCalculation,p:SalaryPeriod,full:boolean,own:boolean,showCommission=true) {
 const period={id:p.id,from:dateKey(p.startDate),until:dateKey(p.endDate),currency:p.currency,status:p.status,paymentStatus:p.paymentStatus,paidAt:p.paidAt};
 if(!full)return {id:row.id,period,finalAmount:row.finalAmount.toFixed(2)};
 const snapshot=structuredClone(row.calculationSnapshot) as unknown as ReturnType<typeof calculatePay>["calculationSnapshot"];
 if(own && !showCommission){const hide=(value:unknown):void=>{if(!value || typeof value!=="object")return;for(const [key,child] of Object.entries(value)){if(/commission/i.test(key))Reflect.deleteProperty(value,key);else hide(child);}};hide(snapshot);}
 if(own)snapshot.adjustments=snapshot.adjustments.map(a=>{const safe={...a,reason:"Approved adjustment"};if(!showCommission)Reflect.deleteProperty(safe,"commissionRelated");return safe;});
 return {id:row.id,period,finalAmount:row.finalAmount.toFixed(2),baseAmount:row.baseAmount.toFixed(2),overtimeAmount:row.overtimeAmount.toFixed(2),...(showCommission?{commissionAmount:row.commissionAmount.toFixed(2)}:{}),bonusAmount:row.bonusAmount.toFixed(2),deductionAmount:row.deductionAmount.toFixed(2),otherAmount:row.otherAmount.toFixed(2),snapshot};
}
export async function salaryData(identity:Identity|null,query:unknown={},own=false) {
 return securityBoundary(identity,async actor=>{
  if(!own)payStaff(actor);const v=validated(listSchema,query);
  const rows=await db.salaryCalculation.findMany({where:{...(own?{employeeId:actor.employeeId??"00000000-0000-0000-0000-000000000000",finalizedAt:{not:null}}:{}),...(v.id?{id:v.id}:{})},orderBy:[{calculatedAt:"desc"},{id:"desc"}],skip:(v.page-1)*25,take:26});
  if(v.id && !rows.length)throw new AppError(404,"NOT_FOUND","Salary statement not found.");
  return {records:await Promise.all(rows.slice(0,25).map(async row=>{const p=await db.salaryPeriod.findUniqueOrThrow({where:{id:row.salaryPeriodId}});return {...statement(row,p,!commissionRestricted(row.calculationSnapshot) || (own?actor.preorderCommissionEnabled:canCommissionStaff(actor)),own,own?actor.preorderCommissionEnabled:canCommissionStaff(actor)),...(!own?{employee:await db.employee.findUniqueOrThrow({where:{id:row.employeeId},select:{legalName:true}})}:{})};})),page:v.page,hasNext:rows.length>25};
 });
}
export async function periodData(identity:Identity|null,query:unknown={}) {
 return securityBoundary(identity,async actor=>{
  payStaff(actor);const v=validated(listSchema,query),rows=await db.salaryPeriod.findMany({where:{...(v.id?{id:v.id}:{}),...(v.status?{status:v.status}:{})},orderBy:{startDate:"desc"},skip:(v.page-1)*25,take:26,select:{id:true,startDate:true,endDate:true,currency:true,status:true,inputRevision:true,calculatedInputRevision:true,createdAt:true,reviewedAt:true,approvedAt:true,finalizedAt:true,paymentStatus:true,paidAt:true}});
  if(v.id && !rows.length)throw new AppError(404,"NOT_FOUND","Salary period not found.");
  return {records:rows.slice(0,25),page:v.page,hasNext:rows.length>25,isAdmin:actor.role==="ADMIN",calculations:v.id?await Promise.all((await db.salaryCalculation.findMany({where:{salaryPeriodId:v.id},orderBy:{employeeId:"asc"}})).map(async row=>({...statement(row,await db.salaryPeriod.findUniqueOrThrow({where:{id:v.id!}}),!commissionRestricted(row.calculationSnapshot)||canCommissionStaff(actor),false),employee:await db.employee.findUniqueOrThrow({where:{id:row.employeeId},select:{legalName:true}})}))):[]};
 });
}
