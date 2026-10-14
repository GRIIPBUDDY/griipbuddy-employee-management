import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { testPostgres } from "../postgres";
import type { Identity } from "@/types/auth";
import type { PrismaClient } from "@/generated/prisma/client";
// Employee incident & performance records: lifecycle, employee response, corrective action, privacy, evidence,
// audit, filters, timeline and retention. Disposable database and synthetic people only.
let database: Awaited<ReturnType<typeof testPostgres>>, db: PrismaClient, admin: Identity, hr: Identity, alice: Identity, bob: Identity, hrPerson: Identity;
let aliceId = "", bobId = "", hrPersonId = "";
const actionIdentity: Identity | null = null, now = new Date("2030-05-15T06:00:00Z");
vi.mock("@/lib/auth/request", () => ({ assertMutationOrigin: async () => {}, getIdentity: async () => actionIdentity }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const identity = (userId: string): Identity => { const issuedAt = Date.now(); return { userId, sessionVersion: 1, issuedAt, absoluteExpiresAt: issuedAt + 43200000 }; };
type Incidents = typeof import("@/features/people-operations/incidents");
let s: Incidents;
const concern = (overrides: Record<string, unknown> = {}) => ({ category: "WORK_QUALITY", title: "Wrong price on invoice", description: "Invoice 1042 was sent with the wholesale price instead of retail.", impact: "Customer was undercharged ৳1,200.", severity: "MEDIUM", occurredOn: "2030-05-10", occurredTime: "14:30", staffNotes: "Second similar case this month.", ...overrides });
const current = (id: string) => db.incidentRecord.findUniqueOrThrow({ where: { id } });
async function decided(employeeId = aliceId, decision: "CONFIRMED" | "DISPUTED" | "UNSUBSTANTIATED" = "CONFIRMED", data = concern()) {
  const id = await s.createIncident(admin, { employeeId, data });
  await s.submitIncident(admin, { id, revision: 1 });
  await s.decideIncident(admin, { id, revision: 2, decision, note: "Checked against the invoice log." });
  return id;
}
beforeAll(async () => {
  database = await testPostgres(); process.env.DATABASE_URL = database.runtimeUrl; db = (await import("@/lib/db/client")).db;
  vi.spyOn(await import("@/features/time/clock"), "databaseNow").mockImplementation(async () => new Date(now));
  s = await import("@/features/people-operations/incidents");
  const make = (email: string, role: "ADMIN" | "HR_MANAGER" | "EMPLOYEE") => db.user.create({ data: { email, role, displayName: email.split("@")[0], passwordHash: "synthetic", mustChangePassword: false } });
  const a = await make("inc-admin@example.test", "ADMIN"); admin = identity(a.id); hr = identity((await make("inc-hr@example.test", "HR_MANAGER")).id);
  await db.organizationSettings.create({ data: { companyName: "Incident regression", timezone: "Asia/Dhaka", changedBy: a.id, overtimePolicyVersions: [] } });
  for (const [name, role] of [["Alice Incident", "EMPLOYEE"], ["Bob Incident", "EMPLOYEE"], ["Hana Manager", "HR_MANAGER"]] as const) {
    const user = await make(`${name.split(" ")[0].toLowerCase()}-inc@example.test`, role);
    const e = await db.employee.create({ data: { userId: user.id, legalName: name, employeeNumber: `INC-${name.slice(0, 3).toUpperCase()}`, createdBy: a.id, employmentPeriods: { create: { startDate: new Date("2020-01-01"), departmentLabel: "Operations", positionLabel: "Associate", createdBy: a.id } } } });
    if (name.startsWith("Alice")) { aliceId = e.id; alice = identity(user.id); } else if (name.startsWith("Bob")) { bobId = e.id; bob = identity(user.id); } else { hrPersonId = e.id; hrPerson = identity(user.id); }
  }
});
afterAll(async () => { vi.restoreAllMocks(); await db?.$disconnect(); await database?.stop(); });
it("1–2. creates a draft with a sequential reference, edits it, and validates required fields and kind", async () => {
  const id = await s.createIncident(hr, { employeeId: aliceId, data: concern() });
  const row = await current(id);
  expect(row).toMatchObject({ number: 1, status: "DRAFT", kind: "CONCERN", severity: "MEDIUM", employeeVisible: false, reportedBy: hr.userId, staffNotes: "Second similar case this month." });
  expect(row.occurredAt?.toISOString()).toBe("2030-05-10T08:30:00.000Z"); // 14:30 Dhaka
  await s.editIncident(hr, { id, revision: 1, data: concern({ title: "Wrong price on invoice 1042", severity: "HIGH", occurredTime: "" }), reason: "" });
  expect(await current(id)).toMatchObject({ title: "Wrong price on invoice 1042", severity: "HIGH", occurredAt: null, revision: 2 });
  await expect(s.editIncident(hr, { id, revision: 1, data: concern(), reason: "" })).rejects.toMatchObject({ code: "STALE" });
  await expect(s.editIncident(hr, { id, revision: 2, data: concern({ category: "ACHIEVEMENT", severity: "" }), reason: "" })).rejects.toMatchObject({ code: "KIND" });
  await expect(s.createIncident(hr, { employeeId: aliceId, data: concern({ severity: "" }) })).rejects.toMatchObject({ status: 400 });
  await expect(s.createIncident(hr, { employeeId: aliceId, data: concern({ category: "ACHIEVEMENT" }) })).rejects.toMatchObject({ status: 400 }); // positive has no severity
  expect(await db.auditLog.findMany({ where: { entityId: id }, select: { action: true }, orderBy: { eventTime: "asc" } })).toEqual([{ action: "INCIDENT_CREATED" }, { action: "INCIDENT_EDITED" }]);
});
it("3–4. reviews: confirmed, disputed and unsubstantiated decisions with a required note; no second decision without reopening", async () => {
  const confirmed = await decided(aliceId, "CONFIRMED"), disputed = await decided(aliceId, "DISPUTED"), unsubstantiated = await decided(bobId, "UNSUBSTANTIATED");
  expect(await current(confirmed)).toMatchObject({ status: "CONFIRMED", reviewedBy: admin.userId, reviewNote: "Checked against the invoice log." });
  expect((await current(disputed)).status).toBe("DISPUTED"); expect((await current(unsubstantiated)).status).toBe("UNSUBSTANTIATED");
  await expect(s.decideIncident(admin, { id: confirmed, revision: 3, decision: "DISPUTED", note: "Again" })).rejects.toMatchObject({ code: "STATUS" });
  const draft = await s.createIncident(admin, { employeeId: aliceId, data: concern() });
  await expect(s.decideIncident(admin, { id: draft, revision: 1, decision: "CONFIRMED", note: "" })).rejects.toMatchObject({ status: 400 });
  const positive = await s.createIncident(admin, { employeeId: aliceId, data: concern({ category: "ACHIEVEMENT", severity: "", title: "Closed the quarter early" }) });
  await expect(s.decideIncident(admin, { id: positive, revision: 1, decision: "DISPUTED", note: "n/a" })).rejects.toMatchObject({ code: "DECISION" });
  await s.decideIncident(admin, { id: positive, revision: 1, decision: "CONFIRMED", note: "Great work" });
  expect(await current(positive)).toMatchObject({ kind: "POSITIVE", status: "CONFIRMED", severity: null });
  // Facts are frozen after a decision; reopening (audited) is the way to amend.
  await expect(s.editIncident(admin, { id: confirmed, revision: 3, data: concern(), reason: "" })).rejects.toMatchObject({ code: "STATUS" });
  await expect(db.incidentRecord.update({ where: { id: confirmed }, data: { description: "Rewritten", revision: { increment: 1 } } })).rejects.toThrow();
  await s.reopenIncident(admin, { id: confirmed, revision: 3, note: "New evidence from the customer" });
  expect(await current(confirmed)).toMatchObject({ status: "UNDER_REVIEW", reviewedAt: null });
  expect(await db.auditLog.count({ where: { entityId: confirmed, action: "INCIDENT_REVIEWED" } })).toBe(1); // previous decision kept in history
});
it("5–6. shared records: the employee acknowledges (not agreement) and responds once with a dispute that is retained", async () => {
  const id = await decided(aliceId, "CONFIRMED");
  await expect(s.respondToIncident(alice, { id, revision: 3, response: "Not shared yet", disputes: true })).rejects.toMatchObject({ status: 404 });
  await expect(s.setIncidentVisibility(admin, { id: await s.createIncident(admin, { employeeId: aliceId, data: concern() }), revision: 1, employeeVisible: true, responseRequested: false })).rejects.toMatchObject({ code: "DRAFT" });
  await s.setIncidentVisibility(admin, { id, revision: 3, employeeVisible: true, responseRequested: false });
  await expect(s.respondToIncident(alice, { id, revision: 4, response: "Too early", disputes: false })).rejects.toMatchObject({ code: "NO_RESPONSE" });
  await s.acknowledgeIncident(alice, { id, revision: 4 });
  expect(await current(id)).toMatchObject({ acknowledgedBy: alice.userId, status: "CONFIRMED", employeeResponse: null }); // acknowledgement is not agreement
  await s.setIncidentVisibility(admin, { id, revision: 5, employeeVisible: true, responseRequested: true });
  await s.respondToIncident(alice, { id, revision: 6, response: "The price list I was given was outdated.", disputes: true });
  expect(await current(id)).toMatchObject({ employeeResponse: "The price list I was given was outdated.", employeeDisputes: true, respondedBy: alice.userId, status: "CONFIRMED", reviewNote: "Checked against the invoice log." });
  await expect(s.respondToIncident(alice, { id, revision: 7, response: "Changed my mind", disputes: false })).rejects.toMatchObject({ code: "RESPONDED" });
  await expect(db.incidentRecord.update({ where: { id }, data: { employeeResponse: null, employeeDisputes: null, respondedAt: null, respondedBy: null, revision: { increment: 1 } } })).rejects.toThrow(); // never erased
  const notes = await db.notification.findMany({ where: { sourceId: id }, select: { eventType: true } });
  expect(notes.map(n => n.eventType).sort()).toEqual(expect.arrayContaining(["INCIDENT_SHARED", "INCIDENT_RESPONSE_REQUESTED", "STAFF_INCIDENT_RESPONSE"]));
});
it("7. corrective action and follow-up are tracked, overdue follow-ups are counted, and nothing financial happens", async () => {
  const before = { rates: await db.compensationRate.count(), status: (await db.user.findUniqueOrThrow({ where: { id: alice.userId } })).accountStatus, adjustments: await db.salaryAdjustment.count() };
  const id = await decided(aliceId, "CONFIRMED", concern({ severity: "CRITICAL" }));
  await expect(s.recordCorrectiveAction(admin, { id, revision: 3, action: "TRAINING", note: "", followUpOn: "2030-05-01" })).rejects.toMatchObject({ code: "FOLLOW_UP" });
  await s.recordCorrectiveAction(admin, { id, revision: 3, action: "TRAINING", note: "Pricing refresher", followUpOn: "2030-05-12" });
  const overview = await s.incidentOverview(admin, { search: "" });
  expect(overview.records.find(r => r.id === id)).toMatchObject({ overdue: true, correctiveAction: "TRAINING", correctiveDone: false });
  expect(overview.counts.overdue).toBeGreaterThanOrEqual(1); expect(overview.counts.high).toBeGreaterThanOrEqual(1);
  await s.completeFollowUp(admin, { id, revision: 4, note: "Attended 14 May" });
  expect(await current(id)).toMatchObject({ correctiveCompletedBy: admin.userId, completionNote: "Attended 14 May" });
  await expect(s.recordCorrectiveAction(admin, { id, revision: 5, action: "WARNING", note: "" })).rejects.toMatchObject({ code: "COMPLETED" });
  await s.resolveIncident(admin, { id, revision: 5, outcome: "RESOLVED", note: "Training completed; no repeat." });
  expect(await current(id)).toMatchObject({ status: "RESOLVED", resolvedBy: admin.userId });
  const positive = await s.createIncident(admin, { employeeId: aliceId, data: concern({ category: "IMPROVEMENT", severity: "" }) });
  await expect(s.recordCorrectiveAction(admin, { id: positive, revision: 1, action: "COACHING", note: "" })).rejects.toMatchObject({ code: "KIND" });
  expect({ rates: await db.compensationRate.count(), status: (await db.user.findUniqueOrThrow({ where: { id: alice.userId } })).accountStatus, adjustments: await db.salaryAdjustment.count() }).toEqual(before);
});
it("8. evidence stays private: staff-only until the record is shared, own-employee documents only", async () => {
  const doc = await db.employeeDocument.create({ data: { employeeId: aliceId, type: "INCIDENT_EVIDENCE", displayName: "Invoice 1042.pdf", storageKey: `${randomUUID()}.bin`, mimeType: "application/pdf", fileSize: 10, sha256: "a".repeat(64), employeeVisible: true, uploadedBy: admin.userId } });
  const bobDoc = await db.employeeDocument.create({ data: { employeeId: bobId, type: "OTHER", displayName: "Bob file.pdf", storageKey: `${randomUUID()}.bin`, mimeType: "application/pdf", fileSize: 10, sha256: "b".repeat(64), uploadedBy: admin.userId } });
  const id = await decided(aliceId, "CONFIRMED");
  await expect(s.setIncidentEvidence(admin, { id, revision: 3, documentId: bobDoc.id })).rejects.toMatchObject({ code: "EVIDENCE" });
  await s.setIncidentEvidence(admin, { id, revision: 3, documentId: doc.id });
  const documents = await import("@/features/people/documents");
  expect((await documents.listDocuments(alice, aliceId, true)).map(d => d.id)).not.toContain(doc.id); // hidden while the incident is not shared
  expect((await s.ownIncidents(alice)).records.map(r => r.id)).not.toContain(id);
  await s.setIncidentVisibility(admin, { id, revision: 4, employeeVisible: true, responseRequested: false });
  expect((await documents.listDocuments(alice, aliceId, true)).map(d => d.id)).toContain(doc.id);
  expect((await s.ownIncidents(alice, id)).records[0].evidence).toEqual({ id: doc.id, displayName: "Invoice 1042.pdf" });
  expect((await s.ownIncidents(bob)).records.map(r => r.id)).not.toContain(id);
  await s.setIncidentEvidence(admin, { id, revision: 5, documentId: null });
  expect(await db.auditLog.findMany({ where: { entityId: id, action: { startsWith: "INCIDENT_EVIDENCE" } }, select: { action: true }, orderBy: { eventTime: "asc" } })).toEqual([{ action: "INCIDENT_EVIDENCE_ATTACHED" }, { action: "INCIDENT_EVIDENCE_REMOVED" }]);
});
it("9–11. employees cannot see others' records, staff views, internal notes, the reporter or history, and cannot change records", async () => {
  const id = await decided(aliceId, "CONFIRMED");
  await s.setIncidentVisibility(admin, { id, revision: 3, employeeVisible: true, responseRequested: true });
  await expect(s.ownIncidents(bob, id)).rejects.toMatchObject({ status: 404 });
  for (const who of [alice, bob]) {
    await expect(s.incidentDetail(who, id)).rejects.toMatchObject({ status: 403 });
    await expect(s.incidentOverview(who, {})).rejects.toMatchObject({ status: 403 });
    await expect(s.editIncident(who, { id, revision: 4, data: concern({ description: "Employee rewrite" }), reason: "" })).rejects.toMatchObject({ status: 403 });
    await expect(s.decideIncident(who, { id, revision: 4, decision: "UNSUBSTANTIATED", note: "Mine" })).rejects.toMatchObject({ status: 403 });
    await expect(s.reopenIncident(who, { id, revision: 4, note: "Mine" })).rejects.toMatchObject({ status: 403 });
  }
  await expect(s.respondToIncident(bob, { id, revision: 4, response: "Not my record", disputes: true })).rejects.toMatchObject({ status: 404 });
  const own = JSON.stringify((await s.ownIncidents(alice, id)).records[0]);
  for (const hidden of ["Second similar case this month", "staffNotes", "reportedBy", hr.userId, admin.userId]) expect(own).not.toContain(hidden);
  expect((await current(id)).description).toBe(concern().description);
});
it("an HR manager cannot read or manage records about themselves; an administrator can", async () => {
  const id = await s.createIncident(admin, { employeeId: hrPersonId, data: concern({ title: "Missed approval" }) });
  await expect(s.createIncident(hrPerson, { employeeId: hrPersonId, data: concern() })).rejects.toMatchObject({ code: "SELF_RECORD" });
  await expect(s.incidentDetail(hrPerson, id)).rejects.toMatchObject({ code: "SELF_RECORD" });
  expect((await s.incidentOverview(hrPerson, { search: "" })).records.map(r => r.id)).not.toContain(id);
  expect((await s.incidentOverview(hr, { search: "" })).records.map(r => r.id)).toContain(id); // another HR manager may
  await expect(s.incidentDetail(admin, id)).resolves.toMatchObject({ canManage: true });
});
it("12. the full lifecycle is audited with actor, record and before/after values", async () => {
  const id = await decided(bobId, "DISPUTED");
  await s.setIncidentVisibility(hr, { id, revision: 3, employeeVisible: true, responseRequested: true });
  await s.recordCorrectiveAction(hr, { id, revision: 4, action: "FURTHER_REVIEW", note: "", followUpOn: "" });
  await s.acknowledgeIncident(bob, { id, revision: 5 });
  await s.respondToIncident(bob, { id, revision: 6, response: "I followed the documented process.", disputes: true });
  await s.resolveIncident(hr, { id, revision: 7, outcome: "CLOSED", note: "Process gap, not individual fault." });
  await s.reopenIncident(admin, { id, revision: 8, note: "Audit request" });
  const logs = await db.auditLog.findMany({ where: { entityId: id }, orderBy: { eventTime: "asc" }, select: { action: true, actorUserId: true, before: true, after: true } });
  expect(logs.map(l => l.action)).toEqual(["INCIDENT_CREATED", "INCIDENT_SUBMITTED", "INCIDENT_REVIEWED", "INCIDENT_VISIBILITY_CHANGED", "CORRECTIVE_ACTION_RECORDED", "INCIDENT_ACKNOWLEDGED", "INCIDENT_RESPONSE_SUBMITTED", "INCIDENT_CLOSED", "INCIDENT_REOPENED"]);
  expect(logs.find(l => l.action === "INCIDENT_RESPONSE_SUBMITTED")).toMatchObject({ actorUserId: bob.userId, after: expect.objectContaining({ responded: true, employeeDisputes: true }) });
  expect(logs.find(l => l.action === "INCIDENT_REOPENED")).toMatchObject({ before: expect.objectContaining({ status: "CLOSED" }), after: expect.objectContaining({ status: "UNDER_REVIEW" }) });
  // Ordinary users can never rewrite or delete audit history.
  await expect(db.auditLog.deleteMany({ where: { entityId: id } })).rejects.toThrow();
});
it("13–14. counts, date filters, search by reference or employee, pagination and repeated-concern prompts", async () => {
  for (let i = 0; i < 27; i++) await s.createIncident(admin, { employeeId: bobId, data: concern({ title: `Late report ${i}`, category: "TASK_DEADLINE", severity: "LOW", occurredOn: i < 5 ? "2030-04-02" : "2030-05-02" }) });
  const april = await s.incidentOverview(admin, { employeeId: bobId, from: "2030-04-01", to: "2030-04-30", category: "TASK_DEADLINE" });
  expect(april.total).toBe(5); expect(april.records.every(r => r.occurredOn.startsWith("2030-04"))).toBe(true);
  const all = await s.incidentOverview(admin, { employeeId: bobId, category: "TASK_DEADLINE" }), page2 = await s.incidentOverview(admin, { employeeId: bobId, category: "TASK_DEADLINE", page: 2 });
  expect(all.total).toBe(27); expect(all.records).toHaveLength(25); expect(page2.records).toHaveLength(2);
  const target = (await db.incidentRecord.findFirstOrThrow({ where: { title: "Late report 3" } })).number;
  expect((await s.incidentOverview(admin, { search: `INC-${String(target).padStart(5, "0")}` })).records.map(r => r.title)).toEqual(["Late report 3"]);
  expect((await s.incidentOverview(admin, { search: "bob incident" })).records.every(r => r.employee.legalName === "Bob Incident")).toBe(true);
  await expect(s.incidentOverview(admin, { from: "2030-05-02", to: "2030-05-01" })).rejects.toMatchObject({ code: "DATE_RANGE" });
  // Drafts never count toward repeated concerns; three reviewed concerns in 90 days do — as a prompt only.
  expect((await s.incidentOverview(admin, {})).repeated.find(r => r.employee.id === bobId)).toBeUndefined();
  for (let i = 0; i < 3; i++) await decided(bobId, "CONFIRMED", concern({ occurredOn: "2030-05-0" + (i + 3) }));
  expect((await s.incidentOverview(admin, {})).repeated.find(r => r.employee.id === bobId)?.count).toBeGreaterThanOrEqual(3);
});
it("15. the employee timeline shows incident entries to staff, and to the employee only once shared", async () => {
  const id = await decided(aliceId, "CONFIRMED", concern({ title: "Timeline check" }));
  const timeline = await import("@/features/people/timeline"), mine = async () => (await timeline.employeeTimeline(alice, aliceId, true)).filter(e => e.sourceId === id);
  expect((await timeline.employeeTimeline(admin, aliceId)).some(e => e.sourceId === id && e.href === `/manage/incidents/${id}`)).toBe(true);
  expect(await mine()).toHaveLength(0);
  await s.setIncidentVisibility(admin, { id, revision: 3, employeeVisible: true, responseRequested: false });
  expect((await mine()).map(e => e.href)).toContain(`/me/incidents?id=${id}`);
  await s.setIncidentVisibility(admin, { id, revision: 4, employeeVisible: false, responseRequested: false });
  expect(await mine()).toHaveLength(0);
});
it("16–17. records survive employee deactivation and can never be deleted", async () => {
  const id = await decided(bobId, "CONFIRMED", concern({ title: "Before leaving" }));
  const period = await db.employmentPeriod.findFirstOrThrow({ where: { employeeId: bobId } });
  await (await import("@/features/people/service")).deactivateEmployee(admin, { employeeId: bobId, reason: "Contract ended" });
  expect((await db.employmentPeriod.findUniqueOrThrow({ where: { id: period.id } })).endDate).not.toBeNull();
  expect((await s.incidentDetail(admin, id)).record.title).toBe("Before leaving");
  expect((await s.incidentOverview(admin, { employeeId: bobId })).total).toBeGreaterThan(0);
  await expect(db.incidentRecord.delete({ where: { id } })).rejects.toThrow();
  await expect(db.incidentRecord.deleteMany({ where: { employeeId: bobId } })).rejects.toThrow();
  expect(await db.incidentRecord.count({ where: { id } })).toBe(1);
});
it("the module can be switched off: pages and actions become unavailable while records are kept", async () => {
  const settings = await import("@/features/settings/organization");
  const modules = { tasks: true, shiftSwaps: true, commissions: true, performance: true, warnings: true, incidents: false, assets: true, workRecords: true, weeklyEarnings: false };
  await settings.updateModules(admin, modules);
  await expect(s.incidentOverview(admin, {})).rejects.toMatchObject({ status: 404 });
  await expect(s.ownIncidents(alice)).rejects.toMatchObject({ status: 404 });
  await settings.updateModules(admin, { ...modules, incidents: true });
  expect((await s.incidentOverview(admin, {})).total).toBeGreaterThan(0);
});
