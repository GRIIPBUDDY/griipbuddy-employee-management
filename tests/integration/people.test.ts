import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { testPostgres } from "../postgres";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import type { Identity } from "@/types/auth";
import type { PrismaClient } from "@/generated/prisma/client";
import type * as People from "@/features/people/service";
import type * as Documents from "@/features/people/documents";
import type * as Records from "@/features/people/timeline";
let database: Awaited<ReturnType<typeof testPostgres>>, db: PrismaClient, directory: string;
let people: typeof People, documents: typeof Documents, records: typeof Records;
let admin: Identity, hr: Identity, alice: Identity, bob: Identity;
let aliceId: string, bobId: string, createdId: string, releasedId: string, privateId: string, pdfId: string, workId: string;
let png: Buffer, pdf: Buffer;
const identity = (userId: string, sessionVersion = 1): Identity => { const issuedAt = Date.now(); return { userId, sessionVersion, issuedAt, absoluteExpiresAt: issuedAt + 43200000 }; };
const personal = (employeeNumber = "NEW-001", legalName = "Created Employee") => ({ employeeNumber, legalName, preferredName: "", dateOfBirth: "1995-04-03", gender: "", nationality: "Bangladeshi", phone: "123", address: "Test address", emergencyName: "Contact", emergencyPhone: "321", emergencyRelationship: "Sibling" });
const employment = () => ({ startDate: "2020-01-01", endDate: "", departmentLabel: "Operations", positionLabel: "Associate", employmentType: "FULL_TIME", workLocation: "Dhaka", probationEndDate: "2020-04-01", managerEmployeeId: "" });
const metadata = (employeeId: string, employeeVisible: boolean, type = "OTHER") => ({ employeeId, type, displayName: "Private test file", issuedOn: "2020-01-01", expiresOn: "2030-01-01", employmentPeriodId: "", employeeVisible, profilePhoto: false });
const note = (employeeId: string, employeeVisible = true) => ({ employeeId, type: "TRAINING", title: "Safety training", description: "Completed training", eventDate: "2026-01-01", employeeVisible });
beforeAll(async () => {
  database = await testPostgres();
  process.env.DATABASE_URL = database.runtimeUrl;
  directory = await mkdtemp(join(tmpdir(), "griipbuddy-people-test-"));
  process.env.PRIVATE_DOCUMENTS_DIR = directory;
  db = (await import("@/lib/db/client")).db;
  people = await import("@/features/people/service"); documents = await import("@/features/people/documents"); records = await import("@/features/people/timeline");
  const { hashPassword } = await import("@/lib/auth/passwords");
  const hash = await hashPassword("Phase3B-test-password-2026");
  const adminUser = await db.user.create({ data: { email: "admin@example.test", role: "ADMIN", displayName: "Admin", passwordHash: hash, mustChangePassword: false } });
  admin = identity(adminUser.id);
  await db.organizationSettings.create({ data: { companyName: "Test company", changedBy: admin.userId, overtimePolicyVersions: [] } });
  hr = identity((await db.user.create({ data: { email: "hr@example.test", role: "HR_MANAGER", displayName: "HR", passwordHash: hash, mustChangePassword: false } })).id);
  for (const name of ["Alice", "Bob"]) {
    const user = await db.user.create({ data: { email: `${name.toLowerCase()}@example.test`, role: "EMPLOYEE", passwordHash: hash, mustChangePassword: false } });
    const employee = await db.employee.create({ data: { userId: user.id, employeeNumber: name, legalName: `${name} Private`, createdBy: admin.userId, bankDetails: { accountNumber: "secret-bank-value" }, employmentPeriods: { create: { startDate: new Date("2020-01-01"), departmentLabel: "Operations", positionLabel: "Associate", createdBy: admin.userId } } } });
    if (name === "Alice") { alice = identity(user.id); aliceId = employee.id; } else { bob = identity(user.id); bobId = employee.id; }
  }
  png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "blue" } }).png().toBuffer();
  const document = await PDFDocument.create(); document.addPage(); pdf = Buffer.from(await document.save());
});
afterAll(async () => { await db?.$disconnect(); await database?.stop(); if (directory) await rm(directory, { recursive: true, force: true }); delete process.env.PRIVATE_DOCUMENTS_DIR; });

