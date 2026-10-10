import { apiError,requestIdentity } from "@/lib/http";
import { salaryData } from "@/features/pay/periods";
export async function GET(request:Request) {try{const identity=await requestIdentity(false,false),query=Object.fromEntries(new URL(request.url).searchParams);return Response.json(await salaryData(identity,query,true)??{success:true},{headers:{"Cache-Control":"private, no-store"}});}catch(error){return apiError(error);}}
