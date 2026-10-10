import "server-only";
import { invalidateOvertime } from "@/features/review/overtime";
import { databaseNow } from "@/features/time/clock";
import { dayStart,dateKey } from "@/features/time/dates";
import { endFutureSchedules } from "@/features/time/schedules";
import { resolveEmploymentCatalogs } from "@/features/organization/catalogs";
import { assertRole } from "@/lib/authorization/policy";
import { securityBoundary } from "@/lib/authorization/actor";
import { authorizedMutation } from "@/lib/db/mutation";
import { db } from "@/lib/db/client";
import { audit, type Database } from "@/lib/db/audit";
import { validated } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import { businessDate } from "@/lib/utils/business-date";
import { hashPassword } from "@/lib/auth/passwords";
import type { Identity } from "@/types/auth";
import type { z } from "zod";
import { personalSchema, newEmployeeSchema, updateEmployeeSchema, updateEmploymentSchema, deactivateSchema, contactSchema } from "./validation";

function personalData(value: z.infer<typeof personalSchema>) {
  const { emergencyName, emergencyPhone, emergencyRelationship, ...data } = value;
  return { ...data, emergencyContact: { name: emergencyName, phone: emergencyPhone, relationship: emergencyRelationship } };
}
export async function peopleEvent(tx: Database, input: { employeeId: string; actorUserId: string; type: string; title: string; sourceType: string; sourceId: string; employeeVisible?: boolean }) {
  await tx.employeeActivity.create({ data: { employeeId: input.employeeId, createdBy: input.actorUserId, type: input.type, title: input.title,
    description: "", eventTime: new Date(), sourceType: input.sourceType, sourceId: input.sourceId, employeeVisible: input.employeeVisible ?? true } });
}
async function staff(identity: Identity | null) { return securityBoundary(identity, async actor => { assertRole(actor, ["ADMIN", "HR_MANAGER"]); return actor; }); }
function conflict(error: unknown): never {
  if (typeof error === "object" && error && "code" in error && error.code === "P2002") throw new AppError(409, "DUPLICATE", "Employee number or email is already in use.");
  throw error;
}
export async function createEmployee(identity: Identity | null, input: unknown) {
  const actor = await staff(identity);
  const value = validated(newEmployeeSchema, input);
  if (!value.userId && actor.role !== "ADMIN") throw new AppError(403, "ROLE_DENIED", "An administrator must provision the account first.");
  if (!value.userId && (!value.email || !value.temporaryPassword)) throw new AppError(400, "VALIDATION", "Supply an email and temporary password for the new account.");
  const passwordHash = !value.userId ? await hashPassword(value.temporaryPassword) : undefined;
  try {
    return await authorizedMutation(identity, async (current, tx) => {
      assertRole(current, ["ADMIN", "HR_MANAGER"]);
      let userId = value.userId;
      if (!userId) {
        assertRole(current, ["ADMIN"]);
        userId = (await tx.user.create({ data: { email: value.email, passwordHash: passwordHash!, role: "EMPLOYEE", mustChangePassword: true, temporaryPasswordExpiresAt: new Date(Date.now() + 86400000) } })).id;
        await audit({ actorUserId: current.userId, action: "ACCOUNT_CREATED", entity: "users", entityId: userId, after: { role: "EMPLOYEE" } }, tx);
      } else {
        const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, employee: { select: { id: true } } } });
        if (!user || user.employee) throw new AppError(409, "ACCOUNT_UNAVAILABLE", "Choose an existing account without an employee profile.");
      }
      const employee = await tx.employee.create({ data: { ...personalData(value.personal), userId, createdBy: current.userId } });
      if (value.employment.managerEmployeeId) await tx.employee.findUniqueOrThrow({ where: { id: value.employment.managerEmployeeId }, select: { id: true } });
      const catalogs = await resolveEmploymentCatalogs(tx, current.userId, value.employment);
      await tx.employmentPeriod.create({ data: { ...value.employment, ...catalogs, employeeId: employee.id, createdBy: current.userId } });
      await audit({ actorUserId: current.userId, employeeId: employee.id, action: "EMPLOYEE_CREATED", entity: "employees", entityId: employee.id,
        after: { employeeNumber: employee.employeeNumber, linkedUserId: userId, departmentId: catalogs.departmentId, positionId: catalogs.positionId, departmentLabel: catalogs.departmentLabel, positionLabel: catalogs.positionLabel } }, tx);
      await peopleEvent(tx, { employeeId: employee.id, actorUserId: current.userId, type: "EMPLOYEE_CREATED", title: "Employee profile created", sourceType: "employees", sourceId: employee.id });
      return employee.id;
    }, value.userId || undefined);
  } catch (error) { conflict(error); }
}
export async function updateEmployee(identity: Identity | null, input: unknown) {
  await staff(identity);
  const value = validated(updateEmployeeSchema, input);
  try {
    return await authorizedMutation(identity, async (actor, tx) => {
      assertRole(actor, ["ADMIN", "HR_MANAGER"]);
      const employee = await tx.employee.findUnique({ where: { id: value.employeeId } });
      if (!employee) throw new AppError(404, "NOT_FOUND", "Employee record not found.");
      if (employee.updatedAt.toISOString() !== value.expectedUpdatedAt) throw new AppError(409, "STALE", "This profile changed. Reload before editing.");
      await tx.employee.update({ where: { id: employee.id }, data: personalData(value.personal) });
      // Record changed field names and minimal identity details, never bank/contact contents.
      await audit({ actorUserId: actor.userId, employeeId: employee.id, action: "EMPLOYEE_CHANGED", entity: "employees", entityId: employee.id,
        before: { employeeNumber: employee.employeeNumber, legalName: employee.legalName },
        after: { employeeNumber: value.personal.employeeNumber, legalName: value.personal.legalName, fields: Object.keys(value.personal) } }, tx);
      await peopleEvent(tx, { employeeId: employee.id, actorUserId: actor.userId, type: "PROFILE_CHANGED", title: "Employee profile updated", sourceType: "employees", sourceId: employee.id });
    });
  } catch (error) { conflict(error); }
}
export async function updateOwnContact(identity: Identity | null, input: unknown) {
  await securityBoundary(identity, async actor => { if (!actor.employeeId) throw new AppError(404, "NOT_FOUND", "Employee record not found."); });
  const value = validated(contactSchema, input);
  return authorizedMutation(identity, async (actor, tx) => {
    if (!actor.employeeId) throw new AppError(404, "NOT_FOUND", "Employee record not found.");
    const { emergencyName, emergencyPhone, emergencyRelationship, ...data } = value;
    await tx.employee.update({ where: { id: actor.employeeId, userId: actor.userId }, data: { ...data, emergencyContact: { name: emergencyName, phone: emergencyPhone, relationship: emergencyRelationship } } });
    await audit({ actorUserId: actor.userId, employeeId: actor.employeeId, action: "EMPLOYEE_CONTACT_CHANGED", entity: "employees", entityId: actor.employeeId, after: { fields: Object.keys(value) } }, tx);
  });
}
export async function updateEmployment(identity: Identity | null, input: unknown) {
  await staff(identity);
  const value = validated(updateEmploymentSchema, input);
  return authorizedMutation(identity, async (actor, tx) => {
    assertRole(actor, ["ADMIN", "HR_MANAGER"]);
    const period = await tx.employmentPeriod.findFirst({ where: { id: value.periodId, employeeId: value.employeeId } });
    if (!period) throw new AppError(404, "NOT_FOUND", "Employment record not found.");
    if (value.employment.startDate.getTime() !== period.startDate.getTime() && (await tx.workSchedule.count({ where: { employmentPeriodId: period.id } }) || await tx.attendanceSession.count({ where: { employmentPeriodId: period.id } }))) throw new AppError(409, "EMPLOYMENT_TIME_HISTORY", "Employment start is fixed after time records exist. Use a reviewed historical correction.");
    if (period.revision !== value.revision) throw new AppError(409, "STALE", "This employment record changed. Reload before editing.");
    if (value.employment.managerEmployeeId === value.employeeId) throw new AppError(400, "VALIDATION", "An employee cannot be their own manager.");
    const catalogs = await resolveEmploymentCatalogs(tx, actor.userId, value.employment, period);
    await tx.employmentPeriod.update({ where: { id: period.id }, data: { ...value.employment, ...catalogs, revision: { increment: 1 } } });
    await audit({ actorUserId: actor.userId, employeeId: period.employeeId, action: "EMPLOYMENT_CHANGED", entity: "employment_periods", entityId: period.id, reason: value.reason,
      before: { departmentId: period.departmentId, positionId: period.positionId, departmentLabel: period.departmentLabel, positionLabel: period.positionLabel, startDate: period.startDate.toISOString(), endDate: period.endDate?.toISOString() ?? null },
      after: { departmentId: catalogs.departmentId, positionId: catalogs.positionId, departmentLabel: catalogs.departmentLabel, positionLabel: catalogs.positionLabel, startDate: value.employment.startDate.toISOString(), endDate: value.employment.endDate?.toISOString() ?? null } }, tx);
    if (value.employment.endDate?.getTime() !== period.endDate?.getTime()) {
      const zone=(await tx.organizationSettings.findUniqueOrThrow({where:{id:1},select:{timezone:true}})).timezone;
      const first=[value.employment.endDate,period.endDate].filter((v):v is Date=>!!v).sort((a,b)=>a.getTime()-b.getTime())[0];
      if(first)await invalidateOvertime(tx,period.employeeId,actor.userId,dayStart(dateKey(first),zone),null,await databaseNow(tx));
    }
    if (value.employment.endDate) await endFutureSchedules(tx, actor.userId, period.employeeId, period.id, value.employment.endDate, value.reason);
    const employee = await tx.employee.findUniqueOrThrow({ where: { id: period.employeeId }, select: { userId: true } });
    await tx.user.update({ where: { id: employee.userId }, data: { sessionVersion: { increment: 1 } } });
    await peopleEvent(tx, { employeeId: period.employeeId, actorUserId: actor.userId, type: "EMPLOYMENT_CHANGED", title: "Employment information updated", sourceType: "employment_periods", sourceId: period.id });
  });
}
export async function deactivateEmployee(identity: Identity | null, input: unknown) {
  await staff(identity);
  const value = validated(deactivateSchema, input);
  return authorizedMutation(identity, async (actor, tx) => {
    assertRole(actor, ["ADMIN", "HR_MANAGER"]);
    const employee = await tx.employee.findUnique({ where: { id: value.employeeId }, include: { user: true, employmentPeriods: true } });
    if (!employee) throw new AppError(404, "NOT_FOUND", "Employee record not found.");
    if (actor.role === "HR_MANAGER" && employee.user.role !== "EMPLOYEE") throw new AppError(403, "ROLE_DENIED", "An administrator must deactivate a staff account.");
    if (employee.user.role === "ADMIN" && employee.user.isActive && await tx.user.count({ where: { role: "ADMIN", isActive: true } }) <= 1) throw new AppError(409, "LAST_ADMIN", "Keep at least one active administrator.");
    const settings = await tx.organizationSettings.findUniqueOrThrow({ where: { id: 1 } });
    const today = businessDate(settings.timezone);
    for (const period of employee.employmentPeriods.filter(p => !p.endDate || p.endDate > today)) {
      const endDate = today > period.startDate ? today : new Date(period.startDate.getTime() + 86400000);
      await endFutureSchedules(tx, actor.userId, employee.id, period.id, endDate, value.reason);
      await tx.employmentPeriod.update({ where: { id: period.id }, data: { endDate, endReason: value.reason, revision: { increment: 1 } } });
    }
    await invalidateOvertime(tx,employee.id,actor.userId,dayStart(dateKey(today),settings.timezone),null,await databaseNow(tx));
    await tx.user.update({ where: { id: employee.userId }, data: { isActive: false, sessionVersion: { increment: 1 } } });
    await audit({ actorUserId: actor.userId, employeeId: employee.id, action: "EMPLOYEE_DEACTIVATED", entity: "employees", entityId: employee.id, reason: value.reason, after: { accountActive: false, historyPreserved: true } }, tx);
    await peopleEvent(tx, { employeeId: employee.id, actorUserId: actor.userId, type: "EMPLOYMENT_ENDED", title: "Employee deactivated", sourceType: "employees", sourceId: employee.id });
  });
}
export async function profileChoices(identity: Identity | null) {
  await staff(identity);
  return {
    departments: await db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, isActive: true } }),
    positions: await db.position.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, isActive: true } }),
    users: await db.user.findMany({ where: { employee: null, isActive: true }, orderBy: { email: "asc" }, take: 200, select: { id: true, email: true, displayName: true } }),
    managers: await db.employee.findMany({ orderBy: { legalName: "asc" }, take: 200, select: { id: true, legalName: true, employeeNumber: true } }),
  };
}
