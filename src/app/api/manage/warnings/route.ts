import {apiError,requestIdentity,jsonBody} from "@/lib/http";
import {recordData,createRecord} from "@/features/people-operations/records";
export async function GET(request:Request){try{return Response.json(await recordData(await requestIdentity(false,true),"warnings",Object.fromEntries(new URL(request.url).searchParams),true),{headers:{"Cache-Control":"private, no-store"}});}catch(e){return apiError(e);}}
export async function POST(request:Request){try{return Response.json(await createRecord(await requestIdentity(true,true),"warnings",await jsonBody(request)),{status:201,headers:{"Cache-Control":"private, no-store"}});}catch(e){return apiError(e);}}
