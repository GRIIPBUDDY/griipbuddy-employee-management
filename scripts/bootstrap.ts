import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import argon2 from "argon2";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { passwordSchema } from "../src/lib/validation/schemas";
const values = z.object({ email: z.email().max(254), name: z.string().min(1).max(100), password: passwordSchema }).parse({
  email: process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase(), name: process.env.BOOTSTRAP_ADMIN_NAME ?? "Administrator", password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
});
if (values.email.endsWith(".invalid") || values.password.startsWith("replace-")) throw new Error("Replace bootstrap placeholders first.");
if (!process.env.MIGRATION_DATABASE_URL) throw new Error("Bootstrap requires a one-off MIGRATION_DATABASE_URL.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL, options: "-c timezone=UTC", max: 1 }) });
try {
  const passwordHash = await argon2.hash(values.password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(73102301)`;
    if (await tx.user.count()) throw new Error("Bootstrap only runs on an empty user table.");
    const user = await tx.user.create({ data: { email: values.email, displayName: values.name, role: "ADMIN", passwordHash, mustChangePassword: true, temporaryPasswordExpiresAt: new Date(Date.now() + 86400000) } });
    await tx.organizationSettings.create({ data: { companyName: "GriipBuddy", changedBy: user.id, overtimePolicyVersions: [{ effectiveFrom: "2026-01-05", thresholdSeconds: 144000 }] } });
    await tx.auditLog.create({ data: { actorUserId: user.id, action: "BOOTSTRAP_ADMIN_CREATED", entity: "users", entityId: user.id, requestId: randomUUID(), after: { role: "ADMIN" } } });
  });
  console.log("Administrator and organization initialized. Change the temporary password on first login.");
} finally { await db.$disconnect(); }
