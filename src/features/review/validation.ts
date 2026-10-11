import { z } from "zod";
import { dateSchema, uuidSchema } from "@/lib/validation/schemas";
const optionalId = z.union([uuidSchema,z.literal("")]).default("").transform(v=>v||null);
const instant = z.iso.datetime({offset:true}).refine(v=>new Date(v).getMilliseconds()===0,"Use whole seconds.");
const optionalTime = z.union([instant,z.literal("")]).default("").transform(v=>v?new Date(v):null);
export const reasonSchema=z.string().trim().min(1).max(500);
export const correctionSchema=z.object({type:z.enum(["ADD","REPLACE","VOID"]),sessionId:optionalId,workDate:dateSchema,scheduleSlotId:optionalId,checkinAt:optionalTime,checkoutAt:optionalTime,reason:reasonSchema,operationKey:uuidSchema}).strict()
 .refine(v=>v.type==="ADD" ? !v.sessionId : !!v.sessionId,"ADD has no target; REPLACE/VOID require a session.")
 .refine(v=>v.type==="VOID" || !!v.checkinAt && !!v.checkoutAt && v.checkoutAt>v.checkinAt,"Provide a positive completed interval.")
 .refine(v=>v.type!=="VOID" || !v.checkinAt && !v.checkoutAt && !v.scheduleSlotId,"VOID only needs the target and explanation.");
export const correctionDecisionSchema=z.object({id:uuidSchema,decision:z.enum(["APPROVED","REJECTED"]),comment:reasonSchema}).strict();
export const withdrawSchema=z.object({id:uuidSchema}).strict();
export const overtimeCalculationSchema=z.object({employeeId:uuidSchema,week:dateSchema}).strict();
export const overtimeDecisionSchema=z.object({id:uuidSchema,revision:z.number().int().positive(),decision:z.enum(["APPROVED","REJECTED"]),approvedSeconds:z.number().int().nonnegative(),comment:z.string().trim().max(500).default("")}).strict().refine(v=>v.decision!=="APPROVED"||v.comment.length>0,"Explain the overtime approval.");
export const filterSchema=z.object({employeeId:optionalId,departmentId:optionalId,from:dateSchema.optional(),until:dateSchema.optional(),status:z.enum(["","LATE","INCOMPLETE","MISSING","EARLY","PENDING_CORRECTION"]).default(""),overtimeStatus:z.enum(["","PENDING","APPROVED","REJECTED","NOT_REQUIRED","STALE","UNREVIEWED"]).default(""),page:z.coerce.number().int().min(1).max(10000).default(1)}).strict();
export const ownSummarySchema=z.object({from:dateSchema.optional(),until:dateSchema.optional()}).strict();
export const listSchema=z.object({status:z.enum(["","PENDING","APPROVED","REJECTED","WITHDRAWN","STALE","NOT_REQUIRED"]).default(""),page:z.coerce.number().int().min(1).max(10000).default(1)}).strict();
export const overtimeQueueSchema=listSchema.extend({search:z.string().trim().max(150).default("")});
export const policySchema=z.object({effectiveFrom:dateSchema,thresholdSeconds:z.number().int().min(1).max(604800),weekStartDay:z.number().int().min(1).max(7),reason:reasonSchema}).strict();
export const leaveCategory=z.enum(["ANNUAL","SICK","PERSONAL","EMERGENCY","UNPAID","OTHER"]);
export const leaveSchema=z.object({startAt:instant.transform(v=>new Date(v)),endAt:instant.transform(v=>new Date(v)),type:z.enum(["PAID","UNPAID"]),category:leaveCategory.default("OTHER"),operationKey:uuidSchema.optional(),reason:reasonSchema}).strict().refine(v=>v.endAt>v.startAt,"Leave end must follow start.").refine(v=>v.category!=="UNPAID"||v.type==="UNPAID","Unpaid leave must use unpaid treatment.");
export const datedLeaveSchema=z.object({startDate:dateSchema,endDate:dateSchema,type:z.enum(["PAID","UNPAID"]),category:leaveCategory,operationKey:uuidSchema,reason:reasonSchema}).strict().refine(v=>v.endDate>=v.startDate,"End date must be on or after start date.").refine(v=>v.category!=="UNPAID"||v.type==="UNPAID","Unpaid leave must use unpaid treatment.");
export const leaveFilterSchema=z.object({employeeId:uuidSchema.optional(),id:uuidSchema.optional(),from:dateSchema.optional(),until:dateSchema.optional(),status:z.enum(["PENDING","APPROVED","REJECTED","WITHDRAWN","CANCELLED"]).optional(),category:leaveCategory.optional()}).strict().refine(v=>!v.from||!v.until||v.until>v.from,"End must follow start.");
export const leaveDecisionSchema=z.object({id:uuidSchema,revision:z.number().int().positive(),decision:z.enum(["APPROVED","REJECTED","CANCELLED"]),comment:z.string().trim().max(500).default("")}).strict().refine(v=>v.decision!=="CANCELLED"||v.comment.length>0,"Explain cancellation of approved leave.");
export const holidaySchema=z.object({date:dateSchema,name:z.string().trim().min(1).max(100),reason:reasonSchema}).strict();
export const weekReadSchema=z.object({week:dateSchema.optional()}).strict();
