import {apiError,requestIdentity} from "@/lib/http";import {assignmentData} from "@/features/people-operations/assets";
export async function GET(request:Request){try{return Response.json(await assignmentData(await requestIdentity(),Object.fromEntries(new URL(request.url).searchParams)),{headers:{"Cache-Control":"private, no-store"}});}catch(e){return apiError(e);}}
