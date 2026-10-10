import "server-only";
import type { Database } from "@/lib/db/audit";
import { addDays, dateKey, dateValue, dayStart, weekday } from "@/features/time/dates";
import { patternInclude } from "@/features/time/schedules";
import { occurrence } from "@/features/time/occurrences";
import { AppError } from "@/lib/utils/errors";
import { interval, union, intersect, subtract, seconds, windowFor, attendanceMetrics, policyFor, localWeek, tail, type Interval } from "./calculation";
export async function summary(tx:Database, employeeId:string, from:string, until:string, now:Date, includeSources=false) {
 const settings=await tx.organizationSettings.findUniqueOrThrow({where:{id:1}}), zone=settings.timezone;
 const window=interval(dayStart(from,zone),dayStart(until,zone)), nowSeconds=now.getTime()/1000;
 const low=dateValue(addDays(from,-1)),high=dateValue(addDays(until,1));
 // Resolve full overnight occurrences and their coverage before clipping reporting quantities.
 const sourceWindow=interval(dayStart(addDays(from,-1),zone),dayStart(addDays(until,1),zone));
 const [patterns,sessions,leaves,holidays,pending,periods]=await Promise.all([
  tx.workSchedule.findMany({where:{employeeId,supersededAt:null,effectiveFrom:{lt:dateValue(until)},OR:[{effectiveUntil:null},{effectiveUntil:{gt:low}}]},include:patternInclude,orderBy:{effectiveFrom:"asc"}}),
  tx.attendanceSession.findMany({orderBy:[{checkinAt:"asc"},{id:"asc"}],where:{employeeId,voidedAt:null,checkinAt:{lt:new Date(sourceWindow.end*1000)},OR:[{checkoutAt:null},{checkoutAt:{gt:new Date(sourceWindow.start*1000)}}]},select:{id:true,checkinAt:true,checkoutAt:true,scheduledEndAt:true,workDate:true,source:true,revision:true,employmentPeriodId:true}}),
  tx.leaveRequest.findMany({orderBy:[{startAt:"asc"},{id:"asc"}],where:{employeeId,status:"APPROVED",startAt:{lt:new Date(sourceWindow.end*1000)},endAt:{gt:new Date(sourceWindow.start*1000)}}}),
  tx.calendarDay.findMany({orderBy:{localDate:"asc"},where:{localDate:{gte:low,lt:high}}}),
  tx.attendanceCorrection.findMany({where:{employeeId,status:"PENDING"},select:{id:true,sessionId:true,workDate:true,proposedCheckinAt:true,proposedCheckoutAt:true}}),
  tx.employmentPeriod.findMany({where:{employeeId}})
 ]);
 const actualSource=union(sessions.filter(s=>s.checkoutAt).map(s=>interval(s.checkinAt,s.checkoutAt!)));
 const openSource=union(sessions.filter(s=>!s.checkoutAt).map(s=>interval(s.checkinAt,new Date(Math.max(now.getTime(),s.checkinAt.getTime()+1000)))));
 const actual=intersect(actualSource,[window]),open=intersect(openSource,[window]);
 const scheduled:Interval[]=[],required:Interval[]=[],late:Interval[]=[],early:Interval[]=[],endedMissing:Interval[]=[];
 const holidayCredit:Interval[]=[];
 const occurrences:{required:Interval[];ended:boolean;absent:boolean}[]=[],issues:string[]=[];
 const leaveIntervals=leaves.map(l=>interval(l.startAt,l.endAt));
 const holidayIntervals=holidays.map(h=>windowFor(dateKey(h.localDate),1,zone));
 for(let date=addDays(from,-1);date<until;date=addDays(date,1)) for(const pattern of patterns) for(const slot of pattern.slots.filter(s=>s.weekday===weekday(date))) {
  try {
   const o=occurrence(pattern,slot,date,zone,settings.earlyCheckinMinutes);if(!o)continue;
   const span=interval(o.scheduledStartAt,o.eligibleEndAt),remaining=subtract([span],[...leaveIntervals,...(pattern.holidayWorkRequired?[]:holidayIntervals)]);
   const ended=o.eligibleEndAt<=now;
   if(!pattern.holidayWorkRequired)holidayCredit.push(...intersect([span],holidayIntervals));
   scheduled.push(...intersect([span],[window]));required.push(...intersect(remaining,[window]));
   occurrences.push({required:remaining,ended,absent:ended && remaining.length>0 && !seconds(intersect(actualSource,remaining)) && !seconds(intersect(openSource,remaining))});
   if(ended)endedMissing.push(...subtract(remaining,actualSource));
   for(const r of remaining){const coverage=intersect(actualSource,[r]);if(!coverage.length)continue;
    late.push({start:r.start,end:coverage[0].start});
    if(ended && !seconds(intersect(openSource,[r])))early.push({start:coverage.at(-1)!.end,end:r.end});
   }
  }catch(error){if(!(error instanceof AppError))throw error;issues.push(`${date}: ${error.message}`);}
 }
 const employment=periods.map(p=>interval(dayStart(dateKey(p.startDate),zone),p.endDate?dayStart(dateKey(p.endDate),zone):new Date(sourceWindow.end*1000)));
 const leaveConflictSeconds=seconds(intersect(actual,leaveIntervals)),outsideEmploymentSeconds=seconds(subtract(actual,employment));
 const excused=subtract(scheduled,required);
 const paidAbsence=intersect(subtract(union([...intersect(scheduled,leaves.filter(l=>l.type==="PAID").map(l=>interval(l.startAt,l.endAt))),...holidayCredit]),[...actualSource,...leaves.filter(l=>l.type==="UNPAID").map(l=>interval(l.startAt,l.endAt))]),[window]);
 const requestTouches=(r:typeof pending[number],report:Interval,date?:string)=>{
  if(date && dateKey(r.workDate)===date)return true;
  if(r.proposedCheckinAt && r.proposedCheckoutAt && seconds(intersect([interval(r.proposedCheckinAt,r.proposedCheckoutAt)],[report])))return true;
  const target=sessions.find(s=>s.id===r.sessionId);
  return !!target && target.checkinAt.getTime()/1000<report.end && (!target.checkoutAt || target.checkoutAt.getTime()/1000>report.start);
 };
 const days=[];
 for(let date=from;date<until;date=addDays(date,1)) {
  const day=windowFor(date,1,zone),scheduledDay=intersect(scheduled,[day]),actualDay=intersect(actual,[day]),openDay=intersect(open,[day]);
  const metrics=attendanceMetrics(scheduledDay,excused,actualDay,openDay,nowSeconds);
  const daySessions=sessions.filter(s=>s.checkinAt.getTime()/1000<day.end && (!s.checkoutAt || s.checkoutAt.getTime()/1000>day.start));
  days.push({date,...metrics,lateSeconds:seconds(intersect(late,[day])),earlySeconds:seconds(intersect(early,[day])),
   absenceCount:occurrences.filter(o=>o.absent && seconds(intersect(o.required,[day]))>0).length,missingEndedSeconds:seconds(intersect(endedMissing,[day])),
   pendingCorrections:pending.filter(r=>requestTouches(r,day,date)).length,
   openCount:day.start<nowSeconds?daySessions.filter(s=>!s.checkoutAt).length:0,
   incompleteCount:day.start<nowSeconds?daySessions.filter(s=>!s.checkoutAt && (s.scheduledEndAt?now>s.scheduledEndAt:true)).length:0,
   sessionIds:daySessions.map(s=>s.id)});
 }
 const reportingSessions=sessions.filter(s=>s.checkinAt.getTime()/1000<window.end && (!s.checkoutAt || s.checkoutAt.getTime()/1000>window.start));
 return {from,until,timezone:zone,days,paidAbsence,sourceFacts:includeSources?{attendance:sessions.map(s=>({...s,checkinAt:s.checkinAt.toISOString(),checkoutAt:s.checkoutAt?.toISOString()??null,scheduledEndAt:s.scheduledEndAt?.toISOString()??null,workDate:dateKey(s.workDate)})),schedules:patterns.map(p=>({id:p.id,employmentPeriodId:p.employmentPeriodId,effectiveFrom:dateKey(p.effectiveFrom),effectiveUntil:p.effectiveUntil?dateKey(p.effectiveUntil):null,revision:p.revision,holidayWorkRequired:p.holidayWorkRequired,slots:p.slots.map(({id,weekday,startMinute,endMinute,endDayOffset})=>({id,weekday,startMinute,endMinute,endDayOffset}))})),leave:leaves.map(l=>({id:l.id,employmentPeriodId:l.employmentPeriodId,type:l.type,startAt:l.startAt.toISOString(),endAt:l.endAt.toISOString(),revision:l.revision})),holidays:holidays.map(h=>({id:h.id,date:dateKey(h.localDate),revision:h.revision}))}:undefined,actual:union(actual),scheduled:union(scheduled),actualSeconds:seconds(actual),scheduledSeconds:seconds(scheduled),requiredSeconds:seconds(required),
  pendingCorrections:pending.filter(r=>requestTouches(r,window) || dateKey(r.workDate)>=from && dateKey(r.workDate)<until).length,
  openCount:reportingSessions.filter(s=>!s.checkoutAt).length,leaveConflictSeconds,outsideEmploymentSeconds,issues};
}
export async function weekCalculation(tx:Database,employeeId:string,date:string,now:Date) {
 const settings=await tx.organizationSettings.findUniqueOrThrow({where:{id:1}}),week=localWeek(date,settings.weekStartDay),end=addDays(week,7);
 const totals=await summary(tx,employeeId,week,end,now),policy=policyFor(settings.overtimePolicyVersions,week);
 const potentialSeconds=Math.max(0,totals.actualSeconds-policy.thresholdSeconds);
 const blockers=[...(totals.openCount?["Missing checkout"]:[]),...(totals.pendingCorrections?["Pending corrections"]:[]),...(totals.leaveConflictSeconds?["Work overlaps approved leave"]:[]),...(totals.outsideEmploymentSeconds?["Work extends outside employment"]:[]),...totals.issues];
 return {...totals,week,weekEnd:end,thresholdSeconds:policy.thresholdSeconds,policyVersion:policy.ruleVersion,potentialSeconds,candidates:tail(totals.actual,potentialSeconds),ended:now>=dayStart(end,settings.timezone),blockers};
}
