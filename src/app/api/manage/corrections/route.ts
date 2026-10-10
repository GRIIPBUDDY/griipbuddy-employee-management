import { apiError,requestIdentity } from "@/lib/http";
import { correctionList } from "@/features/review/corrections";
export async function GET(request:Request) { try { const result=await correctionList(await requestIdentity(false,true),Object.fromEntries(new URL(request.url).searchParams),true);return Response.json(result??{success:true},{headers:{"Cache-Control":"private, no-store"}}); }catch(error){return apiError(error);} }
