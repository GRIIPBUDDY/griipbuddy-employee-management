import { requestIdentity,jsonBody,apiError } from "@/lib/http";
import { requestCommissionRecheck,commissionRechecks } from "@/features/pay/rechecks";
export async function GET(){try{return Response.json(await commissionRechecks(await requestIdentity()),{headers:{"Cache-Control":"private, no-store"}});}catch(e){return apiError(e);}}
export async function POST(r:Request){try{return Response.json({id:await requestCommissionRecheck(await requestIdentity(true),await jsonBody(r))});}catch(e){return apiError(e);}}
