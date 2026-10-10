import "server-only";
import type { Actor, Identity } from "@/types/auth";
import type { Database } from "@/lib/db/audit";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/db/audit";
import { assertIdentity, assertAccount } from "./policy";
import { AppError, logUnexpected } from "@/lib/utils/errors";
import { businessDate } from "@/lib/utils/business-date";
import { validated, uuidSchema } from "@/lib/validation/schemas";

export async function loadActor(identity: Identity | null, client: Database = db, allowPasswordChange = false): Promise<Actor> {
  assertIdentity(identity);
  validated(uuidSchema, identity.userId);
  const account = await client.user.findUnique({ where: { id: identity.userId }, select: {
    id: true, email: true, displayName: true, role: true, isActive: true, sessionVersion: true, mustChangePassword: true,
    temporaryPasswordExpiresAt: true, canManageCommissions: true,
    employee: { select: { id: true, legalName: true, preferredName: true, preorderCommissionEnabled: true,
      employmentPeriods: { select: { startDate: true, endDate: true } } } },
  } });
  if (!account) throw new AppError(401, "UNAUTHENTICATED", "Please sign in again.");
  if (account.mustChangePassword && (!account.temporaryPasswordExpiresAt || account.temporaryPasswordExpiresAt <= new Date()))
    throw new AppError(401, "TEMPORARY_PASSWORD_EXPIRED", "Please request a new temporary password.");
  const settings = await client.organizationSettings.findUnique({ where: { id: 1 }, select: { timezone: true } });
  if (!settings) throw new Error("Organization is not initialized");
  const today = businessDate(settings.timezone);
  const actor: Actor = {
    ...identity, sessionVersion: account.sessionVersion, role: account.role, isActive: account.isActive, email: account.email,
    name: account.employee?.preferredName ?? account.employee?.legalName ?? account.displayName ?? "Team member",
    mustChangePassword: account.mustChangePassword, employeeId: account.employee?.id ?? null,
    employmentActive: account.employee?.employmentPeriods.some(p => p.startDate <= today && (!p.endDate || today < p.endDate)) ?? false,
    preorderCommissionEnabled: account.employee?.preorderCommissionEnabled ?? false, canManageCommissions: account.canManageCommissions,
  };
  assertAccount(actor, identity.sessionVersion, allowPasswordChange);
  return actor;
}
export async function securityBoundary<T>(identity: Identity | null, operation: (actor: Actor) => Promise<T>, allowPasswordChange = false): Promise<T> {
  let actor: Actor | undefined;
  try { actor = await loadActor(identity, undefined, allowPasswordChange); return await operation(actor); }
  catch (error) {
    if (error instanceof AppError && (error.status === 403 || error.status === 404)) {
      // Suppress repeated actor/reason denial events for a minute; retained history is never purged.
      const recent = await db.auditLog.findFirst({ where: { actorUserId: actor?.userId ?? null, action: "AUTHORIZATION_DENIED", reason: error.code, eventTime: { gte: new Date(Date.now() - 60000) } }, select: { id: true } });
      if (!recent) await audit({ actorUserId: actor?.userId, systemSource: actor ? undefined : "authorization", action: "AUTHORIZATION_DENIED", entity: "security", reason: error.code });
    }
    if (!(error instanceof AppError)) {
      logUnexpected("data_operation_failed");
      // eslint-disable-next-line preserve-caught-error -- Prevent ORM parameters/secrets being printed by framework error logging.
      throw new Error("The requested operation could not be completed.");
    }
    throw error;
  }
}
