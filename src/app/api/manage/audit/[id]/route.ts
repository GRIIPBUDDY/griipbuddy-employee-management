import { apiError,requestIdentity } from "@/lib/http";
import { auditData } from "@/features/insights/audit";
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){try{return Response.json((await auditData(await requestIdentity(),{},(await context.params).id)).records[0],{headers:{"Cache-Control":"private, no-store"}});}catch(error){return apiError(error);}}
