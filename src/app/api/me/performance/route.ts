import {apiError,requestIdentity} from "@/lib/http";import {recordData} from "@/features/people-operations/records";
export async function GET(request:Request){try{return Response.json(await recordData(await requestIdentity(),"performance",Object.fromEntries(new URL(request.url).searchParams)),{headers:{"Cache-Control":"private, no-store"}});}catch(e){return apiError(e);}}
