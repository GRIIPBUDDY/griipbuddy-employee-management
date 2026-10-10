import {apiError,requestIdentity} from "@/lib/http";import {recordData} from "@/features/people-operations/records";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){try{return Response.json(await recordData(await requestIdentity(),"performance",{id:(await params).id}),{headers:{"Cache-Control":"private, no-store"}});}catch(e){return apiError(e);}}
