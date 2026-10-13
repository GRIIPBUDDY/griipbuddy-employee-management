import "server-only";
import { securityBoundary } from "@/lib/authorization/actor";
import { assertEmployeeScope, assertRole } from "@/lib/authorization/policy";
import { authorizedMutation } from "@/lib/db/mutation";
import { audit } from "@/lib/db/audit";
import { db } from "@/lib/db/client";
import { validated, uuidSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import { openPrivateFile, validateFile, withDocumentSlot, writePrivateFile } from "@/lib/documents/files";
import type { Identity } from "@/types/auth";
import { documentSchema, deleteDocumentSchema, documentVisibilitySchema } from "./validation";
import { peopleEvent } from "./service";
import type { FileHandle } from "node:fs/promises";
import { documentParentVisible } from "@/features/people-operations/access";
import { assertOption } from "@/features/settings/config";

export async function listDocuments(identity: Identity | null, employeeId: unknown, personal = false) {
  return securityBoundary(identity, async actor => {
    const id = validated(uuidSchema, employeeId); assertEmployeeScope(actor, id);
    if (personal && actor.employeeId !== id) throw new AppError(404, "NOT_FOUND", "Document not found.");
    const records=await db.employeeDocument.findMany({ where: { employeeId: id, deletedAt: null, ...(personal || actor.role === "EMPLOYEE" ? { employeeVisible: true } : {}) },
      take: 100, orderBy: { createdAt: "desc" }, select: { id: true, type: true, displayName: true, mimeType: true, fileSize: true, issuedOn: true, expiresOn: true, employeeVisible: true, createdAt: true,
        uploader: { select: { displayName: true, employee: { select: { legalName: true } } } } } });
    return personal||actor.role==="EMPLOYEE"?(await Promise.all(records.map(async r=>await documentParentVisible(db,id,r.id)?r:null))).filter(r=>r!==null):records;
  });
}
export async function uploadDocument(identity: Identity | null, input: unknown, file: File) {
  await securityBoundary(identity, async actor => assertRole(actor, ["ADMIN", "HR_MANAGER"]));
  const value = validated(documentSchema, input);
  return withDocumentSlot(async () => {
    const content = await validateFile(file);
    if (value.profilePhoto && (content.mimeType === "application/pdf" || value.type !== "OTHER" || !value.employeeVisible)) throw new AppError(400, "PHOTO_TYPE", "Profile photos must be released JPEG/PNG files in Other.");
    return authorizedMutation(identity, async (actor, tx) => {
      assertRole(actor, ["ADMIN", "HR_MANAGER"]);
      if (!await tx.employee.findUnique({ where: { id: value.employeeId }, select: { id: true } })) throw new AppError(404, "NOT_FOUND", "Employee record not found.");
      await assertOption(tx, "DOCUMENT_TYPE", value.type);
      if (value.employmentPeriodId && !await tx.employmentPeriod.findFirst({ where: { id: value.employmentPeriodId, employeeId: value.employeeId }, select: { id: true } })) throw new AppError(404, "NOT_FOUND", "Employment record not found.");
      // Shared physical-deletion lock namespace: future backup/cleanup tools must use 73102302.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(73102302)`;
      const storageKey = await writePrivateFile(content.bytes);
      const { profilePhoto, ...metadata } = value;
      const document = await tx.employeeDocument.create({ data: { ...metadata, storageKey, mimeType: content.mimeType, fileSize: content.fileSize, sha256: content.sha256, uploadedBy: actor.userId } });
      if (profilePhoto) await tx.employee.update({ where: { id: value.employeeId }, data: { photoDocumentId: document.id } });
      await audit({ actorUserId: actor.userId, employeeId: document.employeeId, action: "DOCUMENT_UPLOADED", entity: "employee_documents", entityId: document.id,
        after: { type: document.type, fileSize: document.fileSize, mimeType: document.mimeType, employeeVisible: document.employeeVisible, profilePhoto } }, tx);
      await peopleEvent(tx, { employeeId: document.employeeId, actorUserId: actor.userId, type: "DOCUMENT_UPLOADED", title: "Employee document added", sourceType: "employee_documents", sourceId: document.id, employeeVisible: document.employeeVisible });
      return document.id;
    });
  });
}
export async function deleteDocument(identity: Identity | null, input: unknown) {
  await securityBoundary(identity, async actor => assertRole(actor, ["ADMIN", "HR_MANAGER"]));
  const value = validated(deleteDocumentSchema, input);
  return authorizedMutation(identity, async (actor, tx) => {
    assertRole(actor, ["ADMIN", "HR_MANAGER"]);
    const document = await tx.employeeDocument.findFirst({ where: { id: value.documentId, employeeId: value.employeeId, deletedAt: null } });
    if (!document) throw new AppError(404, "NOT_FOUND", "Document not found.");
    await tx.employee.updateMany({ where: { id: value.employeeId, photoDocumentId: document.id }, data: { photoDocumentId: null } });
    await tx.employeeDocument.update({ where: { id: document.id }, data: { deletedAt: new Date(), deletionReason: value.reason } });
    await audit({ actorUserId: actor.userId, employeeId: document.employeeId, action: "DOCUMENT_DELETED", entity: "employee_documents", entityId: document.id, reason: value.reason, after: { bytesRetained: true } }, tx);
  });
}
export async function downloadDocument(identity: Identity | null, employeeId: unknown, documentId: unknown, personal = false) {
  const id = validated(uuidSchema, employeeId), docId = validated(uuidSchema, documentId);
  let opened: FileHandle | undefined;
  try { return await securityBoundary(identity, async () => authorizedMutation(identity, async (actor, tx) => {
    assertEmployeeScope(actor, id);
    if (personal && actor.employeeId !== id) throw new AppError(404, "NOT_FOUND", "Document not found.");
    const document = await tx.employeeDocument.findFirst({ where: { id: docId, employeeId: id, deletedAt: null, ...(personal || actor.role === "EMPLOYEE" ? { employeeVisible: true } : {}) } });
    if (!document) throw new AppError(404, "NOT_FOUND", "Document not found.");
    if((personal||actor.role==="EMPLOYEE")&&!await documentParentVisible(tx,id,docId))throw new AppError(404,"NOT_FOUND","Document not found.");
    const file = opened = await openPrivateFile(document.storageKey, document.fileSize);
    await audit({ actorUserId: actor.userId, employeeId: id, action: "DOCUMENT_DOWNLOADED", entity: "employee_documents", entityId: docId }, tx);
    return { file, mimeType: document.mimeType, displayName: document.displayName, fileSize: document.fileSize };
  })); } catch (error) { await opened?.close(); throw error; }
}

export async function updateDocumentVisibility(identity: Identity | null, input: unknown) {
  await securityBoundary(identity, async actor => assertRole(actor, ["ADMIN", "HR_MANAGER"]));
  const value = validated(documentVisibilitySchema, input);
  return authorizedMutation(identity, async (actor, tx) => {
    assertRole(actor, ["ADMIN", "HR_MANAGER"]);
    const document = await tx.employeeDocument.findFirst({ where: { id: value.documentId, employeeId: value.employeeId, deletedAt: null } });
    if (!document) throw new AppError(404, "NOT_FOUND", "Document not found.");
    if (!value.employeeVisible) await tx.employee.updateMany({ where: { id: value.employeeId, photoDocumentId: document.id }, data: { photoDocumentId: null } });
    await tx.employeeDocument.update({ where: { id: document.id }, data: { employeeVisible: value.employeeVisible } });
    await audit({ actorUserId: actor.userId, employeeId: document.employeeId, action: "DOCUMENT_VISIBILITY_CHANGED", entity: "employee_documents", entityId: document.id, reason: value.reason,
      before: { employeeVisible: document.employeeVisible }, after: { employeeVisible: value.employeeVisible } }, tx);
    await peopleEvent(tx, { employeeId: document.employeeId, actorUserId: actor.userId, type: "DOCUMENT_VISIBILITY_CHANGED", title: "Document access updated", sourceType: "employee_documents", sourceId: document.id, employeeVisible: value.employeeVisible });
  });
}
