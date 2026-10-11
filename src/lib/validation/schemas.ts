import { z } from "zod";
export const uuidSchema = z.uuid();
const email = z.string().trim().toLowerCase().email().max(254);
export const loginSchema = z.object({ email, password: z.string().min(1).max(128) });
const commonPasswords = new Set(["password1234", "password123456", "123456789012", "qwerty123456", "changeme12345", "welcome123456", "administrator"]);
export const passwordSchema = z.string().min(12, "Use at least 12 characters.").max(128, "Use no more than 128 characters.")
  .refine(v => !commonPasswords.has(v.toLowerCase()), "Choose a less common password.");
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), password: passwordSchema, confirmPassword: z.string().max(128) })
  .refine(v => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords must match." })
  .refine(v => v.currentPassword !== v.password, { path: ["password"], message: "Choose a new password." });
export const dateSchema = z.iso.date();
const label = z.string().trim().min(1).max(100);
export const createAccountSchema = z.object({
  email, displayName: label, role: z.enum(["ADMIN", "HR_MANAGER", "EMPLOYEE"]), temporaryPassword: passwordSchema,
  createEmployee: z.boolean(), employeeNumber: z.string().trim().max(32), legalName: z.string().trim().max(150),
  startDate: z.union([dateSchema, z.literal("")]), departmentLabel: z.string().trim().max(100), positionLabel: z.string().trim().max(100),
}).superRefine((v, ctx) => {
  if (v.role === "EMPLOYEE" && !v.createEmployee) ctx.addIssue({ code: "custom", path: ["createEmployee"], message: "Employees require an employee profile." });
  if (v.createEmployee) for (const key of ["employeeNumber", "legalName", "startDate", "departmentLabel", "positionLabel"] as const) {
    if (!v[key]) ctx.addIssue({ code: "custom", path: [key], message: "Employee fields are required." });
  }
});
export const accountSecuritySchema = z.object({ userId: uuidSchema, role: z.enum(["ADMIN", "HR_MANAGER", "EMPLOYEE"]), isActive: z.boolean(), canManageCommissions: z.boolean(), preorderCommissionEnabled: z.boolean() });
export const resetPasswordSchema = z.object({ userId: uuidSchema, temporaryPassword: passwordSchema });
export const settingsSchema = z.object({ companyName: z.string().trim().min(1).max(150), timezone: z.string().min(1).max(100).refine(v => {
  try { new Intl.DateTimeFormat("en", { timeZone: v }); return true; } catch { return false; }
}, "Choose a valid IANA timezone."), currency: z.string().trim().toUpperCase().refine(v => Intl.supportedValuesOf("currency").includes(v), "Choose a supported three-letter currency code.").optional(), earlyCheckinMinutes: z.coerce.number().int().min(0).max(60) });
export function validated<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new AppError(400, "VALIDATION", result.error.issues[0]?.message ?? "Check the supplied information.");
  return result.data;
}
import { AppError } from "@/lib/utils/errors";
