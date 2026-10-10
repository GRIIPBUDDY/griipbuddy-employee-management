import { apiError,requestIdentity,jsonBody } from "@/lib/http";
import { absenceData,decideLeave } from "@/features/review/absence";
export async function POST(request:Request, context:{params:Promise<Record<string,string>>}) { try { const result=await decideLeave(await requestIdentity(true,true),{...await jsonBody(request),id:(await context.params).id});return Response.json(result??{success:true},{headers:{"Cache-Control":"private, no-store"}}); }catch(error){return apiError(error);} }

export async function GET(_:Request, context:{params:Promise<Record<string,string>>}) { try { return Response.json(await absenceData(await requestIdentity(false,true),true,1,(await context.params).id),{headers:{"Cache-Control":"private, no-store"}}); }catch(error){return apiError(error);} }
