import { requestIdentity,jsonBody,apiError } from "@/lib/http";
import { taskData,assignTasks,editTask } from "@/features/tasks/service";
export async function GET(r:Request){try{return Response.json(await taskData(await requestIdentity(false,true),Object.fromEntries(new URL(r.url).searchParams)),{headers:{"Cache-Control":"private, no-store"}});}catch(e){return apiError(e);}}
export async function POST(r:Request){try{return Response.json({ids:await assignTasks(await requestIdentity(true,true),await jsonBody(r))});}catch(e){return apiError(e);}}
export async function PATCH(r:Request){try{await editTask(await requestIdentity(true,true),await jsonBody(r));return Response.json({saved:true});}catch(e){return apiError(e);}}
