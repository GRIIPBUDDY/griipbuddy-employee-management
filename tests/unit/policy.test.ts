import { describe, it, expect } from "vitest";
import { assertIdentity, assertAccount, assertRole, assertEmployeeScope, assertOwnCommission, assertManageCommissions, SESSION_SECONDS } from "@/lib/authorization/policy";
import { businessDate } from "@/lib/utils/business-date";
import { createAccountSchema, passwordSchema, settingsSchema, uuidSchema } from "@/lib/validation/schemas";
import type { Actor } from "@/types/auth";
const now = Date.now();
const actor: Actor = { userId: "00000000-0000-4000-8000-000000000001", sessionVersion: 1, issuedAt: now, absoluteExpiresAt: now + SESSION_SECONDS * 1000,
  role: "EMPLOYEE", isActive: true, name: "Employee A", email: "a@example.test", mustChangePassword: false,
  employeeId: "00000000-0000-4000-8000-000000000002", employmentActive: true, preorderCommissionEnabled: false, canManageCommissions: false };
describe("server authorization policy", () => {
  it("rejects absent, expired or extended sessions", () => {
    expect(() => assertIdentity(null)).toThrow();
    expect(() => assertIdentity({ ...actor, absoluteExpiresAt: now - 1 })).toThrow();
    expect(() => assertIdentity({ ...actor, absoluteExpiresAt: now + 13 * 3600000 })).toThrow();
    expect(() => assertIdentity(actor, now)).not.toThrow();
  });
  it("rejects revoked and disabled accounts", () => {
    expect(() => assertAccount(actor, 0)).toThrow();
    expect(() => assertAccount({ ...actor, isActive: false }, 1)).toThrow();
  });
  it("requires password changes before private access", () => {
    expect(() => assertAccount({ ...actor, mustChangePassword: true }, 1)).toThrow();
    expect(() => assertAccount({ ...actor, mustChangePassword: true }, 1, true)).not.toThrow();
  });
  it("rejects employees outside their employment period", () => {
    expect(() => assertAccount({ ...actor, employmentActive: false }, 1)).toThrow();
  });
  it("denies another employee ID and management role", () => {
    expect(() => assertEmployeeScope(actor, "another-employee")).toThrow();
    expect(() => assertEmployeeScope(actor, actor.employeeId!)).not.toThrow();
    expect(() => assertRole(actor, ["ADMIN", "HR_MANAGER"])).toThrow();
  });
  it("keeps employee and HR commission grants separate", () => {
    expect(() => assertOwnCommission(actor)).toThrow();
    expect(() => assertOwnCommission({ ...actor, preorderCommissionEnabled: true })).not.toThrow();
    expect(() => assertManageCommissions({ ...actor, role: "HR_MANAGER" })).toThrow();
    expect(() => assertManageCommissions({ ...actor, role: "HR_MANAGER", canManageCommissions: true })).not.toThrow();
    expect(() => assertManageCommissions({ ...actor, role: "ADMIN" })).not.toThrow();
  });
});
describe("validation and business date", () => {
  it("uses the organization date at a UTC day boundary", () => expect(businessDate("Asia/Dhaka", new Date("2026-10-08T20:00:00Z")).toISOString()).toBe("2026-10-09T00:00:00.000Z"));
  it("rejects malformed IDs, common passwords and invalid settings", () => {
    expect(uuidSchema.safeParse("' OR 1=1").success).toBe(false);
    expect(passwordSchema.safeParse("password1234").success).toBe(false);
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(settingsSchema.safeParse({ companyName: "Test", timezone: "invalid-zone", earlyCheckinMinutes: 61 }).success).toBe(false);
  });
  it("requires an employee profile for employee accounts", () => {
    expect(createAccountSchema.safeParse({ email: "a@example.test", displayName: "A", role: "EMPLOYEE", temporaryPassword: "valid-temporary-12345", createEmployee: false,
      employeeNumber: "", legalName: "", startDate: "", departmentLabel: "", positionLabel: "" }).success).toBe(false);
  });
});
