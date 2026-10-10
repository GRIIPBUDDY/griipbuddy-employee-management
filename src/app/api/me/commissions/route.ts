import { apiError,requestIdentity,jsonBody } from "@/lib/http";
import { commissionData,submitPreorder } from "@/features/pay/commissions";
export async function GET(request:Request) {try{const identity=await requestIdentity(false,false),query=Object.fromEntries(new URL(request.url).searchParams);return Response.json(await commissionData(identity,query)??{success:true},{headers:{"Cache-Control":"private, no-store"}});}catch(error){return apiError(error);}}
export async function POST(request:Request) {try{const identity=await requestIdentity(true,false);return Response.json(await submitPreorder(identity,await jsonBody(request))??{success:true},{headers:{"Cache-Control":"private, no-store"}});}catch(error){return apiError(error);}}
