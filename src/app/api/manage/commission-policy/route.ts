import { apiError,requestIdentity,jsonBody } from "@/lib/http";
import { updateCommissionPolicy } from "@/features/pay/commissions";
export async function POST(request:Request) {try{const identity=await requestIdentity(true,true);return Response.json(await updateCommissionPolicy(identity,await jsonBody(request))??{success:true},{headers:{"Cache-Control":"private, no-store"}});}catch(error){return apiError(error);}}
