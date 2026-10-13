import "server-only";
import { db } from "@/lib/db/client";
import { securityBoundary } from "@/lib/authorization/actor";
import { assertEmployeeScope, assertRole, assertOwnCommission, assertManageCommissions } from "@/lib/authorization/policy";
import { validated, uuidSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import type { Identity } from "@/types/auth";
import { z } from "zod";
import { businessDate } from "@/lib/utils/business-date";

const profileSelect = {
  id: true, employeeNumber: true, legalName: true, preferredName: true, phone: true, address: true, dateOfBirth: true, gender: true, nationality: true,
  emergencyContact: true, photoDocumentId: true, updatedAt: true, preorderCommissionEnabled: true,
  user: { select: { email: true, role: true, isActive: true, accountStatus: true } },
  employmentPeriods: { orderBy: { startDate: "desc" as const }, select: { id: true, revision: true, startDate: true, endDate: true, departmentLabel: true, positionLabel: true, departmentId: true, positionId: true, department: { select: { name: true, isActive: true } }, position: { select: { name: true, isActive: true } },
    employmentType: true, workLocation: true, probationEndDate: true, managerEmployeeId: true, manager: { select: { legalName: true } } } },
};
async function safeProfile<T extends { emergencyContact: unknown; user: { isActive: boolean }; employmentPeriods: { startDate: Date; endDate: Date | null }[] }>(record: T) {
  const raw = record.emergencyContact;
  const contact = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : {};
  const settings = await db.organizationSettings.findUniqueOrThrow({ where: { id: 1 }, select: { timezone: true } });
  const today = businessDate(settings.timezone);
  const active = record.employmentPeriods.some(p => p.startDate <= today && (!p.endDate || p.endDate > today));
  const employmentStatus = !record.user.isActive ? "INACTIVE" : active ? "ACTIVE" : record.employmentPeriods.some(p => p.startDate > today) ? "UPCOMING" : "INACTIVE";
  return { ...record, employmentStatus, emergencyContact: { name: typeof contact.name === "string" ? contact.name : null,
    phone: typeof contact.phone === "string" ? contact.phone : null, relationship: typeof contact.relationship === "string" ? contact.relationship : null } };
}
export async function employeeProfile(identity: Identity | null, inputId: unknown) {
  return securityBoundary(identity, async actor => {
    const id = validated(uuidSchema, inputId);
    assertEmployeeScope(actor, id);
    const record = await db.employee.findFirst({ where: { id, ...(actor.role === "EMPLOYEE" ? { userId: actor.userId } : {}) }, select: profileSelect });
    if (!record) throw new AppError(404, "NOT_FOUND", "Employee record not found.");
    return {...await safeProfile(record), preorderCommissionEnabled: actor.role === "EMPLOYEE" && !actor.preorderCommissionEnabled ? undefined : record.preorderCommissionEnabled};
  });
}
export async function ownProfile(identity: Identity | null) {
  return securityBoundary(identity, async actor => {
    if (!actor.employeeId) return null;
    const record = await db.employee.findFirst({ where: { id: actor.employeeId, userId: actor.userId }, select: profileSelect });
    return record ? {...await safeProfile(record), preorderCommissionEnabled: !actor.preorderCommissionEnabled ? undefined : record.preorderCommissionEnabled} : null;
  });
}
const searchSchema = z.object({ search: z.string().trim().max(150).default(""), department: z.string().trim().max(100).default(""), status: z.enum(["ALL", "ACTIVE", "INACTIVE", "UPCOMING"]).default("ALL"), page: z.coerce.number().int().min(1).max(10000).default(1) });
export async function searchEmployees(identity: Identity | null, input: unknown = {}) {
  return securityBoundary(identity, async actor => {
    assertRole(actor, ["ADMIN", "HR_MANAGER"]);
    const value = validated(searchSchema, input);
    const settings = await db.organizationSettings.findUniqueOrThrow({ where: { id: 1 }, select: { timezone: true } });
    const today = businessDate(settings.timezone);
    const active = { startDate: { lte: today }, OR: [{ endDate: null }, { endDate: { gt: today } }] };
    const where = { AND: [
      ...(value.search ? [{ OR: [{ legalName: { contains: value.search, mode: "insensitive" as const } }, { employeeNumber: { contains: value.search, mode: "insensitive" as const } }] }] : []),
      ...(value.department ? [{ employmentPeriods: { some: { OR: [{ departmentLabel: value.department }, ...(uuidSchema.safeParse(value.department).success ? [{ departmentId: value.department }] : [])] } } }] : []),
      ...(value.status === "ACTIVE" ? [{ user: { isActive: true }, employmentPeriods: { some: active } }] : []),
      ...(value.status === "INACTIVE" ? [{ OR: [{ user: { isActive: false } }, { employmentPeriods: { none: active }, NOT: { employmentPeriods: { some: { startDate: { gt: today } } } } }] }] : []),
      ...(value.status === "UPCOMING" ? [{ user: { isActive: true }, employmentPeriods: { none: active, some: { startDate: { gt: today } } } }] : []),
    ] };
    const [records, total, departments] = await Promise.all([
      db.employee.findMany({ where, skip: (value.page - 1) * 25, take: 25, orderBy: { employeeNumber: "asc" }, select: {
        id: true, legalName: true, employeeNumber: true, photoDocumentId: true, user: { select: { isActive: true, accountStatus: true, email: true } },
        employmentPeriods: { orderBy: { startDate: "desc" }, select: { startDate: true, endDate: true, departmentLabel: true, positionLabel: true, department: { select: { name: true } }, position: { select: { name: true } } } },
      } }), db.employee.count({ where }), db.department.findMany({ select: { id: true, name: true, isActive: true }, orderBy: { name: "asc" } }),
    ]);
    const employees = records.map(record => {
      const period = record.employmentPeriods.find(p => p.startDate <= today && (!p.endDate || p.endDate > today));
      const upcoming = record.employmentPeriods.some(p => p.startDate > today);
      return { id: record.id, legalName: record.legalName, employeeNumber: record.employeeNumber, photoDocumentId: record.photoDocumentId,
        departmentLabel: (period ?? record.employmentPeriods[0])?.department?.name ?? (period ?? record.employmentPeriods[0])?.departmentLabel ?? "—", positionLabel: (period ?? record.employmentPeriods[0])?.position?.name ?? (period ?? record.employmentPeriods[0])?.positionLabel ?? "—",
        joinDate: record.employmentPeriods.at(-1)?.startDate ?? null, accountStatus: record.user.accountStatus, email: record.user.email, status: !record.user.isActive ? "INACTIVE" : period ? "ACTIVE" : upcoming ? "UPCOMING" : "INACTIVE" };
    });
    return { employees, total, page: value.page, pages: Math.max(1, Math.ceil(total / 25)), departments };
  });
}
export async function employeeDirectory(identity: Identity | null) {
  return securityBoundary(identity, async actor => {
    assertRole(actor, ["ADMIN", "HR_MANAGER"]);
    return db.employee.findMany({ take: 100, orderBy: { employeeNumber: "asc" }, select: { id: true, employeeNumber: true, legalName: true,
      employmentPeriods: { orderBy: { startDate: "desc" }, take: 1, select: { departmentLabel: true, positionLabel: true } } } });
  });
}
export async function commissionExample(identity: Identity | null, management = false) {
  return securityBoundary(identity, async actor => {
    if (management) assertManageCommissions(actor); else assertOwnCommission(actor);
    return { enabled: true, message: "Access is enabled. Commission workflows will arrive in a later phase." };
  });
}

export async function employeeOptions(identity: Identity | null) {
 return securityBoundary(identity,actor=>{assertRole(actor,["ADMIN","HR_MANAGER"]);return db.employee.findMany({orderBy:{legalName:"asc"},take:200,select:{id:true,legalName:true,employeeNumber:true}});});
}
