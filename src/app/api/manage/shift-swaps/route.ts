import { requestIdentity,jsonBody,apiError } from "@/lib/http";
import { swapData,decideSwap } from "@/features/time/swaps";
export async function GET(){try{return Response.json(await swapData(await requestIdentity(false,true),true),{headers:{"Cache-Control":"private, no-store"}});}catch(e){return apiError(e);}}
export async function POST(r:Request){try{await decideSwap(await requestIdentity(true,true),await jsonBody(r));return Response.json({saved:true});}catch(e){return apiError(e);}}
