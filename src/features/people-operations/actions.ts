"use server";
import {revalidatePath} from "next/cache";
import {assertMutationOrigin,getIdentity} from "@/lib/auth/request";
import {safeMessage,AppError} from "@/lib/utils/errors";
import type {ActionState} from "@/types/auth";
import {createRecord,editRecord,publishRecord,revokeWarning,acknowledgeWarning,type RecordKind} from "./records";
import {createAsset,editAsset,assignAsset,returnAsset} from "./assets";
export async function peopleOperationsAction(_:ActionState,form:FormData):Promise<ActionState>{
 try{await assertMutationOrigin();const identity=await getIdentity(),s=(k:string)=>String(form.get(k)??""),kind=s("kind"),id=s("id"),revision=Number(s("revision"));
  if(["performanceCreate","performanceEdit","warningCreate","warningEdit"].includes(kind)){
   const module:RecordKind=kind.startsWith("performance")?"performance":"warnings",subject={employeeId:s("employeeId"),employmentPeriodId:s("employmentPeriodId"),employeeVisible:form.has("employeeVisible"),staffNotes:s("staffNotes")};
   const data=module==="performance"?{...subject,startDate:s("startDate"),endDate:s("endDate"),...Object.fromEntries(["overallRating","productivity","workQuality","communication","attendance","responsibility"].map(k=>[k,s(k)?Number(s(k)):null])),strengths:s("strengths"),improvementAreas:s("improvementAreas"),reviewerComments:s("reviewerComments")}:{...subject,issueDate:s("issueDate"),severity:s("severity"),reason:s("reason"),description:s("description"),actionTaken:s("actionTaken"),attachmentDocumentId:s("attachmentDocumentId"),acknowledgementRequested:form.has("acknowledgementRequested")};
   if(kind.endsWith("Edit"))await editRecord(identity,module,{id,revision,data,...(s("correctionReason")?{correctionReason:s("correctionReason")}:{} )});else await createRecord(identity,module,data);
  }else switch(kind){
   case "performancePublish":case "warningPublish":await publishRecord(identity,kind.startsWith("performance")?"performance":"warnings",{id,revision});break;
   case "warningRevoke":await revokeWarning(identity,{id,revision,reason:s("reason")});break;
   case "acknowledge":await acknowledgeWarning(identity,{id,revision});break;
   case "assetCreate":case "assetEdit":{const data={assetCode:s("assetCode"),type:s("type"),name:s("name"),serialNumber:s("serialNumber"),condition:s("condition"),status:s("status"),notes:s("notes")};if(kind==="assetEdit")await editAsset(identity,{id,revision,data,reason:s("reason")});else await createAsset(identity,data);break;}
   case "assetAssign":await assignAsset(identity,{assetId:s("assetId"),employeeId:s("employeeId"),assignedDate:s("assignedDate"),conditionOut:s("conditionOut"),notes:s("notes")});break;
   case "assetReturn":await returnAsset(identity,{id,revision,returnDate:s("returnDate"),conditionIn:s("conditionIn"),notes:s("notes")});break;
   default:throw new AppError(400,"VALIDATION","Unknown people action.");
  }
  revalidatePath("/","layout");return {success:"Saved. The current record and history are up to date."};
 }catch(e){return {error:safeMessage(e)};}
}
