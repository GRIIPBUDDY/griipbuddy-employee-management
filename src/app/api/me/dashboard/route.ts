import { apiError,requestIdentity } from "@/lib/http";
import { personalDashboard } from "@/features/insights/dashboard";
export async function GET(){try{return Response.json(await personalDashboard(await requestIdentity()),{headers:{"Cache-Control":"private, no-store"}});}catch(error){return apiError(error);}}
