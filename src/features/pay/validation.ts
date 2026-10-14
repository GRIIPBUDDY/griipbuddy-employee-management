import { z } from "zod";
import { uuidSchema,dateSchema,optionCode } from "@/lib/validation/schemas";
export const amountSchema=z.string().regex(/^\d{1,12}(\.\d{1,4})?$/,"Use a nonnegative decimal amount, with up to four decimal places.");
export const signed=z.string().regex(/^-?\d{1,12}(\.\d{1,2})?$/,"Use a signed amount with up to two decimals.");
const reason=z.string().trim().min(1).max(500);
const optionalId=z.union([uuidSchema,z.literal("")]).transform(v=>v||undefined).optional();
export const rateSchema=z.object({employeeId:uuidSchema,employmentPeriodId:uuidSchema,effectiveFrom:dateSchema,effectiveUntil:z.union([dateSchema,z.literal("")]).optional(),payType:z.enum(["MONTHLY","HOURLY","DAILY"]),baseAmount:amountSchema,overtimeHourlyRate:z.union([amountSchema,z.literal("")]).optional(),overtimeHourlyEquivalent:z.union([amountSchema,z.literal("")]).optional(),overtimeMultiplier:amountSchema,reason,baseRateId:optionalId,revision:z.number().int().positive().optional()}).strict().superRefine((v,c)=>{
 if(v.effectiveUntil && v.effectiveUntil<=v.effectiveFrom)c.addIssue({code:"custom",message:"Rate end must follow its start."});
 if(Number(v.overtimeMultiplier)<1 || Number(v.overtimeMultiplier)>100)c.addIssue({code:"custom",message:"Choose an overtime multiplier from 1 to 100."});
 if(v.payType==="HOURLY" && v.overtimeHourlyEquivalent)c.addIssue({code:"custom",message:"Hourly overtime derives its hourly equivalent from the base rate."});
 if(v.baseRateId && !v.revision)c.addIssue({code:"custom",message:"Refresh the selected rate before replacing it."});
});
export const periodSchema=z.object({month:z.string().regex(/^\d{4}-\d{2}$/)}).strict();
export const calculationSchema=z.object({periodId:uuidSchema,revision:z.number().int().positive()}).strict();
export const transitionSchema=calculationSchema.extend({status:z.enum(["REVIEWED","APPROVED","FINALIZED"])}).strict();
export const adjustmentSchema=z.object({employeeId:uuidSchema,periodId:uuidSchema,type:optionCode,amount:signed,reason,operationKey:uuidSchema,earningWeekDate:dateSchema.optional()}).strict();
export const decisionSchema=z.object({id:uuidSchema,revision:z.number().int().positive(),decision:z.enum(["APPROVED","REJECTED"]),comment:z.string().trim().max(500)}).strict();
export const ownPreorderSchema=z.object({reference:z.string().trim().toUpperCase().min(1).max(100),orderValue:z.union([amountSchema,z.literal("")]).optional(),reason}).strict();
export const staffPreorderSchema=ownPreorderSchema.extend({employeeId:uuidSchema,orderAt:z.iso.datetime({offset:true}),eligibilityEvidenceId:uuidSchema,commissionType:z.enum(["FIXED","PERCENT"]),commissionValue:amountSchema,id:optionalId,revision:z.number().int().positive().optional()}).strict();
export const assignSchema=z.object({id:uuidSchema,revision:z.number().int().positive(),periodId:uuidSchema,reason}).strict();
export const commissionPolicySchema=z.object({type:z.enum(["FIXED","PERCENT"]),value:amountSchema,reason}).strict().refine(v=>v.type!=="PERCENT" || Number(v.value)<=100,{message:"Percentage must be from zero through 100."});
export const reconcileSchema=z.object({originalCalculationId:uuidSchema,targetPeriodId:uuidSchema,operationKey:uuidSchema,reason,revision:z.number().int().positive().optional(),commissionChange:z.object({preorderId:uuidSchema,amount:amountSchema}).strict().optional()}).strict();
export const listSchema=z.object({page:z.coerce.number().int().min(1).max(10000).default(1),id:uuidSchema.optional(),status:z.string().max(20).optional()}).strict();

export const editAdjustmentSchema=z.object({id:uuidSchema,revision:z.number().int().positive(),amount:signed,reason}).strict();
