import { apiError,requestIdentity } from "@/lib/http";
import { reportData } from "@/features/insights/reports";
export async function GET(request:Request,context:{params:Promise<{kind:string}>}){try{return Response.json(await reportData(await requestIdentity(),(await context.params).kind,Object.fromEntries(new URL(request.url).searchParams)),{headers:{"Cache-Control":"private, no-store"}});}catch(error){return apiError(error);}}
