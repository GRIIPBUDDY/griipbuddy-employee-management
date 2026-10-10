import { apiError,requestIdentity,jsonBody } from "@/lib/http";
import { reconcileSalary } from "@/features/pay/reconciliation";
export async function POST(request:Request) {try{const identity=await requestIdentity(true,true);return Response.json(await reconcileSalary(identity,await jsonBody(request))??{success:true},{headers:{"Cache-Control":"private, no-store"}});}catch(error){return apiError(error);}}
