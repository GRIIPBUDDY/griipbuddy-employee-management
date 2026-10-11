"use server";
import { revalidatePath } from "next/cache";
import { assertMutationOrigin,getIdentity } from "@/lib/auth/request";
import { safeMessage } from "@/lib/utils/errors";
import type { ActionState } from "@/types/auth";
import { requestSwap,consentSwap,decideSwap } from "./swaps";
export async function swapAction(_:ActionState,form:FormData):Promise<ActionState>{try{await assertMutationOrigin();const identity=await getIdentity(),text=(key:string)=>String(form.get(key)??"");switch(text("kind")){
 case "request":{const [requesterSlotId,requesterDate]=text("own").split("|"),[partnerEmployeeId,partnerSlotId,partnerDate]=text("partner").split("|");await requestSwap(identity,{requesterSlotId,requesterDate,partnerEmployeeId,partnerSlotId,partnerDate,reason:text("reason"),operationKey:text("operationKey")});break;}
 case "consent":await consentSwap(identity,{id:text("id"),revision:Number(text("revision")),accept:text("accept")==="true",comment:text("comment")});break;
 case "review":await decideSwap(identity,{id:text("id"),revision:Number(text("revision")),approve:text("approve")==="true",comment:text("comment")});break;default:return {error:"Unknown swap action."};}revalidatePath("/","layout");return {success:"Shift swap saved."};}catch(e){return {error:safeMessage(e)};}}
