import { apiError,requestIdentity,jsonBody } from "@/lib/http";
import { updateOvertimePolicy } from "@/features/review/overtime";
export async function POST(request:Request) { try { const result=await updateOvertimePolicy(await requestIdentity(true,true),await jsonBody(request));return Response.json(result??{success:true},{headers:{"Cache-Control":"private, no-store"}}); }catch(error){return apiError(error);} }
