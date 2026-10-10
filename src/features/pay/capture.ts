import "server-only";
import type { Database } from "@/lib/db/audit";
import type { SalaryPeriod } from "@/generated/prisma/client";
import { summary,weekCalculation } from "@/features/review/summary";
import { addDays,dateKey,dateValue,dayStart } from "@/features/time/dates";
import { localWeek,intersect,tail,seconds,windowFor,type Interval } from "@/features/review/calculation";
import type { PayInput,PayDay,RateFact } from "./engine";
export async function payrollRoster(tx:Database,p:SalaryPeriod) {
 const [stints,adjustments,orders,existing]=await Promise.all([
  tx.employmentPeriod.findMany({where:{startDate:{lt:p.endDate},OR:[{endDate:null},{endDate:{gt:p.startDate}}]},select:{employeeId:true}}),
  tx.salaryAdjustment.findMany({where:{salaryPeriodId:p.id},select:{employeeId:true}}),
  tx.preorder.findMany({where:{salaryPeriodId:p.id},select:{employeeId:true}}),
  tx.salaryCalculation.findMany({where:{salaryPeriodId:p.id},select:{employeeId:true}})
 ]);
 return [...new Set([...stints,...adjustments,...orders,...existing].map(r=>r.employeeId))].sort();
}
export async function captureEmployee(tx:Database,p:SalaryPeriod,employeeId:string,now:Date,originalCalculationId?:string):Promise<PayInput> {
 const from=dateKey(p.startDate),until=dateKey(p.endDate),zone=p.timezoneSnapshot,settings=await tx.organizationSettings.findUniqueOrThrow({where:{id:1}});
 const [totals,stints,rates,commissions,adjustments,pendingLeave]=await Promise.all([
  summary(tx,employeeId,from,until,now,true),
  tx.employmentPeriod.findMany({orderBy:{startDate:"asc"},where:{employeeId,startDate:{lt:p.endDate},OR:[{endDate:null},{endDate:{gt:p.startDate}}]},select:{id:true,startDate:true,endDate:true,revision:true}}),
  tx.compensationRate.findMany({where:{employeeId,supersededAt:null,effectiveFrom:{lt:p.endDate},OR:[{effectiveUntil:null},{effectiveUntil:{gt:p.startDate}}]},orderBy:{effectiveFrom:"asc"}}),
  tx.preorder.findMany({orderBy:{id:"asc"},where:{employeeId,salaryPeriodId:p.id,...(originalCalculationId?{includedSalaryCalculationId:originalCalculationId}:{includedSalaryCalculationId:null}),status:{in:originalCalculationId?["INCLUDED"]:["APPROVED","PENDING"]}}}),
  tx.salaryAdjustment.findMany({orderBy:{id:"asc"},where:{employeeId,salaryPeriodId:p.id,...(originalCalculationId?{includedSalaryCalculationId:originalCalculationId}:{includedSalaryCalculationId:null}),status:{in:["APPROVED","PENDING"]}}}),
  tx.leaveRequest.count({where:{employeeId,status:"PENDING",startAt:{lt:dayStart(until,zone)},endAt:{gt:dayStart(from,zone)}}})
 ]);
 const blockers=[...totals.issues,...(totals.openCount?["Missing checkout"]:[]),...(totals.pendingCorrections?["Pending attendance correction"]:[]),...(totals.leaveConflictSeconds?["Work overlaps approved leave"]:[]),...(totals.outsideEmploymentSeconds?["Work outside employment"]:[]),...(pendingLeave?["Pending leave request"]:[]),...(adjustments.some(a=>a.status==="PENDING")?["Pending salary adjustment"]:[]),...(commissions.some(c=>c.status==="PENDING")?["Pending assigned commission"]:[])];
 const rateFacts:RateFact[]=rates.map(r=>({id:r.id,employmentPeriodId:r.employmentPeriodId,effectiveFrom:dateKey(r.effectiveFrom),effectiveUntil:r.effectiveUntil?dateKey(r.effectiveUntil):null,payType:r.payType,baseAmount:r.baseAmount.toString(),overtimeHourlyEquivalent:r.overtimeHourlyEquivalent?.toString()??null,overtimeMultiplier:r.overtimeMultiplier.toString(),currency:r.currency,revision:r.revision}));
 const approved:Interval[]=[],weeks=[];
 for(let week=localWeek(from,settings.weekStartDay);week<until;week=addDays(week,7)) {
  const current=await weekCalculation(tx,employeeId,week,now),row=await tx.overtimeReview.findUnique({where:{employeeId_weekStartDate:{employeeId,weekStartDate:dateValue(week)}}});
  if(!current.ended)blockers.push(`Week ${week} has not ended`);
  blockers.push(...current.blockers.map(b=>`${week}: ${b}`));
  const valid=!!row && row.status!=="STALE" && row.actualSecondsSnapshot===current.actualSeconds && row.thresholdSeconds===current.thresholdSeconds && row.policyVersion===current.policyVersion && !current.blockers.length;
  if(current.potentialSeconds>0 && (!valid || !["APPROVED","REJECTED"].includes(row!.status)))blockers.push(`Overtime week ${week} needs current review`);
  const allocation=valid && row!.status==="APPROVED"?tail(current.candidates,row!.approvedSeconds):[];approved.push(...allocation);
  weeks.push({week,weekEnd:current.weekEnd,reviewId:row?.id??null,reviewRevision:row?.revision??null,status:valid?row!.status:current.potentialSeconds===0 && !current.blockers.length?"NOT_REQUIRED":"UNRESOLVED",actualSeconds:current.actualSeconds,potentialSeconds:current.potentialSeconds,thresholdSeconds:current.thresholdSeconds,policyVersion:current.policyVersion,approvedSeconds:seconds(allocation),allocation});
 }
 const days:PayDay[]=[];
 for(let date=from;date<until;date=addDays(date,1)){
  const stint=stints.find(s=>dateKey(s.startDate)<=date && (!s.endDate || date<dateKey(s.endDate)));if(!stint)continue;
  const matches=rateFacts.filter(r=>r.employmentPeriodId===stint.id && r.effectiveFrom<=date && (!r.effectiveUntil || date<r.effectiveUntil)),rate=matches.length===1?matches[0]:null;
  if(!rate)blockers.push(`Compensation coverage missing or overlapping on ${date}`);
  const day=windowFor(date,1,zone),actual=intersect(totals.actual,[day]),scheduled=intersect(totals.scheduled,[day]),paidAbsence=intersect(totals.paidAbsence,[day]),approvedOvertime=intersect(approved,[day]);
  if(rate && rate.currency!==p.currency)blockers.push(`Currency mismatch on ${date}`);
  if(rate && rate.payType!=="HOURLY" && seconds(approvedOvertime)>0 && rate.overtimeHourlyEquivalent===null)blockers.push(`Agreed overtime hourly equivalent missing on ${date}`);
  if(rate?.payType==="DAILY" && !seconds(scheduled) && seconds(actual) && !adjustments.some(a=>a.status==="APPROVED" && a.type==="OTHER"))blockers.push(`Daily unscheduled work on ${date} needs a reviewed manual adjustment`);
  days.push({date,employmentPeriodId:stint.id,rate,actual,scheduled,paidAbsence,approvedOvertime});
 }
 return {employeeId,period:{id:p.id,from,until,timezone:zone,currency:p.currency,inputRevision:p.inputRevision},days,
  sources:{...totals.sourceFacts,compensation:rateFacts,employment:stints.map(s=>({id:s.id,startDate:dateKey(s.startDate),endDate:s.endDate?dateKey(s.endDate):null,revision:s.revision})),overtime:weeks},
  commissions:commissions.filter(c=>c.status!=="PENDING").map(c=>({id:c.id,reference:c.reference,amount:c.commissionAmount.toFixed(2),revision:c.revision,orderAt:c.orderAt.toISOString()})),
  adjustments:adjustments.filter(a=>a.status==="APPROVED").map(a=>({id:a.id,type:a.type,amount:a.amount.toFixed(2),reason:a.reason,revision:a.revision,commissionRelated:a.commissionRelated})),blockers:[...new Set(blockers)]};
}
export async function capturePeriod(tx:Database,p:SalaryPeriod,now:Date) {
 const ids=await payrollRoster(tx,p),inputs=[];
 for(const id of ids)inputs.push(await captureEmployee(tx,p,id,now));
 const unassigned=await tx.preorder.count({where:{includedSalaryCalculationId:null,status:{in:["PENDING","APPROVED"]},salaryPeriodId:null,orderAt:{lt:dayStart(dateKey(p.endDate),p.timezoneSnapshot)}}});
 if(unassigned)for(const input of inputs)input.blockers.push("Unassigned pre-orders require authorized assignment or explicit deferral");
 return {ids,inputs,unassigned};
}
