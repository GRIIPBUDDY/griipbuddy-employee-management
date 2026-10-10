import { apiError,requestIdentity,jsonBody } from "@/lib/http";
import { rateHistory,publishRate } from "@/features/pay/rates";
type Context={params:Promise<{employeeId:string}>};
export async function GET(_:Request,c:Context){try{return Response.json(await rateHistory(await requestIdentity(false,true),(await c.params).employeeId),{headers:{"Cache-Control":"private, no-store"}});}catch(e){return apiError(e);}}
export async function POST(r:Request,c:Context){try{const identity=await requestIdentity(true,true),body=await jsonBody(r);return Response.json(await publishRate(identity,{...body,employeeId:(await c.params).employeeId}),{headers:{"Cache-Control":"private, no-store"}});}catch(e){return apiError(e);}}
