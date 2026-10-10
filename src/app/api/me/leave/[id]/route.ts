import { apiError,requestIdentity,jsonBody } from "@/lib/http";
import { absenceData,withdrawLeave } from "@/features/review/absence";
export async function POST(request:Request, context:{params:Promise<Record<string,string>>}) { try { const result=await withdrawLeave(await requestIdentity(true),{...await jsonBody(request),id:(await context.params).id});return Response.json(result??{success:true},{headers:{"Cache-Control":"private, no-store"}}); }catch(error){return apiError(error);} }

export async function GET(_:Request, context:{params:Promise<Record<string,string>>}) { try { return Response.json(await absenceData(await requestIdentity(),false,1,(await context.params).id),{headers:{"Cache-Control":"private, no-store"}}); }catch(error){return apiError(error);} }
