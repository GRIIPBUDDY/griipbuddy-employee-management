import { requestIdentity,apiError } from "@/lib/http";
import { weeklyData } from "@/features/pay/weekly";
export async function GET(){try{return Response.json(await weeklyData(await requestIdentity()),{headers:{"Cache-Control":"private, no-store"}});}catch(e){return apiError(e);}}
