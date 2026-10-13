import { z } from "zod";
import { dateSchema, passwordSchema, uuidSchema, optionCode } from "@/lib/validation/schemas";
const optionalText = (max: number) => z.string().trim().max(max).transform(v => v || null);
const optionalDate = z.union([dateSchema, z.literal("")]).transform(v => v ? new Date(`${v}T00:00:00.000Z`) : null);
export const contactFields = {
  phone: optionalText(30), address: optionalText(500),
  emergencyName: optionalText(100), emergencyPhone: optionalText(30), emergencyRelationship: optionalText(50),
};
export const contactSchema = z.object(contactFields).strict();
export const personalSchema = z.object({
  employeeNumber: z.string().trim().min(1).max(32), legalName: z.string().trim().min(1).max(150),
  preferredName: optionalText(100), dateOfBirth: optionalDate.refine(v => !v || v <= new Date(), "Date of birth cannot be in the future."), gender: optionalText(50), nationality: optionalText(100), ...contactFields,
}).strict();
export const employmentSchema = z.object({
  startDate: dateSchema.transform(v => new Date(`${v}T00:00:00.000Z`)), endDate: optionalDate,
  departmentId: z.union([uuidSchema, z.literal("")]).optional().transform(v => v || null),
  positionId: z.union([uuidSchema, z.literal("")]).optional().transform(v => v || null),
  departmentLabel: z.string().trim().max(100).default(""), positionLabel: z.string().trim().max(100).default(""),
  employmentType: optionCode,
  workLocation: optionalText(100), probationEndDate: optionalDate,
  managerEmployeeId: z.union([uuidSchema, z.literal("")]).transform(v => v || null),
}).strict().superRefine((v, ctx) => {
  if (!v.departmentId && !v.departmentLabel || !v.positionId && !v.positionLabel) ctx.addIssue({ code: "custom", message: "Choose a department and position." });
  if (v.endDate && v.endDate <= v.startDate) ctx.addIssue({ code: "custom", message: "End date must follow join date." });
  if (v.probationEndDate && v.probationEndDate < v.startDate) ctx.addIssue({ code: "custom", message: "Probation cannot end before joining." });
});
export const newEmployeeSchema = z.object({
  personal: personalSchema, employment: employmentSchema,
  userId: z.union([uuidSchema, z.literal("")]),
  email: z.union([z.email().trim().toLowerCase().max(254), z.literal("")]),
  temporaryPassword: z.union([passwordSchema, z.literal("")]),
}).strict();
export const updateEmployeeSchema = z.object({ employeeId: uuidSchema, expectedUpdatedAt: z.iso.datetime(), personal: personalSchema }).strict();
export const updateEmploymentSchema = z.object({ employeeId: uuidSchema, periodId: uuidSchema, revision: z.number().int().positive(), employment: employmentSchema, reason: z.string().trim().min(1).max(500) }).strict();
export const deactivateSchema = z.object({ employeeId: uuidSchema, reason: z.string().trim().min(1).max(500) }).strict();
export const recordSchema = z.object({
  employeeId: uuidSchema, type: z.enum(["ACHIEVEMENT", "WORK_NOTE", "TRAINING", "ONBOARDING", "IMPORTANT_EVENT", "OTHER"]),
  title: z.string().trim().min(1).max(150), description: z.string().trim().min(1).max(5000),
  eventDate: dateSchema, employeeVisible: z.boolean(),
}).strict();
export const correctRecordSchema = recordSchema.extend({ recordId: uuidSchema, expectedUpdatedAt: z.iso.datetime(), reason: z.string().trim().min(1).max(500) });
export const deleteRecordSchema = z.object({ employeeId: uuidSchema, recordId: uuidSchema, reason: z.string().trim().min(1).max(500) }).strict();
export const documentSchema = z.object({
  employeeId: uuidSchema, type: optionCode,
  displayName: z.string().trim().min(1).max(150).refine(v => !Array.from(v).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127), "Use a plain document name."),
  issuedOn: optionalDate, expiresOn: optionalDate,
  employeeVisible: z.boolean(), profilePhoto: z.boolean(),
  employmentPeriodId: z.union([uuidSchema, z.literal("")]).transform(v => v || null),
}).strict().refine(v => !v.issuedOn || !v.expiresOn || v.expiresOn >= v.issuedOn, "Expiry cannot precede issue date.");
export const documentVisibilitySchema = z.object({ employeeId: uuidSchema, documentId: uuidSchema, employeeVisible: z.boolean(), reason: z.string().trim().min(1).max(500) }).strict();
export const deleteDocumentSchema = z.object({ employeeId: uuidSchema, documentId: uuidSchema, reason: z.string().trim().min(1).max(500) }).strict();