describe("Phase 3B server operations with restricted PostgreSQL and private filesystem", () => {
  it("creates employee, login, employment, audit and timeline atomically", async () => {
    createdId = await people.createEmployee(admin, { personal: personal(), employment: employment(), userId: "", email: "created@example.test", temporaryPassword: "New-employee-temporary-2026" });
    const employee = await db.employee.findUniqueOrThrow({ where: { id: createdId }, include: { user: true, employmentPeriods: true } });
    expect(employee.employeeNumber).toBe("NEW-001"); expect(employee.user.mustChangePassword).toBe(true); expect(employee.employmentPeriods[0].workLocation).toBe("Dhaka");
    expect(await db.auditLog.count({ where: { employeeId: createdId, action: "EMPLOYEE_CREATED" } })).toBe(1);
    expect(await db.employeeActivity.count({ where: { employeeId: createdId, type: "EMPLOYEE_CREATED" } })).toBe(1);
  });
  it("rejects duplicate employee IDs and rolls back the attempted new login", async () => {
    await expect(people.createEmployee(admin, { personal: personal(), employment: employment(), userId: "", email: "duplicate@example.test", temporaryPassword: "Another-temporary-password-2026" })).rejects.toMatchObject({ status: 409 });
    expect(await db.user.findUnique({ where: { email: "duplicate@example.test" } })).toBeNull();
  });
  it("allows HR to link an existing account but never provision or grant a role", async () => {
    await expect(people.createEmployee(hr, { personal: personal("HR-NEW"), employment: employment(), userId: "", email: "forbidden@example.test", temporaryPassword: "Forbidden-temporary-2026" })).rejects.toMatchObject({ status: 403 });
    const user = await db.user.create({ data: { email: "provisioned@example.test", role: "HR_MANAGER", displayName: "Provisioned", passwordHash: "unused-test-hash", mustChangePassword: false } });
    const id = await people.createEmployee(hr, { personal: personal("HR-NEW"), employment: employment(), userId: user.id, email: "", temporaryPassword: "" });
    expect((await db.employee.findUniqueOrThrow({ where: { id } })).userId).toBe(user.id);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe("HR_MANAGER");
  });
  it("edits with staff authority, rejects stale forms and keeps audit details minimal", async () => {
    const employee = await db.employee.findUniqueOrThrow({ where: { id: createdId } });
    await people.updateEmployee(hr, { employeeId: createdId, expectedUpdatedAt: employee.updatedAt.toISOString(), personal: personal("NEW-001", "Updated Employee") });
    expect((await db.employee.findUniqueOrThrow({ where: { id: createdId } })).legalName).toBe("Updated Employee");
    await expect(people.updateEmployee(admin, { employeeId: createdId, expectedUpdatedAt: employee.updatedAt.toISOString(), personal: personal() })).rejects.toMatchObject({ code: "STALE" });
    const entry = await db.auditLog.findFirstOrThrow({ where: { employeeId: createdId, action: "EMPLOYEE_CHANGED" } });
    expect(JSON.stringify(entry.after)).not.toContain("Test address");
  });
  it("audits department/position employment changes, validates ownership and rejects overlap", async () => {
    const period = await db.employmentPeriod.findFirstOrThrow({ where: { employeeId: createdId } });
    const update = { employeeId: createdId, periodId: period.id, revision: period.revision, reason: "Promotion", employment: { ...employment(), departmentLabel: "Support", positionLabel: "Lead", managerEmployeeId: aliceId } };
    await people.updateEmployment(hr, update);
    expect((await db.employmentPeriod.findUniqueOrThrow({ where: { id: period.id } })).managerEmployeeId).toBe(aliceId);
    await expect(people.updateEmployment(hr, update)).rejects.toMatchObject({ code: "STALE" });
    await expect(people.updateEmployment(hr, { ...update, employeeId: bobId })).rejects.toMatchObject({ status: 404 });
    await expect(db.employmentPeriod.create({ data: { employeeId: createdId, startDate: new Date("2021-01-01"), departmentLabel: "Other", positionLabel: "Other", createdBy: admin.userId } })).rejects.toBeDefined();
  });
  it("rejects unauthenticated and employee management writes before interpreting fields", async () => {
    for (const caller of [null, alice]) {
      await expect(people.createEmployee(caller, {})).rejects.toMatchObject({ status: caller ? 403 : 401 });
      await expect(people.updateEmployee(caller, { employeeId: bobId })).rejects.toMatchObject({ status: caller ? 403 : 401 });
      await expect(people.deactivateEmployee(caller, { employeeId: bobId })).rejects.toMatchObject({ status: caller ? 403 : 401 });
    }
  });
  it("derives self-service identity and rejects injected IDs and security fields", async () => {
    const contact = { phone: "999", address: "Own address", emergencyName: "Own Contact", emergencyPhone: "888", emergencyRelationship: "Family" };
    await people.updateOwnContact(alice, contact);
    expect((await db.employee.findUniqueOrThrow({ where: { id: aliceId } })).phone).toBe("999");
    expect((await db.employee.findUniqueOrThrow({ where: { id: bobId } })).phone).toBeNull();
    for (const injection of [{ employeeId: bobId }, { userId: bob.userId }, { preorderCommissionEnabled: true }, { role: "ADMIN" }]) await expect(people.updateOwnContact(alice, { ...contact, ...injection })).rejects.toMatchObject({ status: 400 });
  });
  it("scopes profile reads and paginates/searches staff directory safely", async () => {
    const { employeeProfile, ownProfile, searchEmployees } = await import("@/features/people/data");
    await expect(employeeProfile(alice, bobId)).rejects.toMatchObject({ status: 404 });
    expect((await ownProfile(alice))?.id).toBe(aliceId);
    expect(JSON.stringify(await employeeProfile(alice, aliceId))).not.toMatch(/bankDetails|secret-bank|passwordHash|sessionVersion|userId/);
    expect((await searchEmployees(hr, { search: "NEW-001" })).employees).toHaveLength(1);
    expect((await searchEmployees(admin, { department: "Operations", status: "ACTIVE" })).employees.length).toBeGreaterThan(0);
    await expect(searchEmployees(alice, { search: "Bob" })).rejects.toMatchObject({ status: 403 });
  });
  it("stores valid normalized images durably with generated keys and safe metadata DTOs", async () => {
    releasedId = await documents.uploadDocument(hr, metadata(aliceId, true), new File([new Uint8Array(png)], "../../untrusted.png", { type: "image/png" }));
    const document = await db.employeeDocument.findUniqueOrThrow({ where: { id: releasedId } });
    expect(document.storageKey).toMatch(/^[0-9a-f-]{36}\.bin$/);
    expect(await readFile(join(directory, document.storageKey))).toHaveLength(document.fileSize);
    expect(JSON.stringify(await documents.listDocuments(alice, aliceId))).not.toMatch(/storageKey|sha256|password|userId/);
    const download = await documents.downloadDocument(alice, aliceId, releasedId);
    expect(await download.file.readFile()).toHaveLength(download.fileSize); await download.file.close();
    expect(await db.auditLog.count({ where: { entityId: releasedId, action: "DOCUMENT_UPLOADED" } })).toBe(1);
  });
  it("accepts a structurally valid PDF and rejects active, malformed and polyglot PDFs", async () => {
    pdfId = await documents.uploadDocument(admin, metadata(aliceId, true, "PASSPORT"), new File([new Uint8Array(pdf)], "passport.pdf", { type: "application/pdf" }));
    expect((await db.employeeDocument.findUniqueOrThrow({ where: { id: pdfId } })).mimeType).toBe("application/pdf");
    const active = await PDFDocument.create(); active.addPage(); active.catalog.set(PDFName.of("OpenAction"), active.context.obj({ S: PDFName.of("JavaScript"), JS: PDFString.of("alert(1)") }));
    for (const bytes of [Buffer.from("%PDF-1.7\ninvalid\n%%EOF"), Buffer.concat([pdf, Buffer.from("<html>bad</html>")]), Buffer.from(await active.save())]) await expect(documents.uploadDocument(admin, metadata(aliceId, true), new File([new Uint8Array(bytes)], "bad.pdf", { type: "application/pdf" }))).rejects.toMatchObject({ code: "FILE_TYPE" });
  });
  it("rejects extension/MIME spoofing, unsupported and oversized files without metadata", async () => {
    const before = await db.employeeDocument.count();
    for (const file of [new File(["<svg/>"], "image.svg", { type: "image/svg+xml" }), new File([new Uint8Array(png)], "fake.jpg", { type: "image/jpeg" }), new File([new Uint8Array(10485761)], "large.png", { type: "image/png" }), new File([], "empty.pdf", { type: "application/pdf" })]) await expect(documents.uploadDocument(hr, metadata(aliceId, true), file)).rejects.toMatchObject({ status: 400 });
    expect(await db.employeeDocument.count()).toBe(before);
  });
  it("rejects employees uploading, deleting or fetching another employee's files", async () => {
    await expect(documents.uploadDocument(alice, metadata(bobId, true), new File([new Uint8Array(png)], "test.png", { type: "image/png" }))).rejects.toMatchObject({ status: 403 });
    await expect(documents.deleteDocument(alice, { employeeId: aliceId, documentId: releasedId, reason: "Forbidden" })).rejects.toMatchObject({ status: 403 });
    await expect(documents.listDocuments(bob, aliceId)).rejects.toMatchObject({ status: 404 });
    await expect(documents.downloadDocument(bob, aliceId, releasedId)).rejects.toMatchObject({ status: 404 });
    await expect(documents.downloadDocument(bob, bobId, releasedId)).rejects.toMatchObject({ status: 404 });
    await expect(documents.downloadDocument(null, aliceId, releasedId)).rejects.toMatchObject({ status: 401 });
  });
  it("hides unreleased documents and reauthorizes publication live", async () => {
    privateId = await documents.uploadDocument(hr, metadata(aliceId, false, "BANK"), new File([new Uint8Array(png)], "bank.png", { type: "image/png" }));
    expect((await documents.listDocuments(alice, aliceId)).some(d => d.id === privateId)).toBe(false);
    await expect(documents.downloadDocument(alice, aliceId, privateId)).rejects.toMatchObject({ status: 404 });
    const download = await documents.downloadDocument(hr, aliceId, privateId); await download.file.close();
    await db.employeeDocument.update({ where: { id: releasedId }, data: { employeeVisible: false } });
    await expect(documents.downloadDocument(alice, aliceId, releasedId)).rejects.toMatchObject({ status: 404 });
    await db.employeeDocument.update({ where: { id: releasedId }, data: { employeeVisible: true } });
  });
  it("enforces same-employee document/stint/photo links and immutable file identity", async () => {
    const otherPeriod = await db.employmentPeriod.findFirstOrThrow({ where: { employeeId: bobId } });
    await expect(documents.uploadDocument(admin, { ...metadata(aliceId, true), employmentPeriodId: otherPeriod.id }, new File([new Uint8Array(png)], "stint.png", { type: "image/png" }))).rejects.toMatchObject({ status: 404 });
    await expect(db.employee.update({ where: { id: bobId }, data: { photoDocumentId: releasedId } })).rejects.toBeDefined();
    await expect(db.employeeDocument.update({ where: { id: releasedId }, data: { employeeId: bobId } })).rejects.toBeDefined();
    await expect(db.employeeDocument.update({ where: { id: releasedId }, data: { storageKey: `${randomUUID()}.bin` } })).rejects.toBeDefined();
    const { openPrivateFile } = await import("@/lib/documents/files");
    await expect(openPrivateFile("../../package.json", 1)).rejects.toThrow("Invalid private storage key");
  });
  it("publishes and hides document access with live ownership, photo cleanup and audit", async () => {
    await expect(documents.updateDocumentVisibility(alice, { employeeId: aliceId, documentId: privateId, employeeVisible: true, reason: "Forbidden" })).rejects.toMatchObject({ status: 403 });
    await expect(documents.updateDocumentVisibility(hr, { employeeId: bobId, documentId: privateId, employeeVisible: true, reason: "Wrong owner" })).rejects.toMatchObject({ status: 404 });
    await documents.updateDocumentVisibility(hr, { employeeId: aliceId, documentId: privateId, employeeVisible: true, reason: "Release to employee" });
    const opened = await documents.downloadDocument(alice, aliceId, privateId); await opened.file.close();
    await db.employee.update({ where: { id: aliceId }, data: { photoDocumentId: privateId } });
    await documents.updateDocumentVisibility(hr, { employeeId: aliceId, documentId: privateId, employeeVisible: false, reason: "Return to staff only" });
    expect((await db.employee.findUniqueOrThrow({ where: { id: aliceId } })).photoDocumentId).toBeNull();
    await expect(documents.downloadDocument(alice, aliceId, privateId)).rejects.toMatchObject({ status: 404 });
    expect(await db.auditLog.count({ where: { entityId: privateId, action: "DOCUMENT_VISIBILITY_CHANGED" } })).toBe(2);
  });
  it("sets and safely removes private profile photos without deleting their bytes", async () => {
    const photoId = await documents.uploadDocument(hr, { ...metadata(aliceId, true), profilePhoto: true }, new File([new Uint8Array(png)], "photo.png", { type: "image/png" }));
    expect((await db.employee.findUniqueOrThrow({ where: { id: aliceId } })).photoDocumentId).toBe(photoId);
    await documents.deleteDocument(hr, { employeeId: aliceId, documentId: photoId, reason: "New photo required" });
    expect((await db.employee.findUniqueOrThrow({ where: { id: aliceId } })).photoDocumentId).toBeNull();
    const row = await db.employeeDocument.findUniqueOrThrow({ where: { id: photoId } });
    expect(await readFile(join(directory, row.storageKey))).toHaveLength(row.fileSize);
    await expect(documents.downloadDocument(alice, aliceId, photoId)).rejects.toMatchObject({ status: 404 });
  });
  it("releases only explicitly visible work records and rejects employee record writes", async () => {
    workId = await records.createWorkRecord(hr, note(aliceId));
    const hidden = await records.createWorkRecord(hr, { ...note(aliceId, false), title: "Private HR note", description: "Never disclose this" });
    const own = await records.ownTimeline(alice);
    expect(own.some(r => r.id === workId)).toBe(true); expect(own.some(r => r.id === hidden)).toBe(false); expect(JSON.stringify(own)).not.toContain("Never disclose");
    await expect(records.employeeTimeline(bob, aliceId)).rejects.toMatchObject({ status: 404 });
    await expect(records.createWorkRecord(alice, note(bobId))).rejects.toMatchObject({ status: 403 });
    await expect(records.deleteWorkRecord(alice, { employeeId: aliceId, recordId: workId, reason: "Forbidden" })).rejects.toMatchObject({ status: 403 });
  });
  it("corrects work records with original content in audit and rejects stale/cross-owner edits", async () => {
    const record = await db.employeeActivity.findUniqueOrThrow({ where: { id: workId } });
    const input = { ...note(aliceId), title: "Corrected training", recordId: workId, expectedUpdatedAt: record.updatedAt.toISOString(), reason: "Correct title" };
    await records.correctWorkRecord(hr, input);
    await expect(records.correctWorkRecord(admin, input)).rejects.toMatchObject({ code: "STALE" });
    await expect(records.correctWorkRecord(admin, { ...input, employeeId: bobId })).rejects.toMatchObject({ status: 404 });
    const audit = await db.auditLog.findFirstOrThrow({ where: { entityId: workId, action: "WORK_RECORD_CORRECTED" } }); expect(JSON.stringify(audit.before)).toContain("Safety training");
    await records.deleteWorkRecord(hr, { employeeId: aliceId, recordId: workId, reason: "Retired note" });
    expect(await db.employeeActivity.findUnique({ where: { id: workId } })).not.toBeNull();
    expect((await records.ownTimeline(alice)).some(r => r.id === workId)).toBe(false);
  });
  it("rechecks source visibility and fails closed for unknown/future sources and restricted commissions", async () => {
    await db.employeeActivity.create({ data: { employeeId: aliceId, eventTime: new Date(), type: "FUTURE", title: "Future private source", description: "Secret future data", sourceType: "future_module", sourceId: randomUUID(), employeeVisible: true, createdBy: admin.userId } });
    await db.employeeActivity.create({ data: { employeeId: aliceId, eventTime: new Date(), type: "COMMISSION", title: "Restricted commission", description: "Restricted amount", employeeVisible: true, commissionRestricted: true, createdBy: admin.userId } });
    expect(JSON.stringify(await records.ownTimeline(alice))).not.toMatch(/Secret future|Restricted amount/);
    const before = (await records.ownTimeline(alice)).filter(r => r.sourceId === pdfId); expect(before).toHaveLength(1);
    await db.employeeDocument.update({ where: { id: pdfId }, data: { employeeVisible: false } });
    expect((await records.ownTimeline(alice)).some(r => r.sourceId === pdfId)).toBe(false);
  });
  it("keeps personal staff portals subject to own publication and feature rules", async () => {
    const employee = await db.employee.create({ data: { userId: hr.userId, employeeNumber: "HR-SELF", legalName: "HR Employee", createdBy: admin.userId, employmentPeriods: { create: { startDate: new Date("2020-01-01"), departmentLabel: "HR", positionLabel: "Manager", createdBy: admin.userId } } } });
    const documentId = await documents.uploadDocument(admin, metadata(employee.id, false), new File([new Uint8Array(png)], "hr.png", { type: "image/png" }));
    const recordId = await records.createWorkRecord(admin, note(employee.id, false));
    expect((await records.ownTimeline(hr)).some(r => r.id === recordId)).toBe(false);
    expect((await records.employeeTimeline(hr, employee.id)).some(r => r.id === recordId)).toBe(true);
    expect(await documents.listDocuments(hr, employee.id, true)).toHaveLength(0);
    await expect(documents.downloadDocument(hr, employee.id, documentId, true)).rejects.toMatchObject({ status: 404 });
    await expect(documents.listDocuments(hr, aliceId, true)).rejects.toMatchObject({ status: 404 });
    await expect(people.deactivateEmployee(hr, { employeeId: employee.id, reason: "Cannot disable staff" })).rejects.toMatchObject({ status: 403 });
  });
  it("soft-deletes documents, rejects new access and retains audit, metadata and bytes", async () => {
    const row = await db.employeeDocument.findUniqueOrThrow({ where: { id: releasedId } });
    await documents.deleteDocument(admin, { employeeId: aliceId, documentId: releasedId, reason: "Replaced document" });
    expect((await db.employeeDocument.findUniqueOrThrow({ where: { id: releasedId } })).deletedAt).not.toBeNull();
    expect(await readFile(join(directory, row.storageKey))).toHaveLength(row.fileSize);
    await expect(documents.downloadDocument(admin, aliceId, releasedId)).rejects.toMatchObject({ status: 404 });
    await expect(db.employeeDocument.delete({ where: { id: releasedId } })).rejects.toBeDefined();
    expect(await db.auditLog.count({ where: { entityId: releasedId, action: "DOCUMENT_DELETED" } })).toBe(1);
  });
  it("deactivates immediately while preserving documents, notes, periods and linked account", async () => {
    const documentId = await documents.uploadDocument(hr, metadata(bobId, true), new File([new Uint8Array(png)], "bob.png", { type: "image/png" }));
    const recordId = await records.createWorkRecord(hr, note(bobId));
    const fileCount = (await readdir(directory)).length;
    await people.deactivateEmployee(hr, { employeeId: bobId, reason: "Employment ended" });
    expect((await db.user.findUniqueOrThrow({ where: { id: bob.userId } })).isActive).toBe(false);
    expect(await db.employeeDocument.findUnique({ where: { id: documentId } })).not.toBeNull(); expect(await db.employeeActivity.findUnique({ where: { id: recordId } })).not.toBeNull();
    expect(await db.employmentPeriod.count({ where: { employeeId: bobId } })).toBe(1); expect((await readdir(directory)).length).toBe(fileCount);
    await expect(documents.downloadDocument(bob, bobId, documentId)).rejects.toMatchObject({ status: 401 });
    expect(await db.auditLog.count({ where: { employeeId: bobId, action: "EMPLOYEE_DEACTIVATED" } })).toBe(1);
    const download = await documents.downloadDocument(hr, bobId, documentId); await download.file.close();
  });
  it("creates and edits unique catalogs for staff, retaining original labels on rename", async () => {
    const catalogs = await import("@/features/organization/catalogs");
    const departmentId = await catalogs.createCatalog(hr, "departments", { name: "Catalog Department" });
    const positionId = await catalogs.createCatalog(admin, "positions", { name: "Catalog Position" });
    await expect(catalogs.createCatalog(hr, "departments", { name: "  CATALOG DEPARTMENT  " })).rejects.toMatchObject({ status: 409 });
    const employeeId = await people.createEmployee(admin, { personal: personal("CAT-001"), employment: { ...employment(), departmentId, positionId, departmentLabel: "Untrusted label", positionLabel: "Untrusted label" }, userId: "", email: "catalog@example.test", temporaryPassword: "Catalog-test-password-2026" });
    const period = await db.employmentPeriod.findFirstOrThrow({ where: { employeeId } });
    expect(period).toMatchObject({ departmentId, positionId, departmentLabel: "Catalog Department", positionLabel: "Catalog Position" });
    const entry = (await catalogs.listCatalog(hr, "departments")).find(d => d.id === departmentId)!;
    const update = { id: entry.id, name: "Renamed Department", isActive: true, expectedUpdatedAt: entry.updatedAt.toISOString(), reason: "New department name" };
    await catalogs.updateCatalog(hr, "departments", update);
    await expect(catalogs.updateCatalog(hr, "departments", update)).rejects.toMatchObject({ code: "STALE" });
    expect((await db.employmentPeriod.findUniqueOrThrow({ where: { id: period.id } })).departmentLabel).toBe("Catalog Department");
    const { searchEmployees } = await import("@/features/people/data");
    expect((await searchEmployees(hr, { department: departmentId })).employees.find(e => e.id === employeeId)?.departmentLabel).toBe("Renamed Department");
    expect(await db.auditLog.count({ where: { entityId: departmentId, action: "CATALOG_CHANGED" } })).toBe(1);
  });
  it("deactivates in-use catalogs without breaking history or allowing new assignments", async () => {
    const catalogs = await import("@/features/organization/catalogs");
    const department = await db.department.findUniqueOrThrow({ where: { normalizedName: "renamed department" } });
    const position = await db.position.findUniqueOrThrow({ where: { normalizedName: "catalog position" } });
    const period = await db.employmentPeriod.findFirstOrThrow({ where: { departmentId: department.id } });
    for (const [kind, entry] of [["departments", department], ["positions", position]] as const) await catalogs.updateCatalog(admin, kind, { id: entry.id, name: entry.name, isActive: false, expectedUpdatedAt: entry.updatedAt.toISOString(), reason: "Retired" });
    await expect(people.createEmployee(admin, { personal: personal("CAT-002"), employment: { ...employment(), departmentId: department.id, positionId: position.id }, userId: "", email: "inactive-catalog@example.test", temporaryPassword: "Catalog-test-password-2026" })).rejects.toMatchObject({ code: "CATALOG_INACTIVE" });
    expect(await db.user.findUnique({ where: { email: "inactive-catalog@example.test" } })).toBeNull();
    await people.updateEmployment(hr, { employeeId: period.employeeId, periodId: period.id, revision: period.revision, employment: { ...employment(), departmentId: department.id, positionId: position.id, departmentLabel: "Tampered snapshot", positionLabel: "Tampered snapshot", workLocation: "New office" }, reason: "Location only" });
    expect((await db.employmentPeriod.findUniqueOrThrow({ where: { id: period.id } }))).toMatchObject({ departmentId: department.id, positionId: position.id, departmentLabel: "Catalog Department", positionLabel: "Catalog Position", workLocation: "New office" });
    await expect(db.department.delete({ where: { id: department.id } })).rejects.toBeDefined();
    await expect(database.owner.query("DELETE FROM positions WHERE id=$1", [position.id])).rejects.toBeDefined();
    await expect(database.owner.query("UPDATE departments SET created_by=$1 WHERE id=$2", [admin.userId, department.id])).rejects.toBeDefined();
  });
  it("rejects employee and guest catalog reads/writes and invalid references", async () => {
    const catalogs = await import("@/features/organization/catalogs");
    for (const caller of [null, alice]) {
      await expect(catalogs.listCatalog(caller, "departments")).rejects.toMatchObject({ status: caller ? 403 : 401 });
      await expect(catalogs.createCatalog(caller, "positions", { name: "Forbidden" })).rejects.toMatchObject({ status: caller ? 403 : 401 });
      await expect(catalogs.updateCatalog(caller, "departments", {})).rejects.toMatchObject({ status: caller ? 403 : 401 });
    }
    await expect(people.createEmployee(admin, { personal: personal("CAT-003"), employment: { ...employment(), departmentId: randomUUID() }, userId: "", email: "invalid-catalog@example.test", temporaryPassword: "Catalog-test-password-2026" })).rejects.toMatchObject({ code: "CATALOG_INVALID" });
    expect(await db.user.findUnique({ where: { email: "invalid-catalog@example.test" } })).toBeNull();
  });

});
