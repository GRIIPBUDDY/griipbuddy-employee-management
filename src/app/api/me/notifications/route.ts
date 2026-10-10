import { apiError,requestIdentity } from "@/lib/http";
import { notificationList } from "@/features/review/notifications";
export async function GET() { try { const result=await notificationList(await requestIdentity());return Response.json(result??{success:true},{headers:{"Cache-Control":"private, no-store"}}); }catch(error){return apiError(error);} }
