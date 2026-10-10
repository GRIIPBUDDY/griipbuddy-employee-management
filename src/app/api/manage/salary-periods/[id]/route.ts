import { z } from "zod";
import { apiError,requestIdentity,jsonBody } from "@/lib/http";
import { validated } from "@/lib/validation/schemas";
import { periodData,calculatePeriod,transitionPeriod } from "@/features/pay/periods";
type Context={params:Promise<{id:string}>};
const input=z.discriminatedUnion("kind",[z.object({kind:z.literal("calculate"),revision:z.number().int().positive()}).strict(),z.object({kind:z.literal("transition"),revision:z.number().int().positive(),status:z.enum(["REVIEWED","APPROVED","FINALIZED"])}).strict()]);
export async function GET(_:Request,c:Context){try{return Response.json(await periodData(await requestIdentity(false,true),{id:(await c.params).id}),{headers:{"Cache-Control":"private, no-store"}});}catch(e){return apiError(e);}}
export async function POST(request:Request,c:Context){try{const identity=await requestIdentity(true,true),v=validated(input,await jsonBody(request)),periodId=(await c.params).id;return Response.json(v.kind==="calculate"?await calculatePeriod(identity,{periodId,revision:v.revision}):await transitionPeriod(identity,{periodId,revision:v.revision,status:v.status}),{headers:{"Cache-Control":"private, no-store"}});}catch(e){return apiError(e);}}
