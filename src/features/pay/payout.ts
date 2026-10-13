import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/db/audit";
import { authorizedMutation } from "@/lib/db/mutation";
import { securityBoundary } from "@/lib/authorization/actor";
import { validated, uuidSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import type { Identity } from "@/types/auth";
import { payStaff } from "./access";
/** Where an employee's salary is sent. Stored on the employee record; visible to pay staff, masked for the employee. */
export const payoutMethods = { BANK: "Bank transfer", BKASH: "bKash", NAGAD: "Nagad", ROCKET: "Rocket", CASH: "Cash" } as const;
export type Payout = { method: keyof typeof payoutMethods; accountName: string; accountNumber: string; bankName: string; branch: string; routingNumber: string };
const text = (max: number) => z.string().trim().max(max).default("");
const payoutSchema = z.object({
  employeeId: uuidSchema, method: z.enum(Object.keys(payoutMethods) as [keyof typeof payoutMethods]),
  accountName: text(100), accountNumber: z.string().trim().max(34).regex(/^[A-Za-z0-9 -]*$/, "Use letters, digits, spaces or hyphens for the account number.").default(""),
  bankName: text(100), branch: text(100), routingNumber: z.string().trim().max(20).regex(/^[0-9A-Za-z-]*$/, "Use digits or letters for the routing number.").default(""),
  reason: z.string().trim().min(1).max(500),
}).strict().superRefine((v, ctx) => {
  if (v.method !== "CASH" && (!v.accountName || !v.accountNumber)) ctx.addIssue({ code: "custom", message: "Enter the account name and number." });
  if (v.method === "BANK" && !v.bankName) ctx.addIssue({ code: "custom", message: "Enter the bank name." });
});
export function readPayout(value: unknown): Payout | null {
  if (!value || typeof value !== "object" || !("method" in value) || !((value as { method: string }).method in payoutMethods)) return null;
  const v = value as Partial<Payout>;
  return { method: v.method!, accountName: v.accountName ?? "", accountNumber: v.accountNumber ?? "", bankName: v.bankName ?? "", branch: v.branch ?? "", routingNumber: v.routingNumber ?? "" };
}
export const maskAccount = (number: string) => number.length <= 4 ? number : `•••• ${number.slice(-4)}`;
export async function payoutData(identity: Identity | null, employeeInput: unknown) {
  return securityBoundary(identity, async actor => {
    payStaff(actor); const employeeId = validated(uuidSchema, employeeInput);
    const employee = await db.employee.findUnique({ where: { id: employeeId }, select: { bankDetails: true } });
    if (!employee) throw new AppError(404, "NOT_FOUND", "Employee not found.");
    return { payout: readPayout(employee.bankDetails), canEdit: !(actor.role === "HR_MANAGER" && actor.employeeId === employeeId) };
  });
}
export async function ownPayout(identity: Identity | null) {
  return securityBoundary(identity, async actor => {
    if (!actor.employeeId) return null;
    const p = readPayout((await db.employee.findUniqueOrThrow({ where: { id: actor.employeeId }, select: { bankDetails: true } })).bankDetails);
    return p && { method: p.method, bankName: p.bankName, account: maskAccount(p.accountNumber) };
  });
}
export async function updatePayout(identity: Identity | null, input: unknown) {
  await securityBoundary(identity, async actor => payStaff(actor)); const v = validated(payoutSchema, input);
  await authorizedMutation(identity, async (actor, tx) => {
    payStaff(actor);
    if (actor.role === "HR_MANAGER" && actor.employeeId === v.employeeId) throw new AppError(403, "SELF_REVIEW", "An administrator must change your own payment details.");
    const old = await tx.employee.findUnique({ where: { id: v.employeeId }, select: { bankDetails: true } });
    if (!old) throw new AppError(404, "NOT_FOUND", "Employee not found.");
    const { employeeId, reason, ...details } = v, next: Payout = v.method === "CASH" ? { method: "CASH", accountName: "", accountNumber: "", bankName: "", branch: "", routingNumber: "" } : details;
    await tx.employee.update({ where: { id: employeeId }, data: { bankDetails: next } });
    const before = readPayout(old.bankDetails);
    // Account numbers are recorded masked in the audit trail.
    await audit({ actorUserId: actor.userId, employeeId, action: "PAYOUT_DETAILS_CHANGED", entity: "employees", entityId: employeeId, reason, before: before ? { ...before, accountNumber: maskAccount(before.accountNumber) } : undefined, after: { ...next, accountNumber: maskAccount(next.accountNumber) } }, tx);
  });
}
