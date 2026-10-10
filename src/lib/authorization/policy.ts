import type { Actor, Identity } from "@/types/auth";
import type { Role } from "@/generated/prisma/client";
import { AppError } from "@/lib/utils/errors";
export const SESSION_SECONDS = 43200;
export function assertIdentity(identity: Identity | null, now = Date.now()): asserts identity is Identity {
  if (!identity || identity.issuedAt > now || identity.absoluteExpiresAt <= now || identity.absoluteExpiresAt - identity.issuedAt !== SESSION_SECONDS * 1000)
    throw new AppError(401, "UNAUTHENTICATED", "Please sign in again.");
}
export function assertAccount(actor: Actor, version: number, allowPasswordChange = false) {
  if (!actor.isActive || actor.sessionVersion !== version) throw new AppError(401, "SESSION_REVOKED", "Please sign in again.");
  if (actor.mustChangePassword && !allowPasswordChange) throw new AppError(403, "PASSWORD_CHANGE_REQUIRED", "Change your temporary password to continue.");
  if (actor.role === "EMPLOYEE" && (!actor.employeeId || !actor.employmentActive) && !allowPasswordChange)
    throw new AppError(403, "EMPLOYMENT_INACTIVE", "Your portal access is unavailable. Contact an administrator.");
}
export function assertRole(actor: Actor, roles: readonly Role[]) {
  if (!roles.includes(actor.role)) throw new AppError(403, "ROLE_DENIED", "You do not have access to this area.");
}
export function assertEmployeeScope(actor: Actor, employeeId: string) {
  if (actor.role === "EMPLOYEE" && actor.employeeId !== employeeId) throw new AppError(404, "NOT_FOUND", "Employee record not found.");
}
export function assertOwnCommission(actor: Actor) {
  if (!actor.employeeId || !actor.employmentActive || !actor.preorderCommissionEnabled)
    throw new AppError(403, "FEATURE_DENIED", "This feature is not enabled for your account.");
}
export function assertManageCommissions(actor: Actor) {
  if (actor.role !== "ADMIN" && !(actor.role === "HR_MANAGER" && actor.canManageCommissions))
    throw new AppError(403, "FEATURE_DENIED", "You do not have permission to manage commissions.");
}
