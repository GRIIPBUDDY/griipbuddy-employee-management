import { apiError,requestIdentity } from "@/lib/http";
import { absenceData } from "@/features/review/absence";
export async function GET(request:Request) { try { const {page,...filters}=Object.fromEntries(new URL(request.url).searchParams);const result=await absenceData(await requestIdentity(false,true),true,Number(page??1),undefined,filters);return Response.json(result,{headers:{"Cache-Control":"private, no-store"}}); }catch(error){return apiError(error);} }
