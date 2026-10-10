import "server-only";
import {db} from "@/lib/db/client";
import {audit} from "@/lib/db/audit";
import {authorizedMutation} from "@/lib/db/mutation";
import {securityBoundary} from "@/lib/authorization/actor";
import {validated} from "@/lib/validation/schemas";
import {AppError} from "@/lib/utils/errors";
import {dateValue,dayStart,localDate} from "@/features/time/dates";
import {databaseNow} from "@/features/time/clock";
import {peopleEvent} from "@/features/people/service";
import {notify} from "@/features/review/notifications";
import type {Identity} from "@/types/auth";
import {peopleStaff} from "./access";
import {assetSchema,assetEditSchema,assetListSchema,assignmentListSchema,assignmentSchema,returnSchema} from "./validation";
async function conflicts<T>(op:()=>Promise<T>){try{return await op();}catch(e){if(e&&typeof e==="object"&&"code" in e&&e.code==="P2002")throw new AppError(409,"CONFLICT","Asset code or current assignment already exists. Refresh and retry.");throw e;}}
export async function createAsset(identity:Identity|null,input:unknown){
 await securityBoundary(identity,async a=>peopleStaff(a));const v=validated(assetSchema,input);
 return conflicts(()=>authorizedMutation(identity,async(actor,tx)=>{peopleStaff(actor);const r=await tx.asset.create({data:{...v,createdBy:actor.userId}});await audit({actorUserId:actor.userId,action:"ASSET_CREATED",entity:"assets",entityId:r.id,after:v},tx);return r.id;}));
}
export async function editAsset(identity:Identity|null,input:unknown){
 await securityBoundary(identity,async a=>peopleStaff(a));const v=validated(assetEditSchema,input);
 return conflicts(()=>authorizedMutation(identity,async(actor,tx)=>{peopleStaff(actor);await tx.$queryRaw`SELECT id FROM assets WHERE id=${v.id}::uuid FOR UPDATE`;
  const old=await tx.asset.findUnique({where:{id:v.id}});if(!old)throw new AppError(404,"NOT_FOUND","Asset not found.");if(old.revision!==v.revision)throw new AppError(409,"STALE","Refresh before editing this asset.");
  await tx.asset.update({where:{id:old.id},data:{...v.data,revision:{increment:1}}});await audit({actorUserId:actor.userId,action:"ASSET_CHANGED",entity:"assets",entityId:old.id,reason:v.reason,before:JSON.parse(JSON.stringify(old)),after:v.data},tx);
 }));
}
export async function assignAsset(identity:Identity|null,input:unknown){
 await securityBoundary(identity,async a=>peopleStaff(a));const v=validated(assignmentSchema,input);
 return conflicts(()=>authorizedMutation(identity,async(actor,tx)=>{peopleStaff(actor);await tx.$queryRaw`SELECT id FROM employees WHERE id=${v.employeeId}::uuid FOR UPDATE`;await tx.$queryRaw`SELECT id FROM assets WHERE id=${v.assetId}::uuid FOR UPDATE`;
  const asset=await tx.asset.findUnique({where:{id:v.assetId}});if(!asset)throw new AppError(404,"NOT_FOUND","Asset not found.");if(asset.status!=="AVAILABLE"||await tx.assetAssignment.count({where:{assetId:asset.id,returnedAt:null}}))throw new AppError(409,"ASSET_UNAVAILABLE","Asset already assigned, retired or lost.");
  const now=await databaseNow(tx),settings=await tx.organizationSettings.findUniqueOrThrow({where:{id:1}}),today=localDate(now,settings.timezone);
  if(v.assignedDate>today)throw new AppError(400,"FUTURE_ASSIGNMENT","Record an issue that has occurred.");
  const employee=await tx.employee.findUnique({where:{id:v.employeeId},select:{user:{select:{isActive:true}}}}),stint=await tx.employmentPeriod.findFirst({where:{employeeId:v.employeeId,startDate:{lte:dateValue(v.assignedDate)},OR:[{endDate:null},{endDate:{gt:dateValue(v.assignedDate)}}]}});
  if(!employee?.user.isActive||!stint)throw new AppError(400,"EMPLOYMENT_COVERAGE","Select an active employee with employment covering the issue date.");
  const assignedAt=dayStart(v.assignedDate,settings.timezone),prior=await tx.assetAssignment.findFirst({where:{assetId:asset.id},orderBy:{assignedAt:"desc"}});
  if(prior&&(!prior.returnedAt||assignedAt<prior.returnedAt))throw new AppError(409,"ASSIGNMENT_OVERLAP","Issue date precedes the previous return.");
  const snapshot={assetCode:asset.assetCode,name:asset.name,type:asset.type,serialNumber:asset.serialNumber};
  const r=await tx.assetAssignment.create({data:{assetId:asset.id,employeeId:v.employeeId,employmentPeriodId:stint.id,assignedAt,identificationSnapshot:snapshot,conditionOut:v.conditionOut,notes:v.notes,assignedBy:actor.userId}});
  await audit({actorUserId:actor.userId,employeeId:r.employeeId,action:"ASSET_ASSIGNED",entity:"asset_assignments",entityId:r.id,after:{...v,identificationSnapshot:snapshot}},tx);
  await peopleEvent(tx,{employeeId:r.employeeId,actorUserId:actor.userId,type:"ASSET_ASSIGNED",title:"Company asset assigned",sourceType:"asset_assignments",sourceId:r.id});await notify(tx,r.employeeId,"ASSET_ASSIGNED","asset_assignments",r.id,`asset-issued:${r.id}`,"A company asset assignment is available.");return r.id;
 }));
}
export async function returnAsset(identity:Identity|null,input:unknown){
 await securityBoundary(identity,async a=>peopleStaff(a));const v=validated(returnSchema,input);
 return authorizedMutation(identity,async(actor,tx)=>{peopleStaff(actor);const r=await tx.assetAssignment.findUnique({where:{id:v.id}});if(!r)throw new AppError(404,"NOT_FOUND","Assignment not found.");await tx.$queryRaw`SELECT id FROM assets WHERE id=${r.assetId}::uuid FOR UPDATE`;
  if(r.revision!==v.revision||r.returnedAt)throw new AppError(409,"STALE","Refresh the outstanding assignment before returning.");
  const now=await databaseNow(tx),tz=(await tx.organizationSettings.findUniqueOrThrow({where:{id:1}})).timezone,returnedAt=dayStart(v.returnDate,tz);
  if(v.returnDate>localDate(now,tz)||returnedAt<r.assignedAt)throw new AppError(400,"RETURN_DATE","Return must be on/after issue and cannot be in the future.");
  await tx.assetAssignment.update({where:{id:r.id},data:{returnedAt,conditionIn:v.conditionIn,returnNotes:v.notes,returnedBy:actor.userId,revision:{increment:1}}});
  await audit({actorUserId:actor.userId,employeeId:r.employeeId,action:"ASSET_RETURNED",entity:"asset_assignments",entityId:r.id,after:v},tx);
  await peopleEvent(tx,{employeeId:r.employeeId,actorUserId:actor.userId,type:"ASSET_RETURNED",title:"Company asset returned",sourceType:"asset_assignments",sourceId:r.id});await notify(tx,r.employeeId,"ASSET_RETURNED","asset_assignments",r.id,`asset-returned:${r.id}`,"A company asset return was recorded.");
 });
}
export async function assetData(identity:Identity|null,input:unknown={}){
 return securityBoundary(identity,async actor=>{peopleStaff(actor);const v=validated(assetListSchema,input),ids=v.employeeId||v.status==="ASSIGNED"?await db.assetAssignment.findMany({where:{...(v.employeeId?{employeeId:v.employeeId}:{}),...(v.status==="ASSIGNED"?{returnedAt:null}:{})},select:{assetId:true}}):null;
  const assigned=v.status==="AVAILABLE"?await db.assetAssignment.findMany({where:{returnedAt:null},select:{assetId:true}}):[];
  const rows=await db.asset.findMany({where:{...(v.type?{type:v.type}:{}),...(v.status&&v.status!=="ASSIGNED"?{status:v.status}:{}),id:{...(v.id?{equals:v.id}:{}),...(ids?{in:ids.map(i=>i.assetId)}:{}),...(assigned.length?{notIn:assigned.map(i=>i.assetId)}:{})}},orderBy:[{assetCode:"asc"},{id:"asc"}],skip:(v.page-1)*25,take:26});
  if(v.id&&!rows.length)throw new AppError(404,"NOT_FOUND","Asset not found.");
  const settings=await db.organizationSettings.findUniqueOrThrow({where:{id:1}}),today=dateValue(localDate(await databaseNow(db),settings.timezone));
  return {records:await Promise.all(rows.slice(0,25).map(async a=>{const holder=await db.assetAssignment.findFirst({where:{assetId:a.id,returnedAt:null}});const employee=holder?await db.employee.findUniqueOrThrow({where:{id:holder.employeeId},select:{legalName:true,user:{select:{isActive:true}},employmentPeriods:{select:{startDate:true,endDate:true}}}}):null;return {...a,displayStatus:holder?"ASSIGNED":a.status,holder:holder&&employee?{...holder,employee,outstandingOffboarding:!employee.user.isActive||!employee.employmentPeriods.some(s=>s.startDate<=today&&(!s.endDate||s.endDate>today))}:null};})),page:v.page,hasNext:rows.length>25};
 });
}
export async function assignmentData(identity:Identity|null,input:unknown={},staff=false){
 return securityBoundary(identity,async actor=>{if(staff)peopleStaff(actor);const v=validated(staff?assignmentListSchema:assignmentListSchema.omit({employeeId:true,assetId:true}).strict(),input);
  const rows=await db.assetAssignment.findMany({where:{...(staff?"employeeId" in v&&v.employeeId?{employeeId:v.employeeId}:{}:{employeeId:actor.employeeId??"00000000-0000-0000-0000-000000000000"}),...("assetId" in v&&v.assetId?{assetId:v.assetId}:{}),...(v.id?{id:v.id}:{})},orderBy:[{assignedAt:"desc"},{id:"desc"}],skip:(v.page-1)*25,take:26});if(v.id&&!rows.length)throw new AppError(404,"NOT_FOUND","Assignment not found.");
  return {records:await Promise.all(rows.slice(0,25).map(async r=>staff?{...r,employee:await db.employee.findUniqueOrThrow({where:{id:r.employeeId},select:{legalName:true}})}:{id:r.id,identificationSnapshot:r.identificationSnapshot,assignedAt:r.assignedAt,returnedAt:r.returnedAt,conditionOut:r.conditionOut,conditionIn:r.conditionIn,employee:null})),page:v.page,hasNext:rows.length>25,timezone:(await db.organizationSettings.findUniqueOrThrow({where:{id:1}})).timezone};
 });
}
