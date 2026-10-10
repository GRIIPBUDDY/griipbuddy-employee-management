import { apiError,requestIdentity } from "@/lib/http";
import { salaryData } from "@/features/pay/periods";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,c:Context) {try{const identity=await requestIdentity(false,true),{id}=await c.params;return Response.json(await salaryData(identity,{id})??{success:true},{headers:{"Cache-Control":"private, no-store"}});}catch(e){return apiError(e);}}
