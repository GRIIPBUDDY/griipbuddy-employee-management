import { requestIdentity,jsonBody,apiError } from "@/lib/http";
import { z } from "zod";
import { validated } from "@/lib/validation/schemas";
import { changeEmployeeStatus,setCommissionEligibility } from "@/features/accounts/controls";
export async function POST(r:Request){try{const identity=await requestIdentity(true,true),v=validated(z.object({kind:z.enum(["status","eligibility"]),data:z.unknown()}).strict(),await jsonBody(r));await (v.kind==="status"?changeEmployeeStatus:setCommissionEligibility)(identity,v.data);return Response.json({saved:true});}catch(e){return apiError(e);}}
