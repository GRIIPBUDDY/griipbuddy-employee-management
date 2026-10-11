import "server-only";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/db/audit";
import { authorizedMutation } from "@/lib/db/mutation";
import { securityBoundary } from "@/lib/authorization/actor";
import { assertRole } from "@/lib/authorization/policy";
import { validated, settingsSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import type { Identity } from "@/types/auth";
import { localDate, dateValue } from "@/features/time/dates";
import { databaseNow } from "@/features/time/clock";
export async function backupStatus(identity: Identity | null) {
  return securityBoundary(identity, async actor => {
    assertRole(actor, ["ADMIN"]);
    const { lastSuccessfulBackupAt } = await db.organizationSettings.findUniqueOrThrow({ where: { id: 1 }, select: { lastSuccessfulBackupAt: true } });
    const now = await databaseNow(db);
    return { lastSuccessfulBackupAt, status: lastSuccessfulBackupAt === null ? "NEVER_VERIFIED" : now.getTime() - lastSuccessfulBackupAt.getTime() > 86400000 ? "STALE" : "CURRENT" };
  });
}
export async function organizationSummary(identity: Identity | null) {
  return securityBoundary(identity, () => db.organizationSettings.findUniqueOrThrow({ where: { id: 1 }, select: { companyName: true, timezone: true, currency: true, earlyCheckinMinutes: true, weekStartDay: true, overtimePolicyVersions: true } }));
}
export async function updateSettings(identity: Identity | null, input: unknown) {
  await securityBoundary(identity, async actor => assertRole(actor, ["ADMIN"]));
  const value = validated(settingsSchema, input);
  await authorizedMutation(identity, async (actor, tx) => {
    assertRole(actor, ["ADMIN"]);
    const old = await tx.organizationSettings.findUniqueOrThrow({ where: { id: 1 } });
    if (value.timezone !== old.timezone && (await tx.workSchedule.count() || await tx.attendanceSession.count() || await tx.leaveRequest.count() || await tx.calendarDay.count() || await tx.overtimeReview.count() || await tx.compensationRate.count() || await tx.salaryPeriod.count() || await tx.preorder.count())) throw new AppError(409, "TIMEZONE_FROZEN", "Timezone is fixed after schedules or attendance exist. A historical transition requires a reviewed architecture revision.");
    if (value.currency && value.currency !== old.currency) {
      const today = dateValue(localDate(await databaseNow(tx), old.timezone));
      if (await tx.compensationRate.count({where:{supersededAt:null,OR:[{effectiveUntil:null},{effectiveUntil:{gt:today}}]}}) ||
          await tx.salaryPeriod.count({where:{status:{not:"FINALIZED"}}}) ||
          await tx.weeklyEarningStatement.count({where:{status:{not:"FINALIZED"}}}) ||
          await tx.preorder.count({where:{status:{in:["PENDING","APPROVED"]},includedWeeklyStatementId:null,includedSalaryCalculationId:null}}))
        throw new AppError(409, "CURRENCY_IN_USE", "Close outstanding payroll, commission claims and active compensation terms before changing the default currency. Existing amounts will retain their recorded currency.");
    }
    await tx.organizationSettings.update({ where: { id: 1 }, data: { ...value, changedBy: actor.userId, rulesVersion: { increment: 1 } } });
    await audit({ actorUserId: actor.userId, action: "SETTINGS_CHANGED", entity: "organization_settings", entityId: "1",
      before: { companyName: old.companyName, timezone: old.timezone, currency: old.currency, earlyCheckinMinutes: old.earlyCheckinMinutes }, after: value }, tx);
  });
}
