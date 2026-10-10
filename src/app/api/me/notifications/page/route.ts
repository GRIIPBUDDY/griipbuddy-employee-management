import { apiError,requestIdentity } from "@/lib/http";
import { notificationPage } from "@/features/review/notifications";
export async function GET(request:Request){try{return Response.json(await notificationPage(await requestIdentity(),Object.fromEntries(new URL(request.url).searchParams)),{headers:{"Cache-Control":"private, no-store"}});}catch(error){return apiError(error);}}
