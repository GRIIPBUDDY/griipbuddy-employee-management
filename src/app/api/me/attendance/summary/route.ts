import { apiError,requestIdentity } from "@/lib/http";
import { ownSummary } from "@/features/review/data";
export async function GET(request:Request) { try { const result=await ownSummary(await requestIdentity(),Object.fromEntries(new URL(request.url).searchParams));return Response.json(result??{success:true},{headers:{"Cache-Control":"private, no-store"}}); }catch(error){return apiError(error);} }
