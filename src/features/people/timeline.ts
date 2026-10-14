import "server-only";
import { commissionRestricted } from "@/features/pay/access";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/db/audit";
import { authorizedMutation } from "@/lib/db/mutation";
import { securityBoundary } from "@/lib/authorization/actor";
import { assertEmployeeScope, assertRole } from "@/lib/authorization/policy";
import { validated, uuidSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import type { Identity } from "@/types/auth";
import { recordSchema, correctRecordSchema, deleteRecordSchema } from "./validation";
import {documentParentVisible,publishedWarning} from "@/features/people-operations/access";
import { requireModule } from "@/features/settings/config";

export async function employeeTimeline(identity: Identity | null, employeeId: unknown, own = false) {
  return securityBoundary(identity, async actor => {
    const id = validated(uuidSchema, employeeId);
    assertEmployeeScope(actor, id);
    if (own && actor.employeeId !== id) throw new AppError(404, "NOT_FOUND", "Employee record not found.");
    if (!await db.employee.findFirst({ where: { id }, select: { id: true } })) throw new AppError(404, "NOT_FOUND", "Employee record not found.");
    const personal = own || actor.role === "EMPLOYEE";
    const records = await db.employeeActivity.findMany({ where: { employeeId: id, deletedAt: null,
      ...(personal ? { employeeVisible: true, commissionRestricted: actor.preorderCommissionEnabled ? undefined : false } : actor.role === "HR_MANAGER" && !actor.canManageCommissions ? { commissionRestricted: false } : {}) },
      orderBy: [{ eventTime: "desc" }, { id: "desc" }], take: 100,
      select: { id: true, type: true, title: true, description: true, eventTime: true, employeeVisible: true, sourceType: true, sourceId: true, createdAt: true, updatedAt: true, creator: { select: { displayName: true, employee: { select: { legalName: true } } } } } });
    const visible = [];
    for (const record of records) {
      // Only sources whose live permission rules exist are supported. Future modules must add their own resolver.
      if (record.sourceType === "employee_documents") {
        if (!await db.employeeDocument.findFirst({ where: { id: record.sourceId!, employeeId: id, deletedAt: null, ...(personal ? { employeeVisible: true } : {}) }, select: { id: true } })) continue;
        if(personal&&!await documentParentVisible(db,id,record.sourceId!))continue;
      } else if(record.sourceType==="shift_swap_requests") {
        if(!await db.shiftSwapRequest.findFirst({where:{id:record.sourceId!,OR:[{requesterEmployeeId:id},{partnerEmployeeId:id}]},select:{id:true}}))continue;
      } else if(record.sourceType==="task_assignments") {
        if(!await db.taskAssignment.findFirst({where:{id:record.sourceId!,employeeId:id},select:{id:true}}))continue;
      } else if(record.sourceType==="leave_requests") {
        if(!await db.leaveRequest.findFirst({where:{id:record.sourceId!,employeeId:id},select:{id:true}}))continue;
      } else if(record.sourceType==="performance_reviews") {
        if(!await db.performanceReview.findFirst({where:{id:record.sourceId!,employeeId:id,...(personal?{publishedAt:{not:null},employeeVisible:true}:{})},select:{id:true}}))continue;
      } else if(record.sourceType==="disciplinary_records") {
        if(!await db.disciplinaryRecord.findFirst({where:{id:record.sourceId!,employeeId:id,...(personal?publishedWarning:{})},select:{id:true}}))continue;
      } else if(record.sourceType==="incident_records") {
        if(personal?false:actor.role==="HR_MANAGER"&&actor.employeeId===id)continue;
        if(!await db.incidentRecord.findFirst({where:{id:record.sourceId!,employeeId:id,...(personal?{employeeVisible:true}:{})},select:{id:true}}))continue;
      } else if(record.sourceType==="asset_assignments") {
        if(!await db.assetAssignment.findFirst({where:{id:record.sourceId!,employeeId:id},select:{id:true}}))continue;
      } else if (record.sourceType === "employment_periods") {
        if (!await db.employmentPeriod.findFirst({ where: { id: record.sourceId!, employeeId: id }, select: { id: true } })) continue;
      } else if (record.sourceType === "work_schedules") {
        if (!await db.workSchedule.findFirst({ where: { id: record.sourceId!, employeeId: id }, select: { id: true } })) continue;
      } else if (record.sourceType === "attendance_sessions") {
        if (!await db.attendanceSession.findFirst({ where: { id: record.sourceId!, employeeId: id }, select: { id: true } })) continue;
      } else if (record.sourceType === "attendance_corrections") {
        if (!await db.attendanceCorrection.findFirst({ where: { id: record.sourceId!, employeeId: id }, select: { id: true } })) continue;
      } else if (record.sourceType === "compensation_rates") {
        if (!await db.compensationRate.findFirst({where:{id:record.sourceId!,employeeId:id},select:{id:true}})) continue;
      } else if (record.sourceType === "preorders") {
        if (personal ? !actor.preorderCommissionEnabled : !(actor.role==="ADMIN" || actor.role==="HR_MANAGER" && actor.canManageCommissions)) continue;
        if (!await db.preorder.findFirst({where:{id:record.sourceId!,employeeId:id},select:{id:true}})) continue;
      } else if (record.sourceType === "salary_calculations") {
        const source=await db.salaryCalculation.findFirst({where:{id:record.sourceId!,employeeId:id,...(personal?{finalizedAt:{not:null}}:{})},select:{calculationSnapshot:true}});
        if (!source || commissionRestricted(source.calculationSnapshot) && (personal?!actor.preorderCommissionEnabled:!(actor.role==="ADMIN" || actor.role==="HR_MANAGER" && actor.canManageCommissions))) continue;
      } else if (record.sourceType === "employees") {
        if (record.sourceId !== id) continue;
      } else if (record.sourceType !== null) continue;
      const { creator, ...safe } = record;
      const modules:Record<string,string>={shift_swap_requests:"shift-swaps",task_assignments:"tasks",leave_requests:"leave",performance_reviews:"performance",disciplinary_records:"warnings",asset_assignments:"assets"};
      const module=record.sourceType?modules[record.sourceType]:undefined,href=record.sourceType==="incident_records"?(personal?`/me/incidents?id=${record.sourceId}`:`/manage/incidents/${record.sourceId}`):module?`/${personal?"me":"manage"}/${module}?${module==="assets"?"assignmentId":"id"}=${record.sourceId}`:null;
      visible.push({ ...safe, href, creatorName: creator?.employee?.legalName ?? creator?.displayName ?? "Staff", manual: record.sourceType === null });
    }
    return visible;
  });
}
export async function ownTimeline(identity: Identity | null) {
  return securityBoundary(identity, async actor => actor.employeeId ? employeeTimeline(identity, actor.employeeId, true) : []);
}
export async function createWorkRecord(identity: Identity | null, input: unknown) { await requireModule("workRecords");
  await securityBoundary(identity, async actor => assertRole(actor, ["ADMIN", "HR_MANAGER"]));
  const value = validated(recordSchema, input);
  return authorizedMutation(identity, async (actor, tx) => {
    assertRole(actor, ["ADMIN", "HR_MANAGER"]);
    if (!await tx.employee.findUnique({ where: { id: value.employeeId }, select: { id: true } })) throw new AppError(404, "NOT_FOUND", "Employee record not found.");
    const record = await tx.employeeActivity.create({ data: { employeeId: value.employeeId, type: value.type, title: value.title, description: value.description,
      eventTime: new Date(`${value.eventDate}T12:00:00.000Z`), employeeVisible: value.employeeVisible, createdBy: actor.userId } });
    await audit({ actorUserId: actor.userId, employeeId: record.employeeId, action: "WORK_RECORD_CREATED", entity: "employee_activities", entityId: record.id,
      after: { type: record.type, employeeVisible: record.employeeVisible } }, tx);
    return record.id;
  });
}
export async function correctWorkRecord(identity: Identity | null, input: unknown) { await requireModule("workRecords");
  await securityBoundary(identity, async actor => assertRole(actor, ["ADMIN", "HR_MANAGER"]));
  const value = validated(correctRecordSchema, input);
  return authorizedMutation(identity, async (actor, tx) => {
    assertRole(actor, ["ADMIN", "HR_MANAGER"]);
    const record = await tx.employeeActivity.findFirst({ where: { id: value.recordId, employeeId: value.employeeId, sourceType: null, commissionRestricted: false, deletedAt: null } });
    if (!record) throw new AppError(404, "NOT_FOUND", "Manual work record not found.");
    if (record.updatedAt.toISOString() !== value.expectedUpdatedAt) throw new AppError(409, "STALE", "This record changed. Reload before correcting.");
    await tx.employeeActivity.update({ where: { id: record.id }, data: { type: value.type, title: value.title, description: value.description, eventTime: new Date(`${value.eventDate}T12:00:00.000Z`), employeeVisible: value.employeeVisible } });
    await audit({ actorUserId: actor.userId, employeeId: record.employeeId, action: "WORK_RECORD_CORRECTED", entity: "employee_activities", entityId: record.id, reason: value.reason,
      before: { type: record.type, title: record.title, description: record.description, eventTime: record.eventTime.toISOString(), employeeVisible: record.employeeVisible },
      after: { type: value.type, title: value.title, description: value.description, eventDate: value.eventDate, employeeVisible: value.employeeVisible } }, tx);
  });
}
export async function deleteWorkRecord(identity: Identity | null, input: unknown) { await requireModule("workRecords");
  await securityBoundary(identity, async actor => assertRole(actor, ["ADMIN", "HR_MANAGER"]));
  const value = validated(deleteRecordSchema, input);
  return authorizedMutation(identity, async (actor, tx) => {
    assertRole(actor, ["ADMIN", "HR_MANAGER"]);
    const record = await tx.employeeActivity.findFirst({ where: { id: value.recordId, employeeId: value.employeeId, sourceType: null, commissionRestricted: false, deletedAt: null } });
    if (!record) throw new AppError(404, "NOT_FOUND", "Manual work record not found.");
    await tx.employeeActivity.update({ where: { id: record.id }, data: { deletedAt: new Date(), deletionReason: value.reason } });
    await audit({ actorUserId: actor.userId, employeeId: record.employeeId, action: "WORK_RECORD_DELETED", entity: "employee_activities", entityId: record.id, reason: value.reason }, tx);
  });
}
