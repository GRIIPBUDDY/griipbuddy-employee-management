import { apiError,requestIdentity,jsonBody } from "@/lib/http";
import { payCommand } from "@/features/pay/commands";
export async function POST(request:Request) {try{const identity=await requestIdentity(true,true);return Response.json(await payCommand(identity,await jsonBody(request))??{success:true},{headers:{"Cache-Control":"private, no-store"}});}catch(error){return apiError(error);}}
