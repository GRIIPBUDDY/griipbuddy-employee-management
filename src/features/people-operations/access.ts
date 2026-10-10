import "server-only";
import type {Actor} from "@/types/auth";
import type {Database} from "@/lib/db/audit";
import {assertRole} from "@/lib/authorization/policy";
import {AppError} from "@/lib/utils/errors";
export function peopleStaff(actor:Actor){assertRole(actor,["ADMIN","HR_MANAGER"]);}
export function publisher(actor:Actor,employeeId:string){peopleStaff(actor);if(actor.role==="HR_MANAGER"&&actor.employeeId===employeeId)throw new AppError(403,"SELF_PUBLICATION","An administrator must publish or correct your own official review or warning.");}
export const publishedWarning={publishedAt:{not:null},employeeVisible:true,revokedAt:null};
export async function documentParentVisible(tx:Database,employeeId:string,documentId:string){
 return !await tx.disciplinaryRecord.count({where:{employeeId,attachmentDocumentId:documentId,OR:[{publishedAt:null},{employeeVisible:false},{revokedAt:{not:null}}]}});
}
