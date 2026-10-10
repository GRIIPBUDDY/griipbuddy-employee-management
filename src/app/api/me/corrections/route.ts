import { apiError,requestIdentity,jsonBody } from "@/lib/http";
import { correctionList,submitCorrection } from "@/features/review/corrections";
export async function GET(request:Request) { try { const result=await correctionList(await requestIdentity(),Object.fromEntries(new URL(request.url).searchParams));return Response.json(result??{success:true},{headers:{"Cache-Control":"private, no-store"}}); }catch(error){return apiError(error);} }
export async function POST(request:Request) { try { const result=await submitCorrection(await requestIdentity(true),await jsonBody(request));return Response.json(result??{success:true},{headers:{"Cache-Control":"private, no-store"}}); }catch(error){return apiError(error);} }
