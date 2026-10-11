import { requestIdentity,jsonBody,apiError } from "@/lib/http";
import { checkInUnscheduled } from "@/features/time/attendance";
export async function POST(r:Request){try{return Response.json(await checkInUnscheduled(await requestIdentity(true),await jsonBody(r)));}catch(e){return apiError(e);}}
