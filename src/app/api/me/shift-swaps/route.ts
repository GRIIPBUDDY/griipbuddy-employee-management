import { requestIdentity,jsonBody,apiError } from "@/lib/http";
import { swapData,requestSwap,consentSwap } from "@/features/time/swaps";
export async function GET(){try{return Response.json(await swapData(await requestIdentity()),{headers:{"Cache-Control":"private, no-store"}});}catch(e){return apiError(e);}}
export async function POST(r:Request){try{return Response.json({id:await requestSwap(await requestIdentity(true),await jsonBody(r))});}catch(e){return apiError(e);}}
export async function PATCH(r:Request){try{await consentSwap(await requestIdentity(true),await jsonBody(r));return Response.json({saved:true});}catch(e){return apiError(e);}}
