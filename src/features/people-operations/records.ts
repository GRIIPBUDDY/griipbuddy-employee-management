import "server-only";
import {db} from "@/lib/db/client";
import {audit,type Database} from "@/lib/db/audit";
import {authorizedMutation} from "@/lib/db/mutation";
import {securityBoundary} from "@/lib/authorization/actor";
import {validated,uuidSchema} from "@/lib/validation/schemas";
import {AppError} from "@/lib/utils/errors";
import {dateValue,dateKey,localDate} from "@/features/time/dates";
import {databaseNow} from "@/features/time/clock";
import {peopleEvent} from "@/features/people/service";
import {notify} from "@/features/review/notifications";
import type {Identity} from "@/types/auth";
import {peopleStaff,publisher,publishedWarning,documentParentVisible} from "./access";
import {performanceSchema,performanceEditSchema,warningSchema,warningEditSchema,recordCommandSchema,recordListSchema,ownListSchema} from "./validation";
import { requireModule } from "@/features/settings/config";
export type RecordKind="performance"|"warnings";
const entity=(kind:RecordKind)=>kind==="performance"?"performance_reviews":"disciplinary_records";
async function coverage(tx:Database,employeeId:string,stintId:string,from:string,until?:string){
 const s=await tx.employmentPeriod.findFirst({where:{id:stintId,employeeId}});
 if(!s||dateValue(from)<s.startDate||s.endDate&&(until?dateValue(until)>s.endDate:dateValue(from)>=s.endDate))throw new AppError(400,"EMPLOYMENT_COVERAGE","Choose dates within the selected employment period.");
}
async function attachment(tx:Database,employeeId:string,id:string|null){if(id&&(!await tx.employeeDocument.findFirst({where:{id,employeeId,deletedAt:null},select:{id:true}})||await tx.employee.count({where:{id:employeeId,photoDocumentId:id}})))throw new AppError(400,"ATTACHMENT","Choose a current document for this employee, excluding profile photos.");}
export async function createRecord(identity:Identity|null,kind:RecordKind,input:unknown){await requireModule(kind==="performance"?"performance":"warnings");
 await securityBoundary(identity,async a=>peopleStaff(a));
 if(kind==="performance"){
  const v=validated(performanceSchema,input);return authorizedMutation(identity,async(actor,tx)=>{peopleStaff(actor);await coverage(tx,v.employeeId,v.employmentPeriodId,v.startDate,v.endDate);
   const row=await tx.performanceReview.create({data:{...v,startDate:dateValue(v.startDate),endDate:dateValue(v.endDate),createdBy:actor.userId}});
   await audit({actorUserId:actor.userId,employeeId:row.employeeId,action:"PERFORMANCE_CREATED",entity:entity(kind),entityId:row.id,after:v},tx);return row.id;});
 }
 const v=validated(warningSchema,input);return authorizedMutation(identity,async(actor,tx)=>{peopleStaff(actor);await coverage(tx,v.employeeId,v.employmentPeriodId,v.issueDate);await attachment(tx,v.employeeId,v.attachmentDocumentId);
  const row=await tx.disciplinaryRecord.create({data:{...v,issueDate:dateValue(v.issueDate),issuedBy:actor.userId}});
  await audit({actorUserId:actor.userId,employeeId:row.employeeId,action:"WARNING_CREATED",entity:entity(kind),entityId:row.id,after:v},tx);return row.id;});
}
export async function editRecord(identity:Identity|null,kind:RecordKind,input:unknown){await requireModule(kind==="performance"?"performance":"warnings");
 await securityBoundary(identity,async a=>peopleStaff(a));
 if(kind==="performance"){
  const v=validated(performanceEditSchema,input);return authorizedMutation(identity,async(actor,tx)=>{peopleStaff(actor);const old=await tx.performanceReview.findUnique({where:{id:v.id}});if(!old)throw new AppError(404,"NOT_FOUND","Review not found.");
   if(old.revision!==v.revision)throw new AppError(409,"STALE","Refresh this review before editing.");
   if(old.employeeId!==v.data.employeeId||old.employmentPeriodId!==v.data.employmentPeriodId)throw new AppError(400,"OWNERSHIP","Record ownership cannot change.");
   await coverage(tx,old.employeeId,old.employmentPeriodId,v.data.startDate,v.data.endDate);
   if(old.publishedAt){publisher(actor,old.employeeId);if(!v.correctionReason)throw new AppError(400,"CORRECTION_REASON","Explain this official correction.");if(!v.data.overallRating)throw new AppError(400,"RATING","Published reviews require an overall rating.");await tx.$executeRaw`SELECT set_config('app.people_correction_id',${old.id},true)`;}
   await tx.performanceReview.update({where:{id:old.id},data:{...v.data,startDate:dateValue(v.data.startDate),endDate:dateValue(v.data.endDate),revision:{increment:1}}});
   await audit({actorUserId:actor.userId,employeeId:old.employeeId,action:old.publishedAt?"PERFORMANCE_CORRECTED":"PERFORMANCE_DRAFT_CHANGED",entity:entity(kind),entityId:old.id,reason:v.correctionReason,before:JSON.parse(JSON.stringify(old)),after:v.data},tx);
   if(old.publishedAt)await recordEvent(tx,actor.userId,kind,old.id,old.employeeId,v.data.employeeVisible,"PERFORMANCE_CORRECTED","Performance review corrected",old.revision+1);
  });
 }
 const v=validated(warningEditSchema,input);return authorizedMutation(identity,async(actor,tx)=>{peopleStaff(actor);const old=await tx.disciplinaryRecord.findUnique({where:{id:v.id}});if(!old)throw new AppError(404,"NOT_FOUND","Warning not found.");
  if(old.revision!==v.revision||old.revokedAt)throw new AppError(409,"STALE","Refresh a current warning before editing.");
  if(old.employeeId!==v.data.employeeId||old.employmentPeriodId!==v.data.employmentPeriodId)throw new AppError(400,"OWNERSHIP","Record ownership cannot change.");
  await coverage(tx,old.employeeId,old.employmentPeriodId,v.data.issueDate);await attachment(tx,old.employeeId,v.data.attachmentDocumentId);
  if(old.publishedAt){publisher(actor,old.employeeId);if(!v.correctionReason)throw new AppError(400,"CORRECTION_REASON","Explain this official correction.");await tx.$executeRaw`SELECT set_config('app.people_correction_id',${old.id},true)`;}
  await tx.disciplinaryRecord.update({where:{id:old.id},data:{...v.data,issueDate:dateValue(v.data.issueDate),acknowledgedAt:null,acknowledgedBy:null,revision:{increment:1}}});
  await audit({actorUserId:actor.userId,employeeId:old.employeeId,action:old.publishedAt?"WARNING_CORRECTED":"WARNING_DRAFT_CHANGED",entity:entity(kind),entityId:old.id,reason:v.correctionReason,before:JSON.parse(JSON.stringify(old)),after:v.data},tx);
  if(old.publishedAt)await recordEvent(tx,actor.userId,kind,old.id,old.employeeId,v.data.employeeVisible,"WARNING_CORRECTED","Official notice corrected; previous receipt retained in audit",old.revision+1);
 });
}
async function recordEvent(tx:Database,userId:string,kind:RecordKind,id:string,employeeId:string,visible:boolean,type:string,title:string,revision:number){
 await peopleEvent(tx,{employeeId,actorUserId:userId,type,title,sourceType:entity(kind),sourceId:id,employeeVisible:visible});
 if(visible)await notify(tx,employeeId,type,entity(kind),id,`${kind}:${id}:${revision}`,kind==="performance"?"A performance review is available.":"An official notice is available. Any acknowledgement confirms receipt only.");
}
export async function publishRecord(identity:Identity|null,kind:RecordKind,input:unknown){await requireModule(kind==="performance"?"performance":"warnings");
 await securityBoundary(identity,async a=>peopleStaff(a));const v=validated(recordCommandSchema,input);
 return authorizedMutation(identity,async(actor,tx)=>{
  const row=kind==="performance"?await tx.performanceReview.findUnique({where:{id:v.id}}):await tx.disciplinaryRecord.findUnique({where:{id:v.id}});
  if(!row)throw new AppError(404,"NOT_FOUND","Record not found.");publisher(actor,row.employeeId);
  if(row.revision!==v.revision||row.publishedAt)throw new AppError(409,"STALE","Refresh an unpublished draft before finalizing.");
  const now=await databaseNow(tx),tz=(await tx.organizationSettings.findUniqueOrThrow({where:{id:1}})).timezone;
  if(kind==="performance"){
   const r=await tx.performanceReview.findUniqueOrThrow({where:{id:row.id}});await coverage(tx,r.employeeId,r.employmentPeriodId,dateKey(r.startDate),dateKey(r.endDate));
   if(!r.overallRating)throw new AppError(400,"RATING","Choose an overall rating before finalization.");
   await tx.performanceReview.update({where:{id:r.id},data:{publishedAt:now,reviewedBy:actor.userId,revision:{increment:1}}});
  }else{
   const r=await tx.disciplinaryRecord.findUniqueOrThrow({where:{id:row.id}});await coverage(tx,r.employeeId,r.employmentPeriodId,dateKey(r.issueDate));await attachment(tx,r.employeeId,r.attachmentDocumentId);
   if(dateKey(r.issueDate)>localDate(now,tz))throw new AppError(400,"FUTURE_WARNING","Issue date cannot be in the future.");
   await tx.disciplinaryRecord.update({where:{id:r.id},data:{publishedAt:now,publishedBy:actor.userId,revision:{increment:1}}});
  }
  await audit({actorUserId:actor.userId,employeeId:row.employeeId,action:kind==="performance"?"PERFORMANCE_FINALIZED":"WARNING_ISSUED",entity:entity(kind),entityId:row.id,after:{publishedAt:now.toISOString(),employeeVisible:row.employeeVisible,revision:row.revision+1}},tx);
  await recordEvent(tx,actor.userId,kind,row.id,row.employeeId,row.employeeVisible,kind==="performance"?"PERFORMANCE_FINALIZED":"WARNING_ISSUED",kind==="performance"?"Performance review finalized":"Official notice issued",row.revision+1);
 });
}
export async function revokeWarning(identity:Identity|null,input:unknown){await requireModule("warnings");
 await securityBoundary(identity,async a=>peopleStaff(a));const v=validated(recordCommandSchema,input);
 return authorizedMutation(identity,async(actor,tx)=>{const row=await tx.disciplinaryRecord.findUnique({where:{id:v.id}});if(!row)throw new AppError(404,"NOT_FOUND","Warning not found.");publisher(actor,row.employeeId);
  if(!row.publishedAt||row.revokedAt||row.revision!==v.revision)throw new AppError(409,"STALE","Refresh a published current warning.");if(!v.reason)throw new AppError(400,"REASON","Explain revocation.");
  await tx.$executeRaw`SELECT set_config('app.people_correction_id',${row.id},true)`;
  await tx.disciplinaryRecord.update({where:{id:row.id},data:{revokedAt:await databaseNow(tx),revocationReason:v.reason,acknowledgedAt:null,acknowledgedBy:null,revision:{increment:1}}});
  await audit({actorUserId:actor.userId,employeeId:row.employeeId,action:"WARNING_REVOKED",entity:entity("warnings"),entityId:row.id,reason:v.reason,before:JSON.parse(JSON.stringify(row)),after:{revoked:true}},tx);
  await peopleEvent(tx,{employeeId:row.employeeId,actorUserId:actor.userId,type:"WARNING_REVOKED",title:"Official notice revoked",sourceType:entity("warnings"),sourceId:row.id,employeeVisible:false});
 });
}
export async function acknowledgeWarning(identity:Identity|null,input:unknown){await requireModule("warnings");
 const v=validated(recordCommandSchema,input);return authorizedMutation(identity,async(actor,tx)=>{
  const r=await tx.disciplinaryRecord.findFirst({where:{id:v.id,employeeId:actor.employeeId??"00000000-0000-0000-0000-000000000000",...publishedWarning}});if(!r)throw new AppError(404,"NOT_FOUND","Notice not found.");
  if(r.revision!==v.revision||!r.acknowledgementRequested)throw new AppError(409,"STALE","Refresh the current notice before acknowledging receipt.");if(r.acknowledgedAt)return;
  const now=await databaseNow(tx);await tx.disciplinaryRecord.update({where:{id:r.id},data:{acknowledgedAt:now,acknowledgedBy:actor.userId,revision:{increment:1}}});
  await audit({actorUserId:actor.userId,employeeId:r.employeeId,action:"WARNING_RECEIPT_ACKNOWLEDGED",entity:entity("warnings"),entityId:r.id,after:{recordRevision:r.revision,receiptOnly:true}},tx);
  await peopleEvent(tx,{employeeId:r.employeeId,actorUserId:actor.userId,type:"WARNING_RECEIPT_ACKNOWLEDGED",title:"Official notice receipt acknowledged; agreement not implied",sourceType:entity("warnings"),sourceId:r.id});
 });
}
export async function recordData(identity:Identity|null,kind:RecordKind,input:unknown={},staff=false){await requireModule(kind==="performance"?"performance":"warnings");
 return securityBoundary(identity,async actor=>{if(staff)peopleStaff(actor);const v=validated(staff?recordListSchema:ownListSchema,input),employeeId=staff?("employeeId" in v?v.employeeId:undefined):actor.employeeId??"00000000-0000-0000-0000-000000000000";
  const where={...(employeeId?{employeeId}:{}),...(v.id?{id:v.id}:{}),...(staff?v.status==="DRAFT"?{publishedAt:null}:v.status==="PUBLISHED"?{publishedAt:{not:null}}:{}:{publishedAt:{not:null},employeeVisible:true})};
  const rows=kind==="performance"?await db.performanceReview.findMany({where:{...where,...(v.from||v.until?{startDate:{...(v.until?{lt:dateValue(v.until)}:{})},endDate:{...(v.from?{gt:dateValue(v.from)}:{})}}:{})},orderBy:[{startDate:"desc"},{id:"desc"}],skip:(v.page-1)*25,take:26}):await db.disciplinaryRecord.findMany({where:{...where,...(!staff||v.status==="PUBLISHED"?{revokedAt:null}:v.status==="REVOKED"?{revokedAt:{not:null}}:{}),...(v.severity?{severity:v.severity}:{}),...(v.from||v.until?{issueDate:{...(v.from?{gte:dateValue(v.from)}:{}),...(v.until?{lt:dateValue(v.until)}:{})}}:{})},orderBy:[{issueDate:"desc"},{id:"desc"}],skip:(v.page-1)*25,take:26});
  if(v.id&&!rows.length)throw new AppError(404,"NOT_FOUND","Record not found.");
  const records=await Promise.all(rows.slice(0,25).map(async r=>{const employee=staff?await db.employee.findUniqueOrThrow({where:{id:r.employeeId},select:{legalName:true}}):null;const {staffNotes,...safe}=r;void staffNotes;const reviewerId="reviewedBy" in r?r.reviewedBy:r.issuedBy;const reviewer=reviewerId?await db.user.findUnique({where:{id:reviewerId},select:{displayName:true,employee:{select:{legalName:true}}}}):null;const reviewerName=reviewer?reviewer.displayName??reviewer.employee?.legalName??"Authorized staff":null;
   if(!staff){const {createdAt,updatedAt,employeeId,employmentPeriodId,...own}=safe;void employeeId;void employmentPeriodId;
    if("attachmentDocumentId" in own&&own.attachmentDocumentId){const doc=await db.employeeDocument.findFirst({where:{id:own.attachmentDocumentId,employeeId:r.employeeId,employeeVisible:true,deletedAt:null}});if(!doc||!await documentParentVisible(db,r.employeeId,own.attachmentDocumentId))own.attachmentDocumentId=null;}
    return {...own,createdAt,updatedAt,reviewerName,employee:null};}
   return {...r,employee,reviewerName,canPublish:actor.role==="ADMIN"||actor.employeeId!==r.employeeId};}));
  return {records,page:v.page,hasNext:rows.length>25};
 });
}
export async function recordOptions(identity:Identity|null,employeeInput?:unknown){
 return securityBoundary(identity,async a=>{peopleStaff(a);const employeeId=employeeInput===undefined?undefined:validated(uuidSchema,employeeInput);
  const photoId=employeeId?(await db.employee.findUnique({where:{id:employeeId},select:{photoDocumentId:true}}))?.photoDocumentId:null;
  return {employees:await db.employee.findMany({orderBy:{legalName:"asc"},take:200,select:{id:true,legalName:true}}),stints:employeeId?await db.employmentPeriod.findMany({where:{employeeId},orderBy:{startDate:"desc"},select:{id:true,startDate:true,endDate:true}}):[],documents:employeeId?await db.employeeDocument.findMany({where:{employeeId,deletedAt:null,...(photoId?{id:{not:photoId}}:{})},take:100,select:{id:true,displayName:true}}):[]};
 });
}
