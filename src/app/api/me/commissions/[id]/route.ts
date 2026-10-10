import { apiError,requestIdentity } from "@/lib/http";
import { commissionData,withdrawPreorder } from "@/features/pay/commissions";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,c:Context) {try{const identity=await requestIdentity(false,false),{id}=await c.params;return Response.json(await commissionData(identity,{id})??{success:true},{headers:{"Cache-Control":"private, no-store"}});}catch(e){return apiError(e);}}
export async function POST(request:Request,c:Context) {try{const identity=await requestIdentity(true,false),{id}=await c.params;return Response.json(await withdrawPreorder(identity,id)??{success:true},{headers:{"Cache-Control":"private, no-store"}});}catch(e){return apiError(e);}}
