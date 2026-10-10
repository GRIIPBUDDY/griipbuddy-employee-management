import { apiError,requestIdentity,jsonBody } from "@/lib/http";
import { commissionData,decidePreorder } from "@/features/pay/commissions";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,c:Context) {try{const identity=await requestIdentity(false,true),{id}=await c.params;return Response.json(await commissionData(identity,{id},true)??{success:true},{headers:{"Cache-Control":"private, no-store"}});}catch(e){return apiError(e);}}
export async function POST(request:Request,c:Context) {try{const identity=await requestIdentity(true,true),{id}=await c.params;return Response.json(await decidePreorder(identity,{...await jsonBody(request),id})??{success:true},{headers:{"Cache-Control":"private, no-store"}});}catch(e){return apiError(e);}}
