import { apiError,requestIdentity,jsonBody } from "@/lib/http";
import { decideOvertime } from "@/features/review/overtime";
export async function POST(request:Request, context:{params:Promise<Record<string,string>>}) { try { const result=await decideOvertime(await requestIdentity(true,true),{...await jsonBody(request),id:(await context.params).id});return Response.json(result??{success:true},{headers:{"Cache-Control":"private, no-store"}}); }catch(error){return apiError(error);} }
