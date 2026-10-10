import { apiError,requestIdentity,jsonBody } from "@/lib/http";
import { commissionData,submitPreorder } from "@/features/pay/commissions";
export async function GET(request:Request) {try{const identity=await requestIdentity(false,true),query=Object.fromEntries(new URL(request.url).searchParams);return Response.json(await commissionData(identity,query,true)??{success:true},{headers:{"Cache-Control":"private, no-store"}});}catch(error){return apiError(error);}}
export async function POST(request:Request) {try{const identity=await requestIdentity(true,true);return Response.json(await submitPreorder(identity,await jsonBody(request),true)??{success:true},{headers:{"Cache-Control":"private, no-store"}});}catch(error){return apiError(error);}}
