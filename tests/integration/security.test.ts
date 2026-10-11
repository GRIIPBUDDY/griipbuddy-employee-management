import { beforeAll, afterAll, it, expect, describe } from "vitest";
import { testPostgres } from "../postgres";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import type { Identity } from "@/types/auth";
import type { PrismaClient } from "@/generated/prisma/client";
import { SESSION_SECONDS } from "@/lib/authorization/policy";
let database: Awaited<ReturnType<typeof testPostgres>>;
let db: PrismaClient;
let admin: Identity, hr: Identity, alice: Identity, bob: Identity;
let aliceEmployee: string, bobEmployee: string;
function identity(userId: string, sessionVersion = 1): Identity { const issuedAt = Date.now(); return { userId, sessionVersion, issuedAt, absoluteExpiresAt: issuedAt + SESSION_SECONDS * 1000 }; }
beforeAll(async () => {
  database = await testPostgres();
  process.env.DATABASE_URL = database.runtimeUrl;
  db = (await import("@/lib/db/client")).db;
  const { hashPassword } = await import("@/lib/auth/passwords");
  const hash = await hashPassword("Foundation-test-password-2026");
  execFileSync(process.execPath, ["--import", "tsx", "scripts/bootstrap.ts"], { env: { ...process.env, MIGRATION_DATABASE_URL: database.ownerUrl,
    BOOTSTRAP_ADMIN_EMAIL: "admin@example.test", BOOTSTRAP_ADMIN_NAME: "Admin", BOOTSTRAP_ADMIN_PASSWORD: "Foundation-test-password-2026" }, stdio: "pipe" });
  const adminUser = await db.user.update({ where: { email: "admin@example.test" }, data: { mustChangePassword: false, temporaryPasswordExpiresAt: null } });
  admin = identity(adminUser.id);
  const hrUser = await db.user.create({ data: { email: "hr@example.test", role: "HR_MANAGER", passwordHash: hash, mustChangePassword: false } });
  hr = identity(hrUser.id);
  for (const name of ["Alice", "Bob"]) {
    const user = await db.user.create({ data: { email: `${name.toLowerCase()}@example.test`, role: "EMPLOYEE", passwordHash: hash, mustChangePassword: false } });
    const employee = await db.employee.create({ data: { userId: user.id, employeeNumber: name, legalName: `${name} Private`, createdBy: admin.userId,
      bankDetails: { accountNumber: "sensitive-bank-account" }, employmentPeriods: { create: { startDate: new Date("2020-01-01"), departmentLabel: "Operations", positionLabel: "Associate", createdBy: admin.userId } } } });
    if (name === "Alice") { alice = identity(user.id); aliceEmployee = employee.id; } else { bob = identity(user.id); bobEmployee = employee.id; }
  }
});
afterAll(async () => { await db?.$disconnect(); await database?.stop(); });
describe("actual PostgreSQL-backed server operations", () => {
  it("requires authentication for profile, directory, feature and mutations", async () => {
    const people = await import("@/features/people/data");
    const { createAccount } = await import("@/features/accounts/service");
    for (const operation of [() => people.employeeProfile(null, aliceEmployee), () => people.employeeDirectory(null), () => people.commissionExample(null), () => createAccount(null, {})])
      await expect(operation()).rejects.toMatchObject({ status: 401 });
  });
  it("derives own profile and denies tampered employee IDs", async () => {
    const { employeeProfile, ownProfile } = await import("@/features/people/data");
    expect((await ownProfile(alice))?.id).toBe(aliceEmployee);
    await expect(employeeProfile(alice, bobEmployee)).rejects.toMatchObject({ status: 404 });
    await expect(employeeProfile(bob, aliceEmployee)).rejects.toMatchObject({ status: 404 });
    const own = await employeeProfile(alice, aliceEmployee);
    expect(JSON.stringify(own)).not.toMatch(/password|bank|sensitive|userId|sessionVersion/);
  });
  it("permits company-wide Admin/HR profile reads and rejects employee directory access", async () => {
    const { employeeProfile, employeeDirectory } = await import("@/features/people/data");
    expect((await employeeProfile(hr, bobEmployee)).id).toBe(bobEmployee);
    expect((await employeeProfile(admin, aliceEmployee)).id).toBe(aliceEmployee);
    expect(await employeeDirectory(hr)).toHaveLength(2);
    await expect(employeeDirectory(alice)).rejects.toMatchObject({ status: 403 });
  });
  it("rejects feature access, then observes current grants without a new JWT", async () => {
    const { commissionExample } = await import("@/features/people/data");
    await expect(commissionExample(alice)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    await expect(commissionExample(hr, true)).rejects.toMatchObject({ status: 403 });
    await db.employee.update({ where: { id: aliceEmployee }, data: { preorderCommissionEnabled: true } });
    expect(await commissionExample(alice)).toMatchObject({ enabled: true });
    await db.employee.update({ where: { id: aliceEmployee }, data: { preorderCommissionEnabled: false } });
    await expect(commissionExample(alice)).rejects.toMatchObject({ status: 404 });
    await db.user.update({ where: { id: hr.userId }, data: { canManageCommissions: true } });
    expect(await commissionExample(hr, true)).toMatchObject({ enabled: true });
    await db.user.update({ where: { id: hr.userId }, data: { canManageCommissions: false } });
  });
  it("validates identifiers and returns generic not found for absent records", async () => {
    const { employeeProfile } = await import("@/features/people/data");
    await expect(employeeProfile(admin, "invalid-id")).rejects.toMatchObject({ status: 400 });
    await expect(employeeProfile(admin, randomUUID())).rejects.toMatchObject({ status: 404 });
  });
  it("does not trust submitted roles or user IDs for account administration", async () => {
    const { createAccount, updateAccountSecurity, resetPassword, listAccounts } = await import("@/features/accounts/service");
    await expect(createAccount(alice, { role: "ADMIN" })).rejects.toMatchObject({ status: 403 });
    await expect(updateAccountSecurity(hr, { userId: admin.userId, role: "ADMIN" })).rejects.toMatchObject({ status: 403 });
    await expect(resetPassword(alice, { userId: bob.userId })).rejects.toMatchObject({ status: 403 });
    await expect(listAccounts(hr)).rejects.toMatchObject({ status: 403 });
    const { updateSettings } = await import("@/features/settings/service");
    await expect(updateSettings(hr, {})).rejects.toMatchObject({ status: 403 });
  });
  it("protects the last active administrator", async () => {
    const { updateAccountSecurity } = await import("@/features/accounts/service");
    await expect(updateAccountSecurity(admin, { userId: admin.userId, role: "HR_MANAGER", isActive: true, canManageCommissions: false, preorderCommissionEnabled: false })).rejects.toMatchObject({ code: "LAST_ADMIN" });
    expect((await db.user.findUniqueOrThrow({ where: { id: admin.userId } })).role).toBe("ADMIN");
  });
  it("authenticates correctly and locks repeated failures without revealing identity", async () => {
    const { authenticateCredentials } = await import("@/lib/auth/credentials");
    expect(await authenticateCredentials({ email: "ALICE@example.test", password: "Foundation-test-password-2026" })).toMatchObject({ id: alice.userId });
    expect(await authenticateCredentials({ email: "unknown@example.test", password: "wrong-password" })).toBeNull();
    for (let i = 0; i < 5; i++) expect(await authenticateCredentials({ email: "bob@example.test", password: "wrong-password" })).toBeNull();
    expect(await authenticateCredentials({ email: "bob@example.test", password: "Foundation-test-password-2026" })).toBeNull();
    expect((await db.user.findUniqueOrThrow({ where: { id: bob.userId } })).lockedUntil).toBeInstanceOf(Date);
  });
  it("provisions a temporary account and blocks all private data until password change", async () => {
    const { createAccount, changeOwnPassword } = await import("@/features/accounts/service");
    const { authenticateCredentials } = await import("@/lib/auth/credentials");
    const { ownProfile } = await import("@/features/people/data");
    const id = await createAccount(admin, { email: "new@example.test", displayName: "New", role: "EMPLOYEE", temporaryPassword: "Temporary-safe-password-2026", createEmployee: true,
      employeeNumber: "NEW", legalName: "New Employee", startDate: "2020-01-01", departmentLabel: "Operations", positionLabel: "Associate" });
    expect(await authenticateCredentials({ email: "new@example.test", password: "Temporary-safe-password-2026" })).toMatchObject({ id });
    const newIdentity = identity(id);
    await expect(ownProfile(newIdentity)).rejects.toMatchObject({ code: "PASSWORD_CHANGE_REQUIRED" });
    await changeOwnPassword(newIdentity, { currentPassword: "Temporary-safe-password-2026", password: "Permanent-safe-password-2026", confirmPassword: "Permanent-safe-password-2026" });
    await expect(ownProfile(newIdentity)).rejects.toMatchObject({ status: 401 });
    expect((await ownProfile(identity(id, 2)))?.legalName).toBe("New Employee");
  });
  it("rejects disabled, expired, revoked and ended-employment identities", async () => {
    const { ownProfile } = await import("@/features/people/data");
    await expect(ownProfile({ ...alice, absoluteExpiresAt: Date.now() - 1 })).rejects.toMatchObject({ status: 401 });
    await db.user.update({ where: { id: alice.userId }, data: { isActive: false } });
    await expect(ownProfile(alice)).rejects.toMatchObject({ status: 401 });
    await db.user.update({ where: { id: alice.userId }, data: { isActive: true, sessionVersion: 2 } });
    await expect(ownProfile(alice)).rejects.toMatchObject({ status: 401 });
    alice = identity(alice.userId, 2);
    await db.employmentPeriod.updateMany({ where: { employeeId: aliceEmployee }, data: { endDate: new Date("2021-01-01") } });
    await expect(ownProfile(alice)).rejects.toMatchObject({ code: "EMPLOYMENT_INACTIVE" });
  });
  it("resets temporary passwords, revokes old sessions and rejects expired temporary credentials", async () => {
    const { resetPassword } = await import("@/features/accounts/service");
    const { authenticateCredentials } = await import("@/lib/auth/credentials");
    const { ownProfile } = await import("@/features/people/data");
    await resetPassword(admin, { userId: bob.userId, temporaryPassword: "Reset-temporary-password-2026" });
    await expect(ownProfile(bob)).rejects.toMatchObject({ status: 401 });
    expect(await authenticateCredentials({ email: "bob@example.test", password: "Reset-temporary-password-2026" })).toMatchObject({ sessionVersion: 2 });
    await db.user.update({ where: { id: bob.userId }, data: { temporaryPasswordExpiresAt: new Date(Date.now() - 1) } });
    expect(await authenticateCredentials({ email: "bob@example.test", password: "Reset-temporary-password-2026" })).toBeNull();
    await expect(ownProfile(identity(bob.userId, 2))).rejects.toMatchObject({ status: 401 });
  });
  it("enforces overlap, identity-link, role-grant and append-only audit constraints in PostgreSQL", async () => {
    await expect(db.employmentPeriod.create({ data: { employeeId: bobEmployee, startDate: new Date("2022-01-01"), departmentLabel: "Other", positionLabel: "Other", createdBy: admin.userId } })).rejects.toThrow();
    await expect(db.employee.update({ where: { id: bobEmployee }, data: { userId: alice.userId } })).rejects.toThrow();
    await expect(db.user.update({ where: { id: bob.userId }, data: { canManageCommissions: true } })).rejects.toThrow();
    await expect(db.$executeRaw`UPDATE audit_logs SET reason = 'tampered'`).rejects.toThrow();
    await expect(db.$executeRaw`DELETE FROM audit_logs`).rejects.toThrow();
    await expect(db.$executeRaw`TRUNCATE audit_logs`).rejects.toThrow();
    await expect(db.$executeRaw`CREATE TABLE unauthorized_ddl(id integer)`).rejects.toThrow();
    const actions = (await db.auditLog.findMany({ select: { action: true } })).map(a => a.action);
    expect(actions).toContain("LOGIN"); expect(actions).toContain("AUTHORIZATION_DENIED"); expect(actions).toContain("PASSWORD_CHANGED");
    expect(JSON.stringify(await db.auditLog.findMany())).not.toMatch(/safe-password|passwordHash|sensitive-bank-account/);
  });
  it("limits verified backup status to Admin and distinguishes missing, current and stale evidence", async () => {
    const { backupStatus } = await import("@/features/settings/service");
    await expect(backupStatus(hr)).rejects.toMatchObject({ status: 403 });
    await expect(backupStatus(alice)).rejects.toBeDefined();
    expect((await backupStatus(admin)).status).toBe("NEVER_VERIFIED");
    await db.organizationSettings.update({where:{id:1},data:{lastSuccessfulBackupAt:new Date()}});
    expect((await backupStatus(admin)).status).toBe("CURRENT");
    await db.organizationSettings.update({where:{id:1},data:{lastSuccessfulBackupAt:new Date(Date.now()-90000000)}});
    expect((await backupStatus(admin)).status).toBe("STALE");
    await db.organizationSettings.update({where:{id:1},data:{lastSuccessfulBackupAt:null}});
  });
  it("serializes concurrent administrator demotions and preserves one active admin", async () => {
    const { updateAccountSecurity } = await import("@/features/accounts/service");
    const { hashPassword } = await import("@/lib/auth/passwords");
    const second = await db.user.create({ data: { email: "second-admin@example.test", role: "ADMIN", passwordHash: await hashPassword("Second-administrator-test-2026"), mustChangePassword: false } });
    const results = await Promise.allSettled([
      updateAccountSecurity(admin, { userId: admin.userId, role: "HR_MANAGER", isActive: true, canManageCommissions: false, preorderCommissionEnabled: false }),
      updateAccountSecurity(identity(second.id), { userId: second.id, role: "HR_MANAGER", isActive: true, canManageCommissions: false, preorderCommissionEnabled: false }),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.user.count({ where: { role: "ADMIN", isActive: true } })).toBe(1);
  });
});
