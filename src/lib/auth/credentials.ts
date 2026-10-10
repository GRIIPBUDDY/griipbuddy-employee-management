import "server-only";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/db/audit";
import { loginSchema } from "@/lib/validation/schemas";
import { verifyPassword, verifyUnknown } from "./passwords";

export async function authenticateCredentials(input: unknown) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return null;
  const { email, password } = parsed.data;
  const candidate = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!candidate) { await verifyUnknown(password); return null; }
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${candidate.id}::uuid FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: candidate.id } });
    const now = new Date();
    if (!user.isActive || (user.lockedUntil && user.lockedUntil > now) ||
      (user.mustChangePassword && (!user.temporaryPasswordExpiresAt || user.temporaryPasswordExpiresAt <= now))) {
      await verifyUnknown(password);
      return null;
    }
    if (!await verifyPassword(user.passwordHash, password)) {
      const recent = user.lastFailedLoginAt && now.getTime() - user.lastFailedLoginAt.getTime() < 15 * 60 * 1000;
      const failures = (recent ? user.failedLoginCount : 0) + 1;
      await tx.user.update({ where: { id: user.id }, data: { failedLoginCount: failures, lastFailedLoginAt: now, lockedUntil: failures >= 5 ? new Date(now.getTime() + 15 * 60 * 1000) : null } });
      if (failures === 5) await audit({ actorUserId: user.id, action: "LOGIN_LOCKED", entity: "users", entityId: user.id }, tx);
      return null;
    }
    await tx.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastFailedLoginAt: null } });
    await audit({ actorUserId: user.id, action: "LOGIN", entity: "users", entityId: user.id }, tx);
    return { id: user.id, sessionVersion: user.sessionVersion };
  }, { timeout: 15000 });
}
