import { z } from "zod";
import { dateSchema, uuidSchema } from "@/lib/validation/schemas";
import { addDays } from "./dates";
export const slotSchema = z.object({ weekday: z.number().int().min(1).max(7), startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(0).max(1439), endDayOffset: z.number().int().min(0).max(1) }).strict()
  .refine(s => s.endMinute + s.endDayOffset * 1440 - s.startMinute > 0 && s.endMinute + s.endDayOffset * 1440 - s.startMinute <= 1440, "A scheduled period must have a positive duration of at most 24 local hours.");
export const publishSchema = z.object({
  employeeId: uuidSchema, employmentPeriodId: uuidSchema,
  effectiveFrom: dateSchema, effectiveUntil: z.union([dateSchema, z.literal("")]).transform(v => v || null),
  label: z.string().trim().max(100).transform(v => v || null), reason: z.string().trim().min(1).max(500),
  baseScheduleId: z.union([uuidSchema, z.literal("")]).default("").transform(v => v || null), baseRevision: z.number().int().positive().optional(),
  holidayWorkRequired: z.boolean().default(false),
  duration:z.enum(["CUSTOM","WEEK","INDEFINITE"]).default("CUSTOM"),editScope:z.enum(["CUSTOM","OCCURRENCE","FUTURE","SERIES"]).default("CUSTOM"),
  slots: z.array(slotSchema), restoreSlots: z.array(slotSchema).optional(),
}).strict().transform(v=>({...v,effectiveUntil:v.duration==="WEEK"?addDays(v.effectiveFrom,7):v.duration==="INDEFINITE"?null:v.effectiveUntil})).refine(v => !v.effectiveUntil || v.effectiveUntil > v.effectiveFrom, "Effective end must follow start and is exclusive.")
 .refine(v => !v.holidayWorkRequired || !!v.effectiveUntil && v.slots.length>0, "Required holiday work needs a bounded temporary pattern.")
 .refine(v => !v.baseScheduleId || v.baseRevision !== undefined, "Reload the schedule before editing.");
export const checkinSchema = z.object({ slotId: uuidSchema, workDate: dateSchema, operationKey: uuidSchema }).strict();
export const checkoutSchema = z.object({ sessionId: uuidSchema, operationKey: uuidSchema }).strict();
export const scheduleReadSchema = z.object({ week: dateSchema.optional() }).strict();
export const historyReadSchema = z.object({from:dateSchema.optional(),until:dateSchema.optional(), page: z.coerce.number().int().min(1).max(10000).default(1) }).strict();
export type SlotInput = z.infer<typeof slotSchema>;
