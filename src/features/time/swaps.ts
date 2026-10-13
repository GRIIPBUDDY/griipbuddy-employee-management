import "server-only";
import { stableFingerprint } from "@/lib/utils/fingerprint";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit,type Database } from "@/lib/db/audit";
import { authorizedMutation } from "@/lib/db/mutation";
import { securityBoundary } from "@/lib/authorization/actor";
import { assertOperational,assertRole } from "@/lib/authorization/policy";
import { validated,uuidSchema,dateSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import type { Identity,Actor } from "@/types/auth";
import type { Prisma } from "@/generated/prisma/client";
import { databaseNow } from "./clock";
import { dateKey,dateValue,localDate,addDays,weekday } from "./dates";
import { occurrence } from "./occurrences";
import { patternInclude,publishScheduleInTransaction,timeEvent } from "./schedules";
import { notify } from "@/features/review/notifications";
import { requireModule } from "@/features/settings/config";
const requestSchema=z.object({requesterSlotId:uuidSchema,requesterDate:dateSchema,partnerEmployeeId:uuidSchema,partnerSlotId:uuidSchema,partnerDate:dateSchema,reason:z.string().trim().min(1).max(500),operationKey:uuidSchema}).strict();
const consentSchema=z.object({id:uuidSchema,revision:z.number().int().positive(),accept:z.boolean(),comment:z.string().trim().max(500).default("")}).strict();
const decisionSchema=z.object({id:uuidSchema,revision:z.number().int().positive(),approve:z.boolean(),comment:z.string().trim().min(1).max(500)}).strict();
type Selection={employeeId:string;slotId:string;date:string};
const slotFact=(s:{weekday:number;startMinute:number;endMinute:number;endDayOffset:number})=>({weekday:s.weekday,startMinute:s.startMinute,endMinute:s.endMinute,endDayOffset:s.endDayOffset});
async function selection(tx:Database,v:Selection,now:Date){
 const settings=await tx.organizationSettings.findUniqueOrThrow({where:{id:1}}),today=localDate(now,settings.timezone);
 if(v.date<=today)throw new AppError(409,"SWAP_PAST","Choose an unstarted date after today.");
 const e=await tx.employee.findFirst({where:{id:v.employeeId,user:{role:"EMPLOYEE",isActive:true,accountStatus:"ACTIVE"}},select:{id:true,userId:true}});if(!e)throw new AppError(409,"SWAP_INELIGIBLE","Both employees must have active employee accounts.");
 const slot=await tx.scheduleSlot.findFirst({where:{id:v.slotId,workSchedule:{employeeId:v.employeeId,supersededAt:null}},include:{workSchedule:{include:patternInclude}}}),o=slot?occurrence(slot.workSchedule,slot,v.date,settings.timezone,settings.earlyCheckinMinutes):null;
 if(!slot || !o || o.scheduledStartAt<=now)throw new AppError(409,"SWAP_STALE","The selected future assigned occurrence is unavailable.");
 if(await tx.attendanceSession.count({where:{employeeId:v.employeeId,voidedAt:null,OR:[{scheduleSlotId:slot.id,workDate:dateValue(v.date)},{checkinAt:{lt:o.eligibleEndAt},OR:[{checkoutAt:null},{checkoutAt:{gt:o.scheduledStartAt}}]}]}}))throw new AppError(409,"ATTENDANCE_STARTED","Attendance already intersects this occurrence.");
 return {e,slot,o,settings};
}
async function swapFacts(tx:Database,a:Selection,b:Selection,now:Date){
 const left=await selection(tx,a,now),right=await selection(tx,b,now),days=[...new Set([a.date,b.date])].sort(),patterns=[];
 for(const employeeId of [a.employeeId,b.employeeId].sort())for(const date of days){const p=await tx.workSchedule.findFirst({where:{employeeId,supersededAt:null,effectiveFrom:{lte:dateValue(date)},OR:[{effectiveUntil:null},{effectiveUntil:{gt:dateValue(date)}}]},include:patternInclude});patterns.push({employeeId,date,pattern:p?{id:p.id,revision:p.revision,slots:p.slots.map(s=>({id:s.id,...slotFact(s)}))}:null});}
 const snapshot={a:{...a,revision:left.slot.workSchedule.revision,start:left.o.scheduledStartAt.toISOString(),end:left.o.scheduledEndAt.toISOString()},b:{...b,revision:right.slot.workSchedule.revision,start:right.o.scheduledStartAt.toISOString(),end:right.o.scheduledEndAt.toISOString()},patterns};
 return {left,right,snapshot};
}
const fingerprint=stableFingerprint;
async function conflicting(tx:Database,a:Selection,b:Selection,except?:string){
 return tx.shiftSwapRequest.findFirst({where:{...(except?{id:{not:except}}:{}),status:{in:["AWAITING_PARTNER","ACCEPTED","APPROVED"]},OR:[{requesterSlotId:a.slotId,requesterDate:dateValue(a.date)},{partnerSlotId:a.slotId,partnerDate:dateValue(a.date)},{requesterSlotId:b.slotId,requesterDate:dateValue(b.date)},{partnerSlotId:b.slotId,partnerDate:dateValue(b.date)}]}});
}
export async function requestSwap(identity:Identity|null,input:unknown){await requireModule("shiftSwaps");
 await securityBoundary(identity,async a=>{assertOperational(a);if(a.role!=="EMPLOYEE" || !a.employeeId || !a.employmentActive)throw new AppError(403,"ROLE_DENIED","Active employee access is required.");});const v=validated(requestSchema,input);
 return authorizedMutation(identity,async(actor,tx)=>{
  assertOperational(actor);if(actor.role!=="EMPLOYEE" || !actor.employeeId || !actor.employmentActive || actor.employeeId===v.partnerEmployeeId)throw new AppError(403,"SWAP_INELIGIBLE","Choose another active employee's future session.");
  const old=await tx.shiftSwapRequest.findUnique({where:{operationKey:v.operationKey}});if(old){if(old.requesterEmployeeId!==actor.employeeId || old.requesterSlotId!==v.requesterSlotId || dateKey(old.requesterDate)!==v.requesterDate || old.partnerEmployeeId!==v.partnerEmployeeId || old.partnerSlotId!==v.partnerSlotId || dateKey(old.partnerDate)!==v.partnerDate || old.reason!==v.reason)throw new AppError(409,"OPERATION_REUSED","Request key belongs to another proposal.");return old.id;}
  const a={employeeId:actor.employeeId,slotId:v.requesterSlotId,date:v.requesterDate},b={employeeId:v.partnerEmployeeId,slotId:v.partnerSlotId,date:v.partnerDate},now=await databaseNow(tx);
  if(await conflicting(tx,a,b))throw new AppError(409,"SWAP_CONFLICT","A selected occurrence already has an open or approved swap.");
  const facts=await swapFacts(tx,a,b,now),r=await tx.shiftSwapRequest.create({data:{...v,requesterEmployeeId:a.employeeId,requesterDate:dateValue(v.requesterDate),partnerDate:dateValue(v.partnerDate),requestedBy:actor.userId,sourceSnapshot:JSON.parse(JSON.stringify(facts.snapshot)) as Prisma.InputJsonObject}});
  await audit({actorUserId:actor.userId,employeeId:a.employeeId,action:"SHIFT_SWAP_REQUESTED",entity:"shift_swap_requests",entityId:r.id,reason:v.reason,after:{partnerEmployeeId:b.employeeId,requesterDate:v.requesterDate,partnerDate:v.partnerDate}},tx);
  await notify(tx,b.employeeId,"SHIFT_SWAP_CONSENT","shift_swap_requests",r.id,`swap-consent:${r.id}`,"A colleague has requested a shift swap. Your consent is required.");return r.id;
 });
}
export async function consentSwap(identity:Identity|null,input:unknown){await requireModule("shiftSwaps");
 await securityBoundary(identity,async a=>assertOperational(a));const v=validated(consentSchema,input);
 return authorizedMutation(identity,async(a,tx)=>{
  assertOperational(a);const r=await tx.shiftSwapRequest.findFirst({where:{id:v.id,partnerEmployeeId:a.employeeId??"00000000-0000-0000-0000-000000000000"}});if(!r)throw new AppError(404,"NOT_FOUND","Swap request not found.");
  if(r.revision!==v.revision || r.status!=="AWAITING_PARTNER")throw new AppError(409,"STALE","Refresh this pending request.");const now=await databaseNow(tx);
  if(v.accept){const facts=await swapFacts(tx,{employeeId:r.requesterEmployeeId,slotId:r.requesterSlotId,date:dateKey(r.requesterDate)},{employeeId:r.partnerEmployeeId,slotId:r.partnerSlotId,date:dateKey(r.partnerDate)},now);if(fingerprint(facts.snapshot)!==fingerprint(r.sourceSnapshot))throw new AppError(409,"SWAP_STALE","Assignments changed. Submit a new swap request.");}
  await tx.shiftSwapRequest.update({where:{id:r.id},data:{status:v.accept?"ACCEPTED":"DECLINED",partnerComment:v.comment,...(v.accept?{acceptedBy:a.userId,acceptedAt:now}:{}),revision:{increment:1}}});await audit({actorUserId:a.userId,employeeId:r.partnerEmployeeId,action:v.accept?"SHIFT_SWAP_ACCEPTED":"SHIFT_SWAP_DECLINED",entity:"shift_swap_requests",entityId:r.id,reason:v.comment,after:{consent:v.accept}},tx);
  await notify(tx,r.requesterEmployeeId,"SHIFT_SWAP_CONSENT_DECIDED","shift_swap_requests",r.id,`swap-consent-decided:${r.id}`,v.accept?"Your shift swap was accepted and awaits staff review.":"Your shift swap was declined.");if(v.accept)await notify(tx,r.requesterEmployeeId,"STAFF_SHIFT_SWAP_PENDING","shift_swap_requests",r.id,`swap-review:${r.id}`,"A consented shift swap needs approval.",true);
 });
}
async function exchange(tx:Database,actor:Actor,own:Selection,peer:Selection,peerSlot:{startMinute:number;endMinute:number;endDayOffset:number},ownSlot:{startMinute:number;endMinute:number;endDayOffset:number},reason:string,now:Date){
 for(const date of [...new Set([own.date,peer.date])].sort()){
  const base=await tx.workSchedule.findFirst({where:{employeeId:own.employeeId,supersededAt:null,effectiveFrom:{lte:dateValue(date)},OR:[{effectiveUntil:null},{effectiveUntil:{gt:dateValue(date)}}]},include:patternInclude});
  const stint=await tx.employmentPeriod.findFirst({where:{employeeId:own.employeeId,startDate:{lte:dateValue(date)},OR:[{endDate:null},{endDate:{gt:dateValue(date)}}]}});if(!stint)throw new AppError(409,"SWAP_EMPLOYMENT","The exchanged date must fit each employee's employment.");
  const slots=(base?.slots??[]).filter(s=>!(date===own.date && (s.id===own.slotId || s.weekday===weekday(date) && s.startMinute===ownSlot.startMinute && s.endMinute===ownSlot.endMinute && s.endDayOffset===ownSlot.endDayOffset))).map(slotFact);if(date===peer.date)slots.push({...slotFact({...peerSlot,weekday:weekday(date)})});
  await publishScheduleInTransaction(actor,tx,{employeeId:own.employeeId,employmentPeriodId:stint.id,effectiveFrom:date,effectiveUntil:addDays(date,1),baseScheduleId:base?.id??null,baseRevision:base?.revision,duration:"CUSTOM",editScope:"OCCURRENCE",slots,restoreSlots:base?.slots.map(slotFact),label:"Approved shift swap",reason,holidayWorkRequired:base?.holidayWorkRequired??false});
 }
 void now;
}
export async function decideSwap(identity:Identity|null,input:unknown){await requireModule("shiftSwaps");
 await securityBoundary(identity,async a=>assertRole(a,["ADMIN","HR_MANAGER"]));const v=validated(decisionSchema,input);
 return authorizedMutation(identity,async(a,tx)=>{
  assertRole(a,["ADMIN","HR_MANAGER"]);const r=await tx.shiftSwapRequest.findUnique({where:{id:v.id}});if(!r)throw new AppError(404,"NOT_FOUND","Swap request not found.");
  if(a.employeeId===r.requesterEmployeeId || a.employeeId===r.partnerEmployeeId || a.userId===r.requestedBy || a.userId===r.acceptedBy)throw new AppError(403,"SELF_REVIEW","A distinct authorized staff member must review the swap.");
  if((v.approve?r.status!=="ACCEPTED":!["AWAITING_PARTNER","ACCEPTED"].includes(r.status)) || r.revision!==v.revision)throw new AppError(409,"STALE","Partner consent and a current revision are required.");
  const left={employeeId:r.requesterEmployeeId,slotId:r.requesterSlotId,date:dateKey(r.requesterDate)},right={employeeId:r.partnerEmployeeId,slotId:r.partnerSlotId,date:dateKey(r.partnerDate)},now=await databaseNow(tx);
  if(v.approve){
   const facts=await swapFacts(tx,left,right,now);if(fingerprint(facts.snapshot)!==fingerprint(r.sourceSnapshot) || await conflicting(tx,left,right,r.id))throw new AppError(409,"SWAP_STALE","Assignments changed or another swap conflicts. Submit a new request.");
   await exchange(tx,a,left,right,facts.right.slot,facts.left.slot,v.comment,now);await exchange(tx,a,right,left,facts.left.slot,facts.right.slot,v.comment,now);
  }
  await tx.shiftSwapRequest.update({where:{id:r.id},data:{status:v.approve?"APPROVED":"REJECTED",reviewedBy:a.userId,reviewedAt:now,reviewComment:v.comment,revision:{increment:1}}});
  await audit({actorUserId:a.userId,employeeId:r.requesterEmployeeId,action:v.approve?"SHIFT_SWAP_APPROVED":"SHIFT_SWAP_REJECTED",entity:"shift_swap_requests",entityId:r.id,reason:v.comment,after:{partnerEmployeeId:r.partnerEmployeeId,approved:v.approve}},tx);
  for(const employeeId of [r.requesterEmployeeId,r.partnerEmployeeId]){await timeEvent(tx,employeeId,a.userId,now,"SHIFT_SWAP_REVIEWED","Shift swap reviewed","shift_swap_requests",r.id);await notify(tx,employeeId,"SHIFT_SWAP_REVIEWED","shift_swap_requests",r.id,`swap-decided:${r.id}`,v.approve?"Your shift swap was approved and the dated assignments were updated.":"Your shift swap was rejected.");}
 });
}
export async function swapData(identity:Identity|null,staff=false){await requireModule("shiftSwaps");return securityBoundary(identity,async a=>{
 if(staff)assertRole(a,["ADMIN","HR_MANAGER"]);const rows=await db.shiftSwapRequest.findMany({where:staff?{}:{OR:[{requesterEmployeeId:a.employeeId??"00000000-0000-0000-0000-000000000000"},{partnerEmployeeId:a.employeeId??"00000000-0000-0000-0000-000000000000"}]},orderBy:{createdAt:"desc"},take:100});
 return {employeeId:a.employeeId,operational:a.accountStatus!=="ON_HOLD",records:await Promise.all(rows.map(async r=>({...r,sourceSnapshot:undefined,reviewComment:staff?r.reviewComment:undefined,requester:await db.employee.findUniqueOrThrow({where:{id:r.requesterEmployeeId},select:{legalName:true}}),partner:await db.employee.findUniqueOrThrow({where:{id:r.partnerEmployeeId},select:{legalName:true}})})))};
});}
export async function swapOptions(identity:Identity|null){await requireModule("shiftSwaps");return securityBoundary(identity,async a=>{
 if(!a.employeeId || a.role!=="EMPLOYEE")return [];
 const settings=await db.organizationSettings.findUniqueOrThrow({where:{id:1}}),now=await databaseNow(db),today=localDate(now,settings.timezone),until=addDays(today,29),employees=await db.employee.findMany({where:{user:{role:"EMPLOYEE",isActive:true,accountStatus:"ACTIVE"}},take:100,orderBy:{legalName:"asc"},select:{id:true,legalName:true}}),result=[];
 for(const e of employees){const patterns=await db.workSchedule.findMany({where:{employeeId:e.id,supersededAt:null,effectiveFrom:{lt:dateValue(until)},OR:[{effectiveUntil:null},{effectiveUntil:{gt:dateValue(today)}}]},include:patternInclude});for(let date=addDays(today,1);date<until;date=addDays(date,1))for(const p of patterns)for(const slot of p.slots){const o=occurrence(p,slot,date,settings.timezone,settings.earlyCheckinMinutes);if(o)result.push({employeeId:e.id,name:e.legalName,slotId:slot.id,date,start:o.scheduledStartAt,end:o.scheduledEndAt,own:e.id===a.employeeId});}}
 return result;
});}
