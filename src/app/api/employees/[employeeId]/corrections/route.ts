import { apiError,requestIdentity,jsonBody } from "@/lib/http";
import { submitCorrection } from "@/features/review/corrections";
export async function POST(request:Request, context:{params:Promise<Record<string,string>>}) { try { const result=await submitCorrection(await requestIdentity(true,true),await jsonBody(request),(await context.params).employeeId);return Response.json(result??{success:true},{headers:{"Cache-Control":"private, no-store"}}); }catch(error){return apiError(error);} }
