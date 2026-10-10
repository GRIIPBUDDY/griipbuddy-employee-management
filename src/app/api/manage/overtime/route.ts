import { apiError,requestIdentity,jsonBody } from "@/lib/http";
import { overtimeQueue,calculateOvertime } from "@/features/review/overtime";
export async function GET(request:Request) { try { const result=await overtimeQueue(await requestIdentity(false,true),Object.fromEntries(new URL(request.url).searchParams));return Response.json(result??{success:true},{headers:{"Cache-Control":"private, no-store"}}); }catch(error){return apiError(error);} }
export async function POST(request:Request) { try { const result=await calculateOvertime(await requestIdentity(true,true),await jsonBody(request));return Response.json(result??{success:true},{headers:{"Cache-Control":"private, no-store"}}); }catch(error){return apiError(error);} }
