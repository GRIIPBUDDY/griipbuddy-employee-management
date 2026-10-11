"use server";
import { revalidatePath } from "next/cache";
import { assertMutationOrigin,getIdentity } from "@/lib/auth/request";
import { safeMessage } from "@/lib/utils/errors";
import type { ActionState } from "@/types/auth";
import { changeEmployeeStatus,setCommissionEligibility } from "./controls";
import { requestEmailChange,confirmEmailChange,retryEmailNotice } from "./email";
export async function controlAction(_:ActionState,form:FormData):Promise<ActionState>{
 try{await assertMutationOrigin();const identity=await getIdentity(),text=(key:string)=>String(form.get(key)??"");
 switch(text("kind")){
 case "status":await changeEmployeeStatus(identity,{employeeId:text("employeeId"),status:text("status"),reason:text("reason")});break;
 case "eligibility":await setCommissionEligibility(identity,{employeeId:text("employeeId"),enabled:form.get("enabled")==="on",reason:text("reason")});break;
 case "email":{const result=await requestEmailChange(identity,{newEmail:text("newEmail"),currentPassword:text("currentPassword"),...(text("employeeId")?{employeeId:text("employeeId")}: {})});revalidatePath("/","layout");return {success:result.previewUrl?`Development only verification: ${result.previewUrl}`:"Verification sent. Your current login email remains active until confirmation."};}
 case "confirmEmail":await confirmEmailChange(text("token"));return {success:"Email verified and login address changed. All previous sessions are revoked. Sign in using the new email."};
 case "retryNotice":await retryEmailNotice(identity,text("id"));break;
 default:return {error:"Unknown account action."};
 }revalidatePath("/","layout");return {success:"Saved."};
 }catch(error){return {error:safeMessage(error)};}
}
