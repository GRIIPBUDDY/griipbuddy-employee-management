import { apiError,requestIdentity } from "@/lib/http";
import { readNotification } from "@/features/review/notifications";
export async function POST(_request:Request, context:{params:Promise<Record<string,string>>}) { try { const result=await readNotification(await requestIdentity(true),(await context.params).id);return Response.json(result??{success:true},{headers:{"Cache-Control":"private, no-store"}}); }catch(error){return apiError(error);} }
