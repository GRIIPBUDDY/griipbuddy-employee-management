import { assertRole,assertManageCommissions } from "@/lib/authorization/policy";
import type { Actor } from "@/types/auth";
import { AppError } from "@/lib/utils/errors";
export function payStaff(actor:Actor,restricted=false){assertRole(actor,["ADMIN","HR_MANAGER"]);if(restricted)assertManageCommissions(actor);}
export function adjustmentReviewer(actor:Actor,employeeId:string,restricted:boolean){payStaff(actor,restricted);if(actor.role==="HR_MANAGER" && actor.employeeId===employeeId)throw new AppError(403,"SELF_REVIEW","An administrator must review your own financial proposal.");}
export function commissionRestricted(snapshot:unknown){return !snapshot || typeof snapshot!=="object" || !("commissionRelated" in snapshot) || snapshot.commissionRelated!==false;}
export const canCommissionStaff=(actor:Actor)=>actor.role==="ADMIN" || actor.role==="HR_MANAGER" && actor.canManageCommissions;
