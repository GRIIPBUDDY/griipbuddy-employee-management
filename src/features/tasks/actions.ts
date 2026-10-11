"use server";
import { revalidatePath } from "next/cache";
import { assertMutationOrigin,getIdentity } from "@/lib/auth/request";
import { safeMessage } from "@/lib/utils/errors";
import type { ActionState } from "@/types/auth";
import { assignTasks,updateTaskProgress,editTask } from "./service";
export async function taskAction(_:ActionState,form:FormData):Promise<ActionState>{try{
 await assertMutationOrigin();const id=await getIdentity(),text=(key:string)=>String(form.get(key)??""),fields={title:text("title"),description:text("description"),assignedDate:text("assignedDate"),dueDate:text("dueDate")||null,priority:text("priority")};
 switch(text("kind")){case "assign":await assignTasks(id,{...fields,employeeIds:form.getAll("employeeIds"),operationKey:text("operationKey")});break;case "progress":await updateTaskProgress(id,{id:text("id"),revision:Number(text("revision")),status:text("status"),note:text("note")});break;case "edit":await editTask(id,{...fields,id:text("id"),revision:Number(text("revision")),reason:text("reason")});break;default:return {error:"Unknown task action."};}
 revalidatePath("/","layout");return {success:"Task saved."};
 }catch(error){return {error:safeMessage(error)};}}
