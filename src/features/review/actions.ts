"use server";
import { Temporal } from "@js-temporal/polyfill";
import { revalidatePath } from "next/cache";
import { getIdentity,assertMutationOrigin } from "@/lib/auth/request";
import { safeMessage,AppError } from "@/lib/utils/errors";
import { organizationSummary } from "@/features/settings/service";
import type { ActionState } from "@/types/auth";
import { submitCorrection,decideCorrection,withdrawCorrection } from "./corrections";
import { calculateOvertime,decideOvertime,updateOvertimePolicy } from "./overtime";
import { requestLeave,requestDatedLeave,decideLeave,withdrawLeave,saveHoliday } from "./absence";
import { readNotification,readAllNotifications } from "./notifications";
export async function reviewAction(_:ActionState,form:FormData):Promise<ActionState> {
 try{
  await assertMutationOrigin();const identity=await getIdentity(),settings=await organizationSummary(identity),text=(k:string)=>String(form.get(k)??"");
  const local=(k:string)=>{const input=text(k);if(!input)return "";try{const plain=Temporal.PlainDateTime.from(input),zoned=plain.toZonedDateTime(settings.timezone,{disambiguation:"earlier"});if(!zoned.toPlainDateTime().equals(plain))throw new Error("gap");return zoned.toInstant().toString();}catch{throw new AppError(400,"LOCAL_TIME","Choose a valid local date/time. Ambiguous times use the earlier offset; nonexistent times require correction.");}};
  switch(text("kind")){
   case "correction":await submitCorrection(identity,{type:text("type"),sessionId:text("sessionId"),workDate:text("workDate"),scheduleSlotId:text("scheduleSlotId"),checkinAt:local("checkinAt"),checkoutAt:local("checkoutAt"),reason:text("reason"),operationKey:text("operationKey")},form.has("employeeId")?text("employeeId"):undefined);break;
   case "correctionDecision":await decideCorrection(identity,{id:text("id"),decision:text("decision"),comment:text("comment")});break;
   case "correctionWithdraw":await withdrawCorrection(identity,{id:text("id")});break;
   case "calculate":await calculateOvertime(identity,{employeeId:text("employeeId"),week:text("week")});break;
   case "overtimeDecision":await decideOvertime(identity,{id:text("id"),revision:Number(text("revision")),decision:text("decision"),approvedSeconds:Number(text("approvedHours"))*3600+Number(text("approvedMinutes"))*60+Number(text("approvedRemainder")),comment:text("comment")});break;
   case "policy":await updateOvertimePolicy(identity,{effectiveFrom:text("effectiveFrom"),thresholdSeconds:Number(text("thresholdSeconds")),weekStartDay:Number(text("weekStartDay")),reason:text("reason")});break;
   case "leave":await requestLeave(identity,{startAt:local("startAt"),endAt:local("endAt"),type:text("type"),reason:text("reason")});break;
   case "datedLeave":await requestDatedLeave(identity,{startDate:text("startDate"),endDate:text("endDate"),type:text("type"),category:text("category"),reason:text("reason"),operationKey:text("operationKey")});break;
   case "leaveDecision":await decideLeave(identity,{id:text("id"),revision:Number(text("revision")),decision:text("decision"),comment:text("comment")});break;
   case "leaveWithdraw":await withdrawLeave(identity,{id:text("id")});break;
   case "holiday":await saveHoliday(identity,{date:text("date"),name:text("name"),reason:text("reason")});break;
   case "notificationAll":await readAllNotifications(identity);break;
   case "notification":await readNotification(identity,text("id"));break;
   default:throw new AppError(400,"VALIDATION","Unknown action.");
  }
  revalidatePath("/","layout");return {success:"Saved. Attendance and review information is up to date."};
 }catch(error){return {error:safeMessage(error)};}
}
