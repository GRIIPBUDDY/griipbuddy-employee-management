import { z } from "zod";
import { apiError,requestIdentity } from "@/lib/http";
import { securityBoundary } from "@/lib/authorization/actor";
import { validated } from "@/lib/validation/schemas";
import { rateHistory } from "@/features/pay/rates";
export async function GET(request:Request){try{const identity=await requestIdentity(),actor=await securityBoundary(identity,async a=>a);validated(z.object({}).strict(),Object.fromEntries(new URL(request.url).searchParams));return Response.json(await rateHistory(identity,actor.employeeId??"00000000-0000-0000-0000-000000000000",true),{headers:{"Cache-Control":"private, no-store"}});}catch(e){return apiError(e);}}
