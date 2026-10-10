import {apiError,requestIdentity} from "@/lib/http";import {assignmentData} from "@/features/people-operations/assets";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){try{return Response.json(await assignmentData(await requestIdentity(),{id:(await params).id}),{headers:{"Cache-Control":"private, no-store"}});}catch(e){return apiError(e);}}
