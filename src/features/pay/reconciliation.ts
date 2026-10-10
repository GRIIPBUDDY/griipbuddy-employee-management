import "server-only";
import type { SalaryAdjustment } from "@/generated/prisma/client";
import type { Database } from "@/lib/db/audit";
import { audit } from "@/lib/db/audit";
import { authorizedMutation } from "@/lib/db/mutation";
import { securityBoundary } from "@/lib/authorization/actor";
import { validated } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import type { Identity } from "@/types/auth";
import { databaseNow } from "@/features/time/clock";
import { captureEmployee } from "./capture";
import { calculatePay } from "./engine";
import { commissionRestricted,payStaff } from "./access";
import { decimal,money,sumMoney } from "./money";
import { openPeriod,payJson } from "./periods";
import { reconcileSchema } from "./validation";
type Change={preorderId:string;amount:string};
type Snapshot={originalCalculationId:string;originalTotal:string;alreadyFinalizedDelta:string;desiredTotal:string;remainingDelta:string;commissionOverrides:Change[];desiredSnapshot:ReturnType<typeof calculatePay>["calculationSnapshot"]};
async function reconciliationFacts(tx:Database,id:string,now:Date,changes:Change[]=[]) {
 const original=await tx.salaryCalculation.findUnique({where:{id}});if(!original?.finalizedAt)throw new AppError(404,"NOT_FOUND","A finalized original statement is required.");
 const period=await tx.salaryPeriod.findUniqueOrThrow({where:{id:original.salaryPeriodId}}),input=await captureEmployee(tx,period,original.employeeId,now,original.id);
 if(input.blockers.length)throw new AppError(409,"UNRESOLVED_PAY",`Resolve historical sources: ${input.blockers.join("; ")}`);
 const prior=await tx.salaryAdjustment.findMany({where:{correctsSalaryCalculationId:id,status:"APPROVED",includedSalaryCalculationId:{not:null}},orderBy:[{approvedAt:"asc"},{id:"asc"}]});
 const claims=await tx.salaryCalculation.findMany({where:{id:{in:prior.map(a=>a.includedSalaryCalculationId!)}},select:{id:true,finalizedAt:true}}),claimTimes=new Map(claims.map(c=>[c.id,c.finalizedAt?.getTime()??0]));
 prior.sort((a,b)=>(claimTimes.get(a.includedSalaryCalculationId!)??0)-(claimTimes.get(b.includedSalaryCalculationId!)??0)||a.id.localeCompare(b.id));
 const overrides=new Map<string,string>();
 for(const row of prior){const snap=row.reconciliationSnapshot as unknown as Snapshot;for(const c of snap.commissionOverrides??[])overrides.set(c.preorderId,c.amount);}
 for(const c of changes){if(!input.commissions.some(p=>p.id===c.preorderId))throw new AppError(404,"NOT_FOUND","Commission must belong to this original finalized statement.");overrides.set(c.preorderId,money(c.amount));}
 input.commissions=input.commissions.map(c=>({...c,amount:overrides.get(c.id)??c.amount}));
 const desired=calculatePay(input),already=money(sumMoney(prior.map(a=>a.amount.toFixed(2)))),remaining=money(decimal(desired.finalAmount).minus(original.finalAmount).minus(already));
 const snapshot:Snapshot={originalCalculationId:id,originalTotal:original.finalAmount.toFixed(2),alreadyFinalizedDelta:already,desiredTotal:desired.finalAmount,remainingDelta:remaining,commissionOverrides:[...overrides].map(([preorderId,amount])=>({preorderId,amount})).sort((a,b)=>a.preorderId.localeCompare(b.preorderId)),desiredSnapshot:desired.calculationSnapshot};
 return {original,period,snapshot,restricted:commissionRestricted(original.calculationSnapshot)||overrides.size>0};
}
function canonical(value:unknown):unknown {
 if(Array.isArray(value))return value.map(canonical);
 if(value && typeof value==="object")return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
 return value;
}
export async function verifyReconciliation(tx:Database,row:SalaryAdjustment,now:Date) {
 if(!row.correctsSalaryCalculationId || !row.reconciliationSnapshot)throw new AppError(409,"RECONCILE_AGAIN","Historical facts changed. Refresh the reconciliation before approval.");
 const stored=row.reconciliationSnapshot as unknown as Snapshot,current=await reconciliationFacts(tx,row.correctsSalaryCalculationId,now,stored.commissionOverrides);
 if(JSON.stringify(canonical(current.snapshot))!==JSON.stringify(canonical(stored)) || current.snapshot.remainingDelta!==row.amount.toFixed(2))throw new AppError(409,"RECONCILE_AGAIN","Reconciliation is stale. Refresh its desired total and remaining delta.");
}
export async function reconcileSalary(identity:Identity|null,input:unknown) {
 await securityBoundary(identity,async a=>payStaff(a));const v=validated(reconcileSchema,input);
 return authorizedMutation(identity,async(actor,tx)=>{
  payStaff(actor);const source=await tx.salaryCalculation.findUnique({where:{id:v.originalCalculationId},select:{calculationSnapshot:true}});if(source)payStaff(actor,commissionRestricted(source.calculationSnapshot));const target=await openPeriod(tx,v.targetPeriodId),now=await databaseNow(tx),facts=await reconciliationFacts(tx,v.originalCalculationId,now,v.commissionChange?[v.commissionChange]:[]);payStaff(actor,facts.restricted);
  if(target.startDate<facts.period.endDate || target.currency!==facts.period.currency)throw new AppError(400,"TARGET_MONTH","Choose a later open month in the original currency.");
  const replay=await tx.salaryAdjustment.findUnique({where:{operationKey:v.operationKey}});
  const outstanding=await tx.salaryAdjustment.findFirst({where:{correctsSalaryCalculationId:v.originalCalculationId,includedSalaryCalculationId:null,status:{not:"REJECTED"}}});
  if(replay && (replay.correctsSalaryCalculationId!==v.originalCalculationId || replay.salaryPeriodId!==target.id))throw new AppError(409,"OPERATION_REUSED","Request key belongs to another reconciliation.");
  if(replay?.includedSalaryCalculationId || replay?.status==="REJECTED")return replay.id;
  if(outstanding && (!replay || outstanding.id!==replay.id))throw new AppError(409,"OUTSTANDING_CORRECTION","Refresh or reject the existing reconciliation before creating another.");
  if(outstanding && outstanding.revision!==v.revision)throw new AppError(409,"STALE","Refresh this reconciliation before recomputing.");
  const data={amount:facts.snapshot.remainingDelta,reason:v.reason,reconciliationSnapshot:payJson(facts.snapshot),status:"PENDING",approvedBy:null,approvedAt:null,reviewComment:null};
  const row=outstanding?await tx.salaryAdjustment.update({where:{id:outstanding.id},data:{...data,revision:{increment:1}}}):await tx.salaryAdjustment.create({data:{...data,employeeId:facts.original.employeeId,salaryPeriodId:target.id,type:"CORRECTION",commissionRelated:facts.restricted,correctsSalaryCalculationId:v.originalCalculationId,createdBy:actor.userId,operationKey:v.operationKey}});
  await audit({actorUserId:actor.userId,employeeId:row.employeeId,action:outstanding?"SALARY_RECONCILIATION_REFRESHED":"SALARY_RECONCILIATION_CREATED",entity:"salary_adjustments",entityId:row.id,reason:v.reason,after:{originalCalculationId:v.originalCalculationId,targetPeriodId:target.id,originalTotal:facts.snapshot.originalTotal,desiredTotal:facts.snapshot.desiredTotal,alreadyFinalizedDelta:facts.snapshot.alreadyFinalizedDelta,remainingDelta:row.amount.toFixed(2),commissionRelated:facts.restricted}},tx);return row.id;
 });
}
