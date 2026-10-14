import "server-only";
import { z } from "zod";
import type { Prisma, IncidentRecord } from "@/generated/prisma/client";
import { db } from "@/lib/db/client";
import { audit, type Database } from "@/lib/db/audit";
import { authorizedMutation } from "@/lib/db/mutation";
import { securityBoundary } from "@/lib/authorization/actor";
import { validated, uuidSchema, dateSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import type { Actor, Identity } from "@/types/auth";
import { databaseNow } from "@/features/time/clock";
import { addDays, dateKey, dateValue, localDate, localInstant } from "@/features/time/dates";
import { peopleEvent } from "@/features/people/service";
import { notify } from "@/features/review/notifications";
import { requireModule } from "@/features/settings/config";
import { peopleStaff } from "./access";
import { incidentCategories, severities, incidentStatuses, correctiveActions, decisions, openStatuses, isPositive, reference, type IncidentStatus } from "./incident-options";
// Employee incident & performance records. Staff (Admin, HR/Manager) manage records; an HR manager never manages
// records about themselves. Employees see only their own records that staff explicitly shared, never internal notes,
// and may acknowledge receipt and respond. Records are never deleted; decisions and responses stay in history.
const keys = <T extends Record<string, unknown>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
const text = (max: number) => z.string().trim().max(max).default("");
const optionalId = z.union([uuidSchema, z.literal(""), z.null()]).optional().transform(v => v || null);
const detailFields = {
  category: z.enum(keys(incidentCategories)), title: z.string().trim().min(1, "Give the record a short title.").max(150), description: z.string().trim().min(1, "Describe what happened factually.").max(5000),
  impact: text(2000), severity: z.union([z.enum(keys(severities)), z.literal("")]).optional().transform(v => v || null),
  occurredOn: dateSchema, occurredTime: z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time such as 14:30."), z.literal("")]).optional().transform(v => v || null),
  staffNotes: text(2000), relatedTaskId: optionalId, relatedSessionId: optionalId, relatedActivityId: optionalId, relatedWarningId: optionalId, relatedReviewId: optionalId,
};
const details = z.object(detailFields).strict().superRefine((v, ctx) => {
  if (isPositive(v.category) && v.severity) ctx.addIssue({ code: "custom", message: "Positive records have no severity." });
  if (!isPositive(v.category) && !v.severity) ctx.addIssue({ code: "custom", message: "Choose a severity for this record." });
});
const createSchema = z.object({ employeeId: uuidSchema, data: details }).strict();
const revisionFields = { id: uuidSchema, revision: z.coerce.number().int().positive() };
const editSchema = z.object({ ...revisionFields, data: details, reason: text(500) }).strict();
const noteSchema = z.object({ ...revisionFields, note: z.string().trim().min(1, "Add a short note.").max(2000) }).strict();
const decisionSchema = noteSchema.extend({ decision: z.enum(decisions) }).strict();
const resolveSchema = noteSchema.extend({ outcome: z.enum(["RESOLVED", "CLOSED"]) }).strict();
const correctiveSchema = z.object({ ...revisionFields, action: z.enum(keys(correctiveActions)), note: text(2000), followUpOn: z.union([dateSchema, z.literal("")]).optional().transform(v => v || null), relatedWarningId: optionalId }).strict();
const completionSchema = z.object({ ...revisionFields, note: text(2000) }).strict();
const visibilitySchema = z.object({ ...revisionFields, employeeVisible: z.boolean(), responseRequested: z.boolean() }).strict();
const evidenceSchema = z.object({ ...revisionFields, documentId: optionalId }).strict();
const responseSchema = z.object({ ...revisionFields, response: z.string().trim().min(1, "Write your response.").max(2000), disputes: z.boolean() }).strict();
const listSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1), search: text(150), employeeId: optionalId, kind: z.enum(["", "CONCERN", "POSITIVE"]).default(""),
  category: z.union([z.enum(keys(incidentCategories)), z.literal("")]).default(""), severity: z.union([z.enum(keys(severities)), z.literal("")]).default(""),
  status: z.union([z.enum(keys(incidentStatuses)), z.literal("")]).default(""), state: z.enum(["", "OPEN", "RESOLVED"]).default(""),
  from: z.union([dateSchema, z.literal("")]).default(""), to: z.union([dateSchema, z.literal("")]).default(""), reportedBy: optionalId,
}).strict();
/** Staff guard. An HR manager may not manage, review or read staff-only data about their own records. */
function staff(actor: Actor, employeeId?: string) {
  peopleStaff(actor);
  if (actor.role === "HR_MANAGER" && employeeId && actor.employeeId === employeeId) throw new AppError(403, "SELF_RECORD", "An administrator must manage incident records about you.");
}
const notOwn = (actor: Actor): Prisma.IncidentRecordWhereInput => actor.role === "HR_MANAGER" && actor.employeeId ? { employeeId: { not: actor.employeeId } } : {};
async function load(tx: Database, id: string) { const r = await tx.incidentRecord.findUnique({ where: { id } }); if (!r) throw new AppError(404, "NOT_FOUND", "Incident record not found."); return r; }
function fresh(r: IncidentRecord, revision: number) { if (r.revision !== revision) throw new AppError(409, "STALE", "This record changed since the page loaded. Refresh and try again."); }
function inStatus(r: IncidentRecord, allowed: IncidentStatus[], message: string) { if (!allowed.includes(r.status as IncidentStatus)) throw new AppError(409, "STATUS", message); }
async function settings(tx: Database) { return tx.organizationSettings.findUniqueOrThrow({ where: { id: 1 }, select: { timezone: true } }); }
async function checkLinks(tx: Database, employeeId: string, v: { relatedTaskId: string | null; relatedSessionId: string | null; relatedActivityId: string | null; relatedWarningId: string | null; relatedReviewId: string | null }) {
  const fail = (what: string) => { throw new AppError(400, "LINK", `Choose ${what} that belongs to this employee.`); };
  if (v.relatedTaskId && !await tx.taskAssignment.count({ where: { id: v.relatedTaskId, employeeId } })) fail("a task");
  if (v.relatedSessionId && !await tx.attendanceSession.count({ where: { id: v.relatedSessionId, employeeId } })) fail("an attendance session");
  if (v.relatedActivityId && !await tx.employeeActivity.count({ where: { id: v.relatedActivityId, employeeId, sourceType: null, deletedAt: null } })) fail("a work record");
  if (v.relatedWarningId && !await tx.disciplinaryRecord.count({ where: { id: v.relatedWarningId, employeeId } })) fail("a warning");
  if (v.relatedReviewId && !await tx.performanceReview.count({ where: { id: v.relatedReviewId, employeeId } })) fail("a performance review");
}
async function detailData(tx: Database, v: z.infer<typeof details>) {
  const { occurredTime, occurredOn, ...rest } = v, zone = (await settings(tx)).timezone;
  return { ...rest, kind: isPositive(v.category) ? "POSITIVE" : "CONCERN", occurredOn: dateValue(occurredOn), occurredAt: occurredTime ? localInstant(occurredOn, Number(occurredTime.slice(0, 2)) * 60 + Number(occurredTime.slice(3)), zone) : null };
}
const snapshot = (r: IncidentRecord) => JSON.parse(JSON.stringify({ status: r.status, category: r.category, title: r.title, description: r.description, impact: r.impact, severity: r.severity, occurredOn: dateKey(r.occurredOn), occurredAt: r.occurredAt, employeeVisible: r.employeeVisible, responseRequested: r.responseRequested, reviewNote: r.reviewNote, correctiveAction: r.correctiveAction, correctiveNote: r.correctiveNote, followUpOn: r.followUpOn ? dateKey(r.followUpOn) : null, resolution: r.resolution, evidenceDocumentId: r.evidenceDocumentId, correctiveCompleted: !!r.correctiveCompletedAt, acknowledged: !!r.acknowledgedAt, responded: !!r.respondedAt, employeeDisputes: r.employeeDisputes, revision: r.revision })) as Prisma.InputJsonObject;
/** Applies one audited change; the history trigger enforces revision, retention and amendment rules. */
async function change(tx: Database, actor: Actor, r: IncidentRecord, data: Prisma.IncidentRecordUpdateInput, action: string, reason?: string) {
  const next = await tx.incidentRecord.update({ where: { id: r.id }, data: { ...data, revision: { increment: 1 } } });
  await audit({ actorUserId: actor.userId, employeeId: r.employeeId, action, entity: "incident_records", entityId: r.id, ...(reason ? { reason } : {}), before: snapshot(r), after: snapshot(next) }, tx);
  return next;
}
const event = (tx: Database, actor: Actor, r: IncidentRecord, type: string, title: string, visible: boolean) => peopleEvent(tx, { employeeId: r.employeeId, actorUserId: actor.userId, type, title, sourceType: "incident_records", sourceId: r.id, employeeVisible: visible });
async function mutate<T>(identity: Identity | null, operation: (actor: Actor, tx: Database) => Promise<T>) {
  await requireModule("incidents"); await securityBoundary(identity, async actor => peopleStaff(actor));
  return authorizedMutation(identity, async (actor, tx) => { peopleStaff(actor); return operation(actor, tx); });
}
export async function createIncident(identity: Identity | null, input: unknown) {
  const v = validated(createSchema, input);
  return mutate(identity, async (actor, tx) => {
    staff(actor, v.employeeId);
    if (!await tx.employee.findUnique({ where: { id: v.employeeId }, select: { id: true } })) throw new AppError(404, "NOT_FOUND", "Employee not found.");
    await checkLinks(tx, v.employeeId, v.data);
    // References are sequential; the global mutation lock serializes allocation.
    const number = ((await tx.incidentRecord.aggregate({ _max: { number: true } }))._max.number ?? 0) + 1;
    const row = await tx.incidentRecord.create({ data: { ...(await detailData(tx, v.data)), employeeId: v.employeeId, number, reportedBy: actor.userId } });
    await audit({ actorUserId: actor.userId, employeeId: row.employeeId, action: "INCIDENT_CREATED", entity: "incident_records", entityId: row.id, after: { reference: reference(number), ...snapshot(row) } }, tx);
    await event(tx, actor, row, "INCIDENT_CREATED", `${row.kind === "POSITIVE" ? "Positive record" : "Incident record"} ${reference(number)} created`, false);
    return row.id;
  });
}
export async function editIncident(identity: Identity | null, input: unknown) {
  const v = validated(editSchema, input);
  return mutate(identity, async (actor, tx) => {
    const r = await load(tx, v.id); staff(actor, r.employeeId); fresh(r, v.revision);
    inStatus(r, ["DRAFT", "UNDER_REVIEW"], "Reopen the record before amending its details.");
    if (isPositive(v.data.category) !== (r.kind === "POSITIVE")) throw new AppError(400, "KIND", "A record cannot switch between a concern and a positive record. Create a new record instead.");
    await checkLinks(tx, r.employeeId, v.data);
    await change(tx, actor, r, await detailData(tx, v.data), "INCIDENT_EDITED", v.reason || undefined);
  });
}
export async function submitIncident(identity: Identity | null, input: unknown) {
  const v = validated(z.object(revisionFields).strict(), input);
  return mutate(identity, async (actor, tx) => {
    const r = await load(tx, v.id); staff(actor, r.employeeId); fresh(r, v.revision); inStatus(r, ["DRAFT"], "Only a draft can be submitted for review.");
    await change(tx, actor, r, { status: "UNDER_REVIEW" }, "INCIDENT_SUBMITTED");
  });
}
/** Review decision. A record awaiting review is never treated as a confirmed fault. */
export async function decideIncident(identity: Identity | null, input: unknown) {
  const v = validated(decisionSchema, input);
  return mutate(identity, async (actor, tx) => {
    const r = await load(tx, v.id); staff(actor, r.employeeId); fresh(r, v.revision); inStatus(r, ["DRAFT", "UNDER_REVIEW"], "This record already has a decision. Reopen it to review again.");
    if (r.kind === "POSITIVE" && v.decision === "DISPUTED") throw new AppError(400, "DECISION", "Confirm a positive record or mark it unsubstantiated.");
    const next = await change(tx, actor, r, { status: v.decision, reviewNote: v.note, reviewedBy: actor.userId, reviewedAt: await databaseNow(tx) }, "INCIDENT_REVIEWED", v.note);
    if (next.employeeVisible) await event(tx, actor, next, "INCIDENT_REVIEWED", `${reference(r.number)} review: ${incidentStatuses[v.decision].toLowerCase()}`, true);
  });
}
export async function recordCorrectiveAction(identity: Identity | null, input: unknown) {
  const v = validated(correctiveSchema, input);
  return mutate(identity, async (actor, tx) => {
    const r = await load(tx, v.id); staff(actor, r.employeeId); fresh(r, v.revision);
    if (r.kind === "POSITIVE") throw new AppError(400, "KIND", "Positive records have no corrective action.");
    inStatus(r, ["UNDER_REVIEW", "CONFIRMED", "DISPUTED"], "Corrective actions apply to records under review, confirmed or disputed.");
    if (r.correctiveCompletedAt) throw new AppError(409, "COMPLETED", "The corrective action is already completed. Reopen the record to record another.");
    if (v.followUpOn && v.followUpOn < dateKey(r.occurredOn)) throw new AppError(400, "FOLLOW_UP", "The follow-up date cannot be before the incident date.");
    await checkLinks(tx, r.employeeId, { relatedTaskId: null, relatedSessionId: null, relatedActivityId: null, relatedWarningId: v.relatedWarningId, relatedReviewId: null });
    // Recorded only: no fine, deduction, commission change or suspension is ever triggered from here.
    await change(tx, actor, r, { correctiveAction: v.action, correctiveNote: v.note || null, followUpOn: v.followUpOn ? dateValue(v.followUpOn) : null, ...(v.relatedWarningId ? { relatedWarningId: v.relatedWarningId } : {}) }, "CORRECTIVE_ACTION_RECORDED");
  });
}
export async function completeFollowUp(identity: Identity | null, input: unknown) {
  const v = validated(completionSchema, input);
  return mutate(identity, async (actor, tx) => {
    const r = await load(tx, v.id); staff(actor, r.employeeId); fresh(r, v.revision);
    if (!r.correctiveAction) throw new AppError(409, "NO_ACTION", "Record a corrective action first.");
    if (r.correctiveCompletedAt) throw new AppError(409, "COMPLETED", "The corrective action is already completed.");
    await change(tx, actor, r, { correctiveCompletedAt: await databaseNow(tx), correctiveCompletedBy: actor.userId, completionNote: v.note || null }, "FOLLOW_UP_COMPLETED");
  });
}
export async function resolveIncident(identity: Identity | null, input: unknown) {
  const v = validated(resolveSchema, input);
  return mutate(identity, async (actor, tx) => {
    const r = await load(tx, v.id); staff(actor, r.employeeId); fresh(r, v.revision);
    inStatus(r, v.outcome === "RESOLVED" ? ["CONFIRMED", "DISPUTED", "UNSUBSTANTIATED"] : ["DRAFT", "UNDER_REVIEW", "CONFIRMED", "DISPUTED", "UNSUBSTANTIATED"], v.outcome === "RESOLVED" ? "Record a review decision before resolving." : "This record is already resolved or closed.");
    const next = await change(tx, actor, r, { status: v.outcome, resolution: v.note, resolvedAt: await databaseNow(tx), resolvedBy: actor.userId }, v.outcome === "RESOLVED" ? "INCIDENT_RESOLVED" : "INCIDENT_CLOSED", v.note);
    if (next.employeeVisible) await event(tx, actor, next, `INCIDENT_${v.outcome}`, `${reference(r.number)} ${v.outcome.toLowerCase()}`, true);
  });
}
/** Reopening keeps the previous decision and resolution in the audit history. */
export async function reopenIncident(identity: Identity | null, input: unknown) {
  const v = validated(noteSchema, input);
  return mutate(identity, async (actor, tx) => {
    const r = await load(tx, v.id); staff(actor, r.employeeId); fresh(r, v.revision);
    inStatus(r, ["CONFIRMED", "DISPUTED", "UNSUBSTANTIATED", "RESOLVED", "CLOSED"], "Only a decided, resolved or closed record can be reopened.");
    const next = await change(tx, actor, r, { status: "UNDER_REVIEW", reviewNote: null, reviewedBy: null, reviewedAt: null, resolution: null, resolvedAt: null, resolvedBy: null }, "INCIDENT_REOPENED", v.note);
    await event(tx, actor, next, "INCIDENT_REOPENED", `${reference(r.number)} reopened for review`, next.employeeVisible);
  });
}
export async function setIncidentVisibility(identity: Identity | null, input: unknown) {
  const v = validated(visibilitySchema, input);
  return mutate(identity, async (actor, tx) => {
    const r = await load(tx, v.id); staff(actor, r.employeeId); fresh(r, v.revision);
    if (v.employeeVisible && r.status === "DRAFT") throw new AppError(409, "DRAFT", "Submit the draft for review before sharing it with the employee.");
    const responseRequested = v.employeeVisible && v.responseRequested;
    const next = await change(tx, actor, r, { employeeVisible: v.employeeVisible, responseRequested }, "INCIDENT_VISIBILITY_CHANGED");
    if (v.employeeVisible && !r.employeeVisible) {
      await event(tx, actor, next, "INCIDENT_SHARED", r.kind === "POSITIVE" ? `Positive record shared: ${r.title}` : `Incident record ${reference(r.number)} shared with you`, true);
      await notify(tx, r.employeeId, "INCIDENT_SHARED", "incident_records", r.id, `incident-shared:${r.id}:${next.revision}`, r.kind === "POSITIVE" ? "A positive performance record was shared with you." : "An incident record was shared with you. You can acknowledge receipt; this does not mean you agree.");
    }
    if (responseRequested && !r.responseRequested) await notify(tx, r.employeeId, "INCIDENT_RESPONSE_REQUESTED", "incident_records", r.id, `incident-response:${r.id}:${next.revision}`, "Your response to an incident record is invited.");
  });
}
export async function setIncidentEvidence(identity: Identity | null, input: unknown) {
  const v = validated(evidenceSchema, input);
  return mutate(identity, async (actor, tx) => {
    const r = await load(tx, v.id); staff(actor, r.employeeId); fresh(r, v.revision);
    if (v.documentId && (!await tx.employeeDocument.count({ where: { id: v.documentId, employeeId: r.employeeId, deletedAt: null } }) || await tx.employee.count({ where: { id: r.employeeId, photoDocumentId: v.documentId } }))) throw new AppError(400, "EVIDENCE", "Choose a current private document of this employee, excluding profile photos.");
    if (v.documentId === r.evidenceDocumentId) return;
    await change(tx, actor, r, { evidenceDocumentId: v.documentId }, v.documentId ? "INCIDENT_EVIDENCE_ATTACHED" : "INCIDENT_EVIDENCE_REMOVED");
  });
}
/** Employee: confirm receipt. Acknowledgement never implies agreement. */
export async function acknowledgeIncident(identity: Identity | null, input: unknown) {
  const v = validated(z.object(revisionFields).strict(), input); await requireModule("incidents");
  return authorizedMutation(identity, async (actor, tx) => {
    const r = await ownVisible(tx, actor, v.id); fresh(r, v.revision);
    if (r.acknowledgedAt) return;
    await change(tx, actor, r, { acknowledgedAt: await databaseNow(tx), acknowledgedBy: actor.userId }, "INCIDENT_ACKNOWLEDGED");
  });
}
/** Employee: one response per record, kept as submitted alongside the staff decision. */
export async function respondToIncident(identity: Identity | null, input: unknown) {
  const v = validated(responseSchema, input); await requireModule("incidents");
  return authorizedMutation(identity, async (actor, tx) => {
    const r = await ownVisible(tx, actor, v.id); fresh(r, v.revision);
    if (!r.responseRequested) throw new AppError(409, "NO_RESPONSE", "A response has not been invited for this record.");
    if (r.respondedAt) throw new AppError(409, "RESPONDED", "Your response has already been recorded.");
    const next = await change(tx, actor, r, { employeeResponse: v.response, employeeDisputes: v.disputes, respondedAt: await databaseNow(tx), respondedBy: actor.userId }, "INCIDENT_RESPONSE_SUBMITTED");
    await event(tx, actor, next, "INCIDENT_RESPONSE_SUBMITTED", `Response submitted to ${reference(r.number)}${v.disputes ? " (disputed)" : ""}`, true);
    await notify(tx, r.employeeId, "STAFF_INCIDENT_RESPONSE", "incident_records", r.id, `incident-responded:${r.id}`, `An employee responded to ${reference(r.number)}${v.disputes ? " and disputes it" : ""}.`, true);
  });
}
async function ownVisible(tx: Database, actor: Actor, id: string) {
  const r = actor.employeeId ? await tx.incidentRecord.findFirst({ where: { id, employeeId: actor.employeeId, employeeVisible: true } }) : null;
  if (!r) throw new AppError(404, "NOT_FOUND", "Record not found.");
  return r;
}
async function names(ids: (string | null)[]) {
  const users = await db.user.findMany({ where: { id: { in: [...new Set(ids.filter((x): x is string => !!x))] } }, select: { id: true, displayName: true, email: true, employee: { select: { legalName: true } } } });
  return Object.fromEntries(users.map(u => [u.id, u.employee?.legalName ?? u.displayName ?? u.email])) as Record<string, string>;
}
const isOverdue = (r: { followUpOn: Date | null; correctiveCompletedAt: Date | null; status: string }, today: string) => !!r.followUpOn && !r.correctiveCompletedAt && dateKey(r.followUpOn) < today && !["RESOLVED", "CLOSED"].includes(r.status);
/** Staff overview: counts that need attention, repeated records for review, and the filtered list. */
export async function incidentOverview(identity: Identity | null, query: unknown = {}) {
  await requireModule("incidents");
  return securityBoundary(identity, async actor => {
    peopleStaff(actor); const v = validated(listSchema, query);
    if (v.employeeId) staff(actor, v.employeeId);
    const zone = (await settings(db)).timezone, today = localDate(await databaseNow(db), zone), scope = notOwn(actor);
    const search = v.search.trim(), byNumber = search.match(/^(?:INC-?)?0*(\d{1,9})$/i);
    const people = search && !byNumber ? (await db.employee.findMany({ where: { OR: [{ legalName: { contains: search, mode: "insensitive" } }, { employeeNumber: { contains: search, mode: "insensitive" } }] }, select: { id: true } })).map(e => e.id) : null;
    const where: Prisma.IncidentRecordWhereInput = { AND: [scope,
      ...(byNumber ? [{ number: Number(byNumber[1]) }] : people ? [{ employeeId: { in: people } }] : []),
      ...(v.employeeId ? [{ employeeId: v.employeeId }] : []), ...(v.kind ? [{ kind: v.kind }] : []), ...(v.category ? [{ category: v.category }] : []), ...(v.severity ? [{ severity: v.severity }] : []), ...(v.status ? [{ status: v.status }] : []),
      ...(v.state === "OPEN" ? [{ status: { in: openStatuses } }] : v.state === "RESOLVED" ? [{ status: { in: ["RESOLVED", "CLOSED"] } }] : []),
      ...(v.from ? [{ occurredOn: { gte: dateValue(v.from) } }] : []), ...(v.to ? [{ occurredOn: { lte: dateValue(v.to) } }] : []), ...(v.reportedBy ? [{ reportedBy: v.reportedBy }] : [])] };
    if (v.from && v.to && v.to < v.from) throw new AppError(400, "DATE_RANGE", "The end date must be on or after the start date.");
    const [rows, total, open, awaiting, high, overdue, resolved, repeated] = await Promise.all([
      db.incidentRecord.findMany({ where, orderBy: [{ occurredOn: "desc" }, { number: "desc" }], skip: (v.page - 1) * 25, take: 25 }),
      db.incidentRecord.count({ where }),
      db.incidentRecord.count({ where: { ...scope, status: { in: openStatuses } } }),
      db.incidentRecord.count({ where: { ...scope, status: "UNDER_REVIEW" } }),
      db.incidentRecord.count({ where: { ...scope, severity: { in: ["HIGH", "CRITICAL"] }, status: { in: openStatuses } } }),
      db.incidentRecord.count({ where: { ...scope, followUpOn: { lt: dateValue(today) }, correctiveCompletedAt: null, status: { notIn: ["RESOLVED", "CLOSED"] } } }),
      db.incidentRecord.count({ where: { ...scope, resolvedAt: { gte: new Date(Date.parse(`${addDays(today, -30)}T00:00:00Z`)) } } }),
      // Repeated concerns in the last 90 days, for review only — never an automatic label or score.
      db.incidentRecord.groupBy({ by: ["employeeId"], where: { ...scope, kind: "CONCERN", status: { notIn: ["DRAFT", "UNSUBSTANTIATED"] }, occurredOn: { gte: dateValue(addDays(today, -90)) } }, _count: { _all: true }, having: { employeeId: { _count: { gte: 3 } } } }),
    ]);
    const employees = await db.employee.findMany({ where: { id: { in: [...new Set([...rows.map(r => r.employeeId), ...repeated.map(r => r.employeeId)])] } }, select: { id: true, legalName: true, employeeNumber: true } });
    const who = Object.fromEntries(employees.map(e => [e.id, e])), reporters = await names(rows.map(r => r.reportedBy));
    const reporterOptions = await db.user.findMany({ where: { role: { in: ["ADMIN", "HR_MANAGER"] } }, orderBy: { email: "asc" }, select: { id: true, displayName: true, email: true, employee: { select: { legalName: true } } } });
    return {
      today, page: v.page, total, pages: Math.max(1, Math.ceil(total / 25)),
      counts: { open, awaiting, high, overdue, resolved },
      repeated: repeated.map(r => ({ employee: who[r.employeeId], count: r._count._all })).sort((a, b) => b.count - a.count),
      records: rows.map(r => ({ id: r.id, reference: reference(r.number), employee: who[r.employeeId], kind: r.kind, category: r.category, title: r.title, severity: r.severity, status: r.status, occurredOn: dateKey(r.occurredOn), followUpOn: r.followUpOn ? dateKey(r.followUpOn) : null, overdue: isOverdue(r, today), correctiveAction: r.correctiveAction, correctiveDone: !!r.correctiveCompletedAt, employeeVisible: r.employeeVisible, responded: !!r.respondedAt, disputes: r.employeeDisputes, reportedBy: reporters[r.reportedBy] ?? "Staff" })),
      reporters: reporterOptions.map(u => ({ id: u.id, name: u.employee?.legalName ?? u.displayName ?? u.email })),
    };
  });
}
/** Recent records of one employee that an incident may link to. */
async function linkOptions(employeeId: string) {
  const [tasks, sessions, activities, warnings, reviews] = await Promise.all([
    db.taskAssignment.findMany({ where: { employeeId }, orderBy: { assignedDate: "desc" }, take: 50, select: { id: true, title: true, assignedDate: true } }),
    db.attendanceSession.findMany({ where: { employeeId }, orderBy: { checkinAt: "desc" }, take: 50, select: { id: true, workDate: true, checkinAt: true, checkoutAt: true } }),
    db.employeeActivity.findMany({ where: { employeeId, sourceType: null, deletedAt: null }, orderBy: { eventTime: "desc" }, take: 50, select: { id: true, title: true, eventTime: true } }),
    db.disciplinaryRecord.findMany({ where: { employeeId }, orderBy: { issueDate: "desc" }, take: 50, select: { id: true, reason: true, issueDate: true, severity: true } }),
    db.performanceReview.findMany({ where: { employeeId }, orderBy: { startDate: "desc" }, take: 50, select: { id: true, startDate: true, endDate: true } }),
  ]);
  return { tasks, sessions, activities, warnings, reviews };
}
export type LinkOptions = Awaited<ReturnType<typeof linkOptions>>;
export async function incidentFormOptions(identity: Identity | null, employeeInput: unknown) {
  await requireModule("incidents");
  return securityBoundary(identity, async actor => { const employeeId = validated(uuidSchema, employeeInput); staff(actor, employeeId); return linkOptions(employeeId); });
}
/** Staff detail with internal notes, evidence, links, link options and the audited history. */
export async function incidentDetail(identity: Identity | null, idInput: unknown) {
  await requireModule("incidents");
  return securityBoundary(identity, async actor => {
    peopleStaff(actor); const id = validated(uuidSchema, idInput), r = await load(db, id); staff(actor, r.employeeId);
    const zone = (await settings(db)).timezone, today = localDate(await databaseNow(db), zone), e = r.employeeId;
    const [employee, evidence, history, { tasks, sessions, activities, warnings, reviews }, documents] = await Promise.all([
      db.employee.findUniqueOrThrow({ where: { id: e }, select: { id: true, legalName: true, employeeNumber: true } }),
      r.evidenceDocumentId ? db.employeeDocument.findUnique({ where: { id: r.evidenceDocumentId }, select: { id: true, displayName: true, mimeType: true, fileSize: true, deletedAt: true, employeeVisible: true } }) : null,
      db.auditLog.findMany({ where: { entity: "incident_records", entityId: r.id }, orderBy: { eventTime: "asc" }, select: { id: true, action: true, reason: true, eventTime: true, actorUserId: true, before: true, after: true } }),
      linkOptions(e),
      db.employeeDocument.findMany({ where: { employeeId: e, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, displayName: true, type: true } }),
    ]);
    const people = await names([r.reportedBy, r.reviewedBy, r.resolvedBy, r.correctiveCompletedBy, r.respondedBy, r.acknowledgedBy, ...history.map(h => h.actorUserId)]);
    const label = { task: tasks.find(t => t.id === r.relatedTaskId), session: sessions.find(s => s.id === r.relatedSessionId), activity: activities.find(a => a.id === r.relatedActivityId), warning: warnings.find(w => w.id === r.relatedWarningId), review: reviews.find(p => p.id === r.relatedReviewId) };
    return {
      timezone: zone, today, employee, record: { ...r, reference: reference(r.number), occurredOn: dateKey(r.occurredOn), followUpOn: r.followUpOn ? dateKey(r.followUpOn) : null, overdue: isOverdue(r, today) },
      evidence: evidence && !evidence.deletedAt ? evidence : null, names: people, related: label,
      history: history.map(h => ({ id: h.id, action: h.action, reason: h.reason, at: h.eventTime, by: h.actorUserId ? people[h.actorUserId] ?? "Staff" : "System", before: h.before as Record<string, unknown> | null, after: h.after as Record<string, unknown> | null })),
      options: { tasks, sessions, activities, warnings, reviews, documents },
      canManage: !(actor.role === "HR_MANAGER" && actor.employeeId === e),
    };
  });
}
/** Employee view: own shared records only. Internal notes, reporter identity and staff history are never included. */
export async function ownIncidents(identity: Identity | null, idInput?: unknown) {
  await requireModule("incidents");
  return securityBoundary(identity, async actor => {
    if (!actor.employeeId) return { records: [] };
    const id = idInput === undefined || idInput === "" ? undefined : validated(uuidSchema, idInput);
    const rows = await db.incidentRecord.findMany({ where: { employeeId: actor.employeeId, employeeVisible: true, ...(id ? { id } : {}) }, orderBy: [{ occurredOn: "desc" }, { number: "desc" }], take: 100 });
    if (id && !rows.length) throw new AppError(404, "NOT_FOUND", "Record not found.");
    const documents = await db.employeeDocument.findMany({ where: { id: { in: rows.map(r => r.evidenceDocumentId).filter((x): x is string => !!x) }, employeeId: actor.employeeId, employeeVisible: true, deletedAt: null }, select: { id: true, displayName: true } });
    return { records: rows.map(r => ({
      id: r.id, revision: r.revision, reference: reference(r.number), kind: r.kind, category: r.category, title: r.title, description: r.description, impact: r.impact, severity: r.severity, status: r.status,
      occurredOn: dateKey(r.occurredOn), occurredAt: r.occurredAt, reviewNote: ["CONFIRMED", "DISPUTED", "UNSUBSTANTIATED", "RESOLVED", "CLOSED"].includes(r.status) ? r.reviewNote : null,
      correctiveAction: r.correctiveAction, correctiveNote: r.correctiveNote, followUpOn: r.followUpOn ? dateKey(r.followUpOn) : null, correctiveDone: !!r.correctiveCompletedAt, resolution: r.resolution,
      responseRequested: r.responseRequested, acknowledgedAt: r.acknowledgedAt, employeeResponse: r.employeeResponse, employeeDisputes: r.employeeDisputes, respondedAt: r.respondedAt,
      evidence: documents.find(d => d.id === r.evidenceDocumentId) ?? null,
    })) };
  });
}
/** Incident counts awaiting staff attention for the management dashboard. */
export async function incidentsAwaitingReview(actor: Actor) {
  return db.incidentRecord.count({ where: { ...notOwn(actor), status: "UNDER_REVIEW" } });
}
/** Evidence upload: stores the file through the existing private document storage (staff-only), then links it. */
export async function uploadIncidentEvidence(identity: Identity | null, idInput: unknown, revisionInput: unknown, displayName: unknown, file: File) {
  await requireModule("incidents");
  const id = validated(uuidSchema, idInput), revision = validated(z.coerce.number().int().positive(), revisionInput);
  const employeeId = await securityBoundary(identity, async actor => { peopleStaff(actor); const r = await load(db, id); staff(actor, r.employeeId); fresh(r, revision); return r.employeeId; });
  const { uploadDocument } = await import("@/features/people/documents");
  const documentId = await uploadDocument(identity, { employeeId, type: "INCIDENT_EVIDENCE", displayName: typeof displayName === "string" && displayName.trim() ? displayName : file.name.slice(0, 150), issuedOn: "", expiresOn: "", employmentPeriodId: "", employeeVisible: false, profilePhoto: false }, file);
  await setIncidentEvidence(identity, { id, revision, documentId });
  return documentId;
}
