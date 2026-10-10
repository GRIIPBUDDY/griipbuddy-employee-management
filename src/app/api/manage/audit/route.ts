import { apiError,requestIdentity } from "@/lib/http";
import { auditData } from "@/features/insights/audit";
export async function GET(request:Request){try{return Response.json(await auditData(await requestIdentity(),Object.fromEntries(new URL(request.url).searchParams)),{headers:{"Cache-Control":"private, no-store"}});}catch(error){return apiError(error);}}
