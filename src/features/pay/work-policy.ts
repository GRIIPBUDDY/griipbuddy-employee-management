import "server-only";
import { z } from "zod";
import { authorizedMutation } from "@/lib/db/mutation";
import { securityBoundary } from "@/lib/authorization/actor";
import { assertRole } from "@/lib/authorization/policy";
import { validated,dateSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/db/audit";
import { databaseNow } from "@/features/time/clock";
import { localDate } from "@/features/time/dates";
import { localWeek } from "@/features/review/calculation";
import { AppError } from "@/lib/utils/errors";
import type { Identity } from "@/types/auth";
export async function updateStandardHours(identity:Identity|null,input:unknown){
 await securityBoundary(identity,async a=>assertRole(a,["ADMIN","HR_MANAGER"]));const v=validated(z.object({effectiveFrom:dateSchema,hours:z.number().int().min(1).max(168),reason:z.string().trim().min(1).max(500)}).strict(),input);
 return authorizedMutation(identity,async(a,tx)=>{assertRole(a,["ADMIN","HR_MANAGER"]);const old=await tx.organizationSettings.findUniqueOrThrow({where:{id:1}}),history=old.standardHoursVersions as {effectiveFrom:string;hours:number}[],today=localDate(await databaseNow(tx),old.timezone);
 if(v.effectiveFrom<=today || v.effectiveFrom!==localWeek(v.effectiveFrom,old.weekStartDay) || v.effectiveFrom<=history.at(-1)!.effectiveFrom)throw new AppError(400,"POLICY_DATE","Append a future organization-local workweek start.");
 const next=[...history,{effectiveFrom:v.effectiveFrom,hours:v.hours}];await tx.organizationSettings.update({where:{id:1},data:{standardHoursVersions:next,changedBy:a.userId,rulesVersion:{increment:1}}});await audit({actorUserId:a.userId,action:"STANDARD_HOURS_CHANGED",entity:"organization_settings",entityId:"1",reason:v.reason,before:{standardHours:history},after:{standardHours:next}},tx);
 });
}
