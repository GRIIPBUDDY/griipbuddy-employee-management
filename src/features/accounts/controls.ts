import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { authorizedMutation } from "@/lib/db/mutation";
import { audit } from "@/lib/db/audit";
import { securityBoundary } from "@/lib/authorization/actor";
import { assertRole,assertManageCommissions } from "@/lib/authorization/policy";
import { validated,uuidSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import { databaseNow } from "@/features/time/clock";
import { notify } from "@/features/review/notifications";
import type { Identity } from "@/types/auth";
const statusSchema=z.object({employeeId:uuidSchema,status:z.enum(["ACTIVE","ON_HOLD","SUSPENDED"]),reason:z.string().trim().min(1).max(500)}).strict();
const featureSchema=z.object({employeeId:uuidSchema,enabled:z.boolean(),reason:z.string().trim().min(1).max(500)}).strict();
export async function changeEmployeeStatus(identity:Identity|null,input:unknown){
 await securityBoundary(identity,a=>{assertRole(a,["ADMIN","HR_MANAGER"]);return Promise.resolve();});const v=validated(statusSchema,input);
 return authorizedMutation(identity,async(a,tx)=>{
  assertRole(a,["ADMIN","HR_MANAGER"]);const employee=await tx.employee.findUnique({where:{id:v.employeeId},include:{user:true}});if(!employee)throw new AppError(404,"NOT_FOUND","Employee not found.");
  const target=employee.user;
  if(a.userId===target.id)throw new AppError(403,"SELF_STATUS","You cannot change your own status.");
  if(a.role==="HR_MANAGER" && target.role!=="EMPLOYEE")throw new AppError(403,"ROLE_DENIED","HR may manage employee accounts only.");
  if(target.role==="ADMIN" && v.status!=="ACTIVE" && await tx.user.count({where:{role:"ADMIN",accountStatus:"ACTIVE",isActive:true}})<=1)throw new AppError(409,"LAST_ADMIN","Keep an active administrator.");
  if(target.accountStatus===v.status)return;
  await tx.user.update({where:{id:target.id},data:{accountStatus:v.status,isActive:v.status!=="SUSPENDED",sessionVersion:{increment:1}}});
  await audit({actorUserId:a.userId,employeeId:employee.id,action:"ACCOUNT_STATUS_CHANGED",entity:"users",entityId:target.id,reason:v.reason,before:{status:target.accountStatus},after:{status:v.status}},tx);
  await tx.employeeActivity.create({data:{employeeId:employee.id,createdBy:a.userId,type:"ACCOUNT_STATUS_CHANGED",title:`Account status: ${v.status.replaceAll("_"," ")}`,description:"Contact HR for assistance.",sourceType:"employees",sourceId:employee.id,eventTime:await databaseNow(tx),employeeVisible:true}});
  await notify(tx,employee.id,"ACCOUNT_STATUS_CHANGED","employees",employee.id,`status:${target.id}:${target.sessionVersion+1}`,`Your account status is ${v.status.replaceAll("_"," ").toLowerCase()}. Contact HR for assistance.`);
 });
}
export async function setCommissionEligibility(identity:Identity|null,input:unknown){
 await securityBoundary(identity,a=>{assertManageCommissions(a);return Promise.resolve();});const v=validated(featureSchema,input);
 return authorizedMutation(identity,async(a,tx)=>{
  assertManageCommissions(a);const e=await tx.employee.findUnique({where:{id:v.employeeId},include:{user:{select:{id:true,role:true}}}});if(!e)throw new AppError(404,"NOT_FOUND","Employee not found.");
  if(e.userId===a.userId || a.role==="HR_MANAGER" && e.user.role!=="EMPLOYEE")throw new AppError(403,"ROLE_DENIED","This employee permission requires another authorized administrator.");
  if(e.preorderCommissionEnabled===v.enabled)return;
  await tx.employee.update({where:{id:e.id},data:{preorderCommissionEnabled:v.enabled}});
  await tx.user.update({where:{id:e.userId},data:{sessionVersion:{increment:1}}});
  await audit({actorUserId:a.userId,employeeId:e.id,action:"ACCOUNT_SECURITY_CHANGED",entity:"users",entityId:e.userId,reason:v.reason,before:{preorderCommissionEnabled:e.preorderCommissionEnabled},after:{preorderCommissionEnabled:v.enabled,commissionRelated:true}},tx);
 });
}
export async function employeeControlData(identity:Identity|null,employeeId:string){return securityBoundary(identity,async a=>{
 assertRole(a,["ADMIN","HR_MANAGER"]);const e=await db.employee.findUnique({where:{id:validated(uuidSchema,employeeId)},select:{id:true,legalName:true,preorderCommissionEnabled:true,user:{select:{id:true,email:true,role:true,accountStatus:true}}}});if(!e)throw new AppError(404,"NOT_FOUND","Employee not found.");
 const canManage=a.role==="ADMIN" || a.canManageCommissions;
 return {...e,preorderCommissionEnabled:canManage?e.preorderCommissionEnabled:undefined,canManage,canChangeStatus:a.userId!==e.user.id && (a.role==="ADMIN" || e.user.role==="EMPLOYEE")};
});}
