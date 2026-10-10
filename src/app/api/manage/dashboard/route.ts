import { apiError,requestIdentity } from "@/lib/http";
import { managementDashboard } from "@/features/insights/dashboard";
export async function GET(){try{return Response.json(await managementDashboard(await requestIdentity()),{headers:{"Cache-Control":"private, no-store"}});}catch(error){return apiError(error);}}
