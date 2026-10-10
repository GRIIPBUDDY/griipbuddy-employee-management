import { apiError,requestIdentity,jsonBody } from "@/lib/http";
import { periodData,createPeriod } from "@/features/pay/periods";
export async function GET(request:Request) {try{const identity=await requestIdentity(false,true),query=Object.fromEntries(new URL(request.url).searchParams);return Response.json(await periodData(identity,query)??{success:true},{headers:{"Cache-Control":"private, no-store"}});}catch(error){return apiError(error);}}
export async function POST(request:Request) {try{const identity=await requestIdentity(true,true);return Response.json(await createPeriod(identity,await jsonBody(request))??{success:true},{headers:{"Cache-Control":"private, no-store"}});}catch(error){return apiError(error);}}
