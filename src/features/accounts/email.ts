import "server-only";
import { createHash,randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { authorizedMutation } from "@/lib/db/mutation";
import { audit } from "@/lib/db/audit";
import { securityBoundary } from "@/lib/authorization/actor";
import { authenticateCredentials } from "@/lib/auth/credentials";
import { validated,uuidSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import type { Identity } from "@/types/auth";
import { databaseNow } from "@/features/time/clock";
const requestSchema=z.object({newEmail:z.string().trim().toLowerCase().email().max(254),currentPassword:z.string().min(1).max(128),employeeId:uuidSchema.optional()}).strict();
const tokenSchema=z.string().regex(/^[a-f0-9]{64}$/);
const digest=(token:string)=>createHash("sha256").update(token).digest("hex");
function devPreview(){let local=false;try{const url=new URL(process.env.APP_BASE_URL??"");local=["localhost","127.0.0.1"].includes(url.hostname);}catch{/* A valid loopback origin is required. */}return local && process.env.NODE_ENV!=="production" && process.env.ALLOW_DEV_EMAIL_PREVIEW==="true";}
function adapter(){
 const value=process.env.EMAIL_DELIVERY_URL;if(!value)return null;
 const url=new URL(value);if(url.protocol!=="https:" || url.username || url.password || !process.env.EMAIL_DELIVERY_TOKEN)throw new AppError(503,"EMAIL_CONFIG","Secure email delivery is not configured.");return url;
}
async function deliver(to:string,subject:string,text:string,key:string){
 const url=adapter();if(!url){if(devPreview())return;throw new AppError(503,"EMAIL_UNAVAILABLE","Email verification is unavailable. Contact the administrator.");}
 try{const response=await fetch(url,{method:"POST",headers:{"Authorization":`Bearer ${process.env.EMAIL_DELIVERY_TOKEN}`,"Content-Type":"application/json","Idempotency-Key":key},body:JSON.stringify({to,subject,text}),signal:AbortSignal.timeout(10000),redirect:"error"});if(!response.ok)throw new Error("delivery failed");}
 catch{throw new AppError(503,"EMAIL_DELIVERY","Email delivery failed. The login address has not changed.");}
}
export async function requestEmailChange(identity:Identity|null,input:unknown){
 const a=await securityBoundary(identity,async a=>a),v=validated(requestSchema,input);
 if(!adapter() && !devPreview())throw new AppError(503,"EMAIL_UNAVAILABLE","Configure email delivery before changing login addresses.");
 // Reuse login throttling and constant-work unknown password handling for reauthentication.
 const authenticated=await authenticateCredentials({email:a.email,password:v.currentPassword});
 if(!authenticated || authenticated.id!==a.userId)throw new AppError(400,"REAUTHENTICATE","Current password was not accepted.");
 const token=randomBytes(32).toString("hex");
 const r=await authorizedMutation(identity,async(actor,tx)=>{
  let userId=actor.userId;
  if(v.employeeId){
   if(actor.role==="EMPLOYEE")throw new AppError(403,"ROLE_DENIED","Employee account management requires staff authority.");
   const employee=await tx.employee.findUnique({where:{id:v.employeeId},include:{user:true}});if(!employee)throw new AppError(404,"NOT_FOUND","Employee not found.");
   if(employee.user.role!=="EMPLOYEE" && employee.user.id!==actor.userId)throw new AppError(403,"ROLE_DENIED","Another administrator's login identity cannot be changed here.");userId=employee.userId;
  }
  const target=await tx.user.findUniqueOrThrow({where:{id:userId}});
  if(target.email===v.newEmail)throw new AppError(400,"SAME_EMAIL","Choose a new address.");
  if(await tx.user.findUnique({where:{email:v.newEmail},select:{id:true}}))throw new AppError(409,"DUPLICATE_EMAIL","This email is already in use.");
  await tx.emailChangeRequest.updateMany({where:{userId,status:"PENDING"},data:{status:"CANCELLED"}});
  const now=await databaseNow(tx),request=await tx.emailChangeRequest.create({data:{userId,requestedBy:actor.userId,previousEmail:target.email,newEmail:v.newEmail,tokenHash:digest(token),expiresAt:new Date(now.getTime()+3600000),sessionVersionSnapshot:target.sessionVersion}});
  await audit({actorUserId:actor.userId,action:"EMAIL_CHANGE_REQUESTED",entity:"users",entityId:userId,after:{requestId:request.id}},tx);return request;
 });
 const url=new URL("/verify-email",process.env.APP_BASE_URL??"http://localhost:3000");url.searchParams.set("token",token);
 try{await deliver(r.newEmail,"Verify your login email",`Confirm this address within one hour: ${url.href}`,r.id);await db.emailChangeRequest.update({where:{id:r.id},data:{deliveryStatus:devPreview()?"DEVELOPMENT_PREVIEW":"DELIVERED"}});}
 catch(error){await db.emailChangeRequest.update({where:{id:r.id},data:{status:"CANCELLED",deliveryStatus:"FAILED"}});throw error;}
 return {requestId:r.id,...(devPreview()?{previewUrl:url.href}:{})};
}
export async function confirmEmailChange(input:unknown){
 const token=validated(tokenSchema,input);
 const result=await db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(73102301)`;
  const r=await tx.emailChangeRequest.findUnique({where:{tokenHash:digest(token)}}),now=await databaseNow(tx);
  if(!r || r.status!=="PENDING" || r.expiresAt<=now || !["DELIVERED","DEVELOPMENT_PREVIEW"].includes(r.deliveryStatus) || r.deliveryStatus==="DEVELOPMENT_PREVIEW" && !devPreview())throw new AppError(400,"VERIFICATION_INVALID","Verification is invalid or expired. Request a new email change.");
  const target=await tx.user.findUniqueOrThrow({where:{id:r.userId}}),requester=await tx.user.findUniqueOrThrow({where:{id:r.requestedBy}});
  if(!target.isActive || target.accountStatus==="SUSPENDED" || target.sessionVersion!==r.sessionVersionSnapshot || target.email!==r.previousEmail || !requester.isActive || requester.accountStatus==="SUSPENDED" || r.requestedBy!==r.userId && (requester.role==="EMPLOYEE" || target.role!=="EMPLOYEE"))throw new AppError(409,"VERIFICATION_STALE","Account authority changed. Request a new email change.");
  if(await tx.user.findUnique({where:{email:r.newEmail}}))throw new AppError(409,"DUPLICATE_EMAIL","This email is already in use.");
  await tx.user.update({where:{id:r.userId},data:{email:r.newEmail,sessionVersion:{increment:1}}});
  await tx.emailChangeRequest.update({where:{id:r.id},data:{status:"COMPLETED",completedAt:now}});
  await audit({actorUserId:r.requestedBy,action:"EMAIL_CHANGED",entity:"users",entityId:r.userId,after:{requestId:r.id,sessionsRevoked:true}},tx);return r;
 });
 try{await deliver(result.previousEmail,"Login email changed","Your login email was changed after verification. Contact your administrator if you did not authorize this change.",`notice:${result.id}`);await db.emailChangeRequest.update({where:{id:result.id},data:{noticeDeliveredAt:new Date()}});}catch{/* Retain a retryable completed request; never undo a verified new login address. */}
 return {completed:true};
}
export async function emailSettings(identity:Identity|null){return securityBoundary(identity,async a=>({email:a.email,requests:await db.emailChangeRequest.findMany({where:{requestedBy:a.userId},orderBy:{createdAt:"desc"},take:10,select:{id:true,newEmail:true,status:true,deliveryStatus:true,expiresAt:true,completedAt:true,noticeDeliveredAt:true}})}));}
export async function retryEmailNotice(identity:Identity|null,idInput:unknown){
 const id=validated(uuidSchema,idInput),r=await securityBoundary(identity,async a=>{const r=await db.emailChangeRequest.findFirst({where:{id,status:"COMPLETED",OR:[{userId:a.userId},{requestedBy:a.userId}]}});if(!r)throw new AppError(404,"NOT_FOUND","Request not found.");return r;});
 if(r.noticeDeliveredAt)return;
 await deliver(r.previousEmail,"Login email changed","Your login email was changed after verification. Contact your administrator if unexpected.",`notice:${r.id}`);
 await db.emailChangeRequest.update({where:{id:r.id},data:{noticeDeliveredAt:new Date()}});
}
