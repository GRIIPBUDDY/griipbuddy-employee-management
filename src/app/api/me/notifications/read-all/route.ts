import { apiError,requestIdentity } from "@/lib/http";
import { readAllNotifications } from "@/features/review/notifications";
export async function POST(){try{return Response.json(await readAllNotifications(await requestIdentity(true)),{headers:{"Cache-Control":"private, no-store"}});}catch(error){return apiError(error);}}
