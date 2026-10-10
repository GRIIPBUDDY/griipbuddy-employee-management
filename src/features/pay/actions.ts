"use server";
import { Temporal } from "@js-temporal/polyfill";
import { revalidatePath } from "next/cache";
import { getIdentity,assertMutationOrigin } from "@/lib/auth/request";
import { safeMessage,AppError } from "@/lib/utils/errors";
import { organizationSummary } from "@/features/settings/service";
import type { ActionState } from "@/types/auth";
import { payCommand } from "./commands";
import { submitPreorder,withdrawPreorder } from "./commissions";
export async function payAction(_:ActionState,form:FormData):Promise<ActionState> {
 try{
  await assertMutationOrigin();const identity=await getIdentity(),text=(k:string)=>String(form.get(k)??""),kind=text("kind"),revision=Number(text("revision"));let data:unknown;
  switch(kind){
   case "rate":data={employeeId:text("employeeId"),employmentPeriodId:text("employmentPeriodId"),effectiveFrom:text("effectiveFrom"),effectiveUntil:text("effectiveUntil"),payType:text("payType"),baseAmount:text("baseAmount"),overtimeHourlyEquivalent:text("overtimeHourlyEquivalent"),overtimeMultiplier:text("overtimeMultiplier"),reason:text("reason"),...(text("baseRateId")?{baseRateId:text("baseRateId"),revision}:{})};break;
   case "period":data={month:text("month")};break;
   case "calculate":data={periodId:text("periodId"),revision};break;
   case "transition":data={periodId:text("periodId"),revision,status:text("status")};break;
   case "adjustment":data={employeeId:text("employeeId"),periodId:text("periodId"),type:text("type"),amount:text("amount"),reason:text("reason"),operationKey:text("operationKey")};break;
   case "adjustmentEdit":data={id:text("id"),revision,amount:text("amount"),reason:text("reason")};break;
   case "adjustmentDecision":case "preorderDecision":data={id:text("id"),revision,decision:text("decision"),comment:text("comment")};break;
   case "reconcile":data={originalCalculationId:text("originalCalculationId"),targetPeriodId:text("targetPeriodId"),operationKey:text("operationKey"),reason:text("reason"),...(revision?{revision}:{}),...(text("preorderId")?{commissionChange:{preorderId:text("preorderId"),amount:text("commissionAmount")}}:{})};break;
   case "preorderOwn":await submitPreorder(identity,{reference:text("reference"),orderValue:text("orderValue"),reason:text("reason")});break;
   case "withdraw":await withdrawPreorder(identity,text("id"));break;
   case "preorderStaff":{
    const settings=await organizationSummary(identity),plain=Temporal.PlainDateTime.from(text("orderAt")),zoned=plain.toZonedDateTime(settings.timezone,{disambiguation:"earlier"});if(!zoned.toPlainDateTime().equals(plain))throw new AppError(400,"LOCAL_TIME","Choose an existing local time.");
    const [employeeId,eligibilityEvidenceId]=text("employeeEvidence").split("|");
    data={employeeId,eligibilityEvidenceId,orderAt:zoned.toInstant().toString(),reference:text("reference"),orderValue:text("orderValue"),commissionType:text("commissionType"),commissionValue:text("commissionValue"),reason:text("reason"),...(text("id")?{id:text("id"),revision}:{})};break;
   }
   case "assign":data={id:text("id"),revision,periodId:text("periodId"),reason:text("reason")};break;
   case "commissionPolicy":data={type:text("type"),value:text("value"),reason:text("reason")};break;
   default:throw new AppError(400,"VALIDATION","Unknown salary action.");
  }
  if(data!==undefined)await payCommand(identity,{kind,data});revalidatePath("/","layout");return {success:"Saved. Refresh the current sources before salary closeout."};
 }catch(error){return {error:safeMessage(error)};}
}
