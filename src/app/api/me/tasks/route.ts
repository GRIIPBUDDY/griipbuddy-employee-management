import { requestIdentity,jsonBody,apiError } from "@/lib/http";
import { taskData,updateTaskProgress } from "@/features/tasks/service";
export async function GET(r:Request){try{return Response.json(await taskData(await requestIdentity(),Object.fromEntries(new URL(r.url).searchParams),true),{headers:{"Cache-Control":"private, no-store"}});}catch(e){return apiError(e);}}
export async function POST(r:Request){try{return Response.json({id:await updateTaskProgress(await requestIdentity(true),await jsonBody(r))});}catch(e){return apiError(e);}}
