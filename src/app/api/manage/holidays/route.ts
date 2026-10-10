import { apiError,requestIdentity,jsonBody } from "@/lib/http";
import { saveHoliday } from "@/features/review/absence";
export async function POST(request:Request) { try { const result=await saveHoliday(await requestIdentity(true,true),await jsonBody(request));return Response.json(result??{success:true},{headers:{"Cache-Control":"private, no-store"}}); }catch(error){return apiError(error);} }
