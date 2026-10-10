import { apiError,requestIdentity } from "@/lib/http";
import { ownOvertime } from "@/features/review/overtime";
export async function GET(request:Request) { try { const result=await ownOvertime(await requestIdentity(),Object.fromEntries(new URL(request.url).searchParams));return Response.json(result??{success:true},{headers:{"Cache-Control":"private, no-store"}}); }catch(error){return apiError(error);} }
