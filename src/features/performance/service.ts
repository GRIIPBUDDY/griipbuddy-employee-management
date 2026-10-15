import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma, type PerformanceAssessment, type PerformanceTarget } from "@/generated/prisma/client";
import { db } from "@/lib/db/client";
import { audit, type Database } from "@/lib/db/audit";
import { authorizedMutation } from "@/lib/db/mutation";
import { securityBoundary } from "@/lib/authorization/actor";
import { assertRole } from "@/lib/authorization/policy";
import { validated, uuidSchema, dateSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import type { Actor, Identity } from "@/types/auth";
import { databaseNow } from "@/features/time/clock";
import { addDays, dateKey, dateValue, dayStart, localDate } from "@/features/time/dates";
import { localWeek } from "@/features/review/calculation";
import { summary } from "@/features/review/summary";
import { notify } from "@/features/review/notifications";
import { publishedWarning } from "@/features/people-operations/access";
import { enabledModules, requireModule } from "@/features/settings/config";
import { decimal } from "@/features/pay/money";
import { automatedScore, deductionMapping, explainAtOrBelow, finalScores, quarterMonths, quarterOf, quarterSummary, rank, ratio, severityLabels, targetRatio, validManual, warningDeduction, workTimeRatio, type ComponentInput, type WarningSeverity } from "./policy";
/*
 * Weekly/monthly targets and monthly performance assessments. Staff (Admin, HR/Manager) manage both; an HR manager
 * never manages their own targets or rating. A finalized assessment stores every input it used (breakdown) and does
 * not change when attendance, tasks, targets or warnings change later; correcting it needs an audited reopening.
 */
const optionalId = z.union([uuidSchema, z.literal(""), z.null()]).optional().transform(v => v || null);
const monthKey = z.string().regex(/^\d{4}-\d{2}$/, "Choose a month.").transform(v => `${v}-01`);
const amount = z.coerce.number().finite().max(999999999999);
const revision = z.coerce.number().int().positive();
const targetFields = { title: z.string().trim().min(1, "Give the target a title.").max(150), description: z.string().trim().max(2000).default(""), targetValue: amount.gt(0, "The target must be greater than zero."), unit: z.string().trim().min(1, "Enter the unit, for example orders.").max(40), notes: z.string().trim().max(1000).default("") };
const createTargetSchema = z.object({ employeeIds: z.array(uuidSchema).min(1, "Choose at least one employee.").max(200), periodType: z.enum(["WEEKLY", "MONTHLY"]), periodDate: dateSchema, ...targetFields }).strict();
const editTargetSchema = z.object({ id: uuidSchema, revision, ...targetFields }).strict();
const resultSchema = z.object({ id: uuidSchema, revision, actualValue: amount.min(0, "The result cannot be negative."), note: z.string().trim().max(1000).default("") }).strict();
const cancelSchema = z.object({ id: uuidSchema, revision, reason: z.string().trim().min(1, "Explain why the target is cancelled.").max(1000) }).strict();
const targetListSchema = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), employeeId: optionalId, periodType: z.enum(["", "WEEKLY", "MONTHLY"]).default(""), state: z.enum(["", "AWAITING", "RECORDED", "CANCELLED"]).default(""), month: z.union([monthKey, z.literal("")]).default("") }).strict();
const manualSchema = z.object({ employeeId: uuidSchema, month: monthKey, manualScore: z.coerce.number(), comment: z.string().trim().max(2000).default(""), privateNote: z.string().trim().max(2000).default(""), revision: z.coerce.number().int().min(0).default(0) }).strict();
const finalizeSchema = z.object({ employeeId: uuidSchema, month: monthKey, revision }).strict();
const reopenSchema = finalizeSchema.extend({ reason: z.string().trim().min(1, "Explain why the finalized rating is reopened.").max(1000) }).strict();
const rosterSchema = z.object({ month: z.union([monthKey, z.literal("")]).default(""), search: z.string().trim().max(150).default(""), departmentId: optionalId, page: z.coerce.number().int().min(1).max(10000).default(1) }).strict();
const quarterSchema = z.object({ quarter: z.union([z.string().regex(/^\d{4}-Q[1-4]$/), z.literal("")]).default(""), departmentId: optionalId }).strict();
const deductionSchema = z.object({ NOTICE: amount.min(0).max(5), WARNING: amount.min(0).max(5), SERIOUS_WARNING: amount.min(0).max(5), FINAL_WARNING: amount.min(0).max(5) }).strict();
const nextMonth = (month: string) => addDays(month, 31).slice(0, 7) + "-01";
const num = (value: Prisma.Decimal | null) => value === null ? null : Number(value);
function staff(actor: Actor, employeeId?: string) {
  assertRole(actor, ["ADMIN", "HR_MANAGER"]);
  if (actor.role === "HR_MANAGER" && employeeId && actor.employeeId === employeeId) throw new AppError(403, "SELF_RECORD", "An administrator must manage your own targets and rating.");
}
async function mutate<T>(identity: Identity | null, operation: (actor: Actor, tx: Database) => Promise<T>) {
  await requireModule("ratings"); await securityBoundary(identity, async actor => staff(actor));
  return authorizedMutation(identity, async (actor, tx) => { staff(actor); return operation(actor, tx); });
}
async function context(tx: Database) {
  const s = await tx.organizationSettings.findUniqueOrThrow({ where: { id: 1 }, select: { timezone: true, weekStartDay: true, warningDeductions: true } });
  const now = await databaseNow(tx);
  return { zone: s.timezone, weekStartDay: s.weekStartDay, mapping: deductionMapping(s.warningDeductions), now, today: localDate(now, s.timezone) };
}
// ---------- Targets ----------
const targetSnapshot = (t: PerformanceTarget) => ({ title: t.title, periodType: t.periodType, periodStart: dateKey(t.periodStart), periodEnd: dateKey(t.periodEnd), targetValue: t.targetValue.toFixed(2), unit: t.unit, actualValue: t.actualValue?.toFixed(2) ?? null, status: t.status, revision: t.revision });
async function loadTarget(tx: Database, id: string, value: number) {
  const t = await tx.performanceTarget.findUnique({ where: { id } }); if (!t) throw new AppError(404, "NOT_FOUND", "Target not found.");
  if (t.revision !== value) throw new AppError(409, "STALE", "This target changed since the page loaded. Refresh and try again.");
  return t;
}
async function changeTarget(tx: Database, actor: Actor, t: PerformanceTarget, data: Prisma.PerformanceTargetUpdateInput, action: string, reason?: string) {
  const next = await tx.performanceTarget.update({ where: { id: t.id }, data: { ...data, updatedBy: actor.userId, revision: { increment: 1 } } });
  await audit({ actorUserId: actor.userId, employeeId: t.employeeId, action, entity: "performance_targets", entityId: t.id, ...(reason ? { reason } : {}), before: targetSnapshot(t), after: targetSnapshot(next) }, tx);
}
/** Creates one independent target per employee (bulk assignments share only an assignment group). */
export async function createTargets(identity: Identity | null, input: unknown) {
  const v = validated(createTargetSchema, input);
  return mutate(identity, async (actor, tx) => {
    const c = await context(tx), ids = [...new Set(v.employeeIds)];
    const start = v.periodType === "WEEKLY" ? localWeek(v.periodDate, c.weekStartDay) : `${v.periodDate.slice(0, 7)}-01`, end = v.periodType === "WEEKLY" ? addDays(start, 6) : addDays(nextMonth(start), -1);
    const group = randomUUID(), created: string[] = [];
    for (const employeeId of ids) {
      staff(actor, employeeId);
      if (!await tx.employmentPeriod.count({ where: { employeeId, startDate: { lte: dateValue(end) }, OR: [{ endDate: null }, { endDate: { gt: dateValue(start) } }] } })) throw new AppError(400, "EMPLOYMENT", "Every chosen employee must be employed during the target period.");
      const row = await tx.performanceTarget.create({ data: { employeeId, assignmentGroup: group, title: v.title, description: v.description, periodType: v.periodType, periodStart: dateValue(start), periodEnd: dateValue(end), targetValue: decimal(v.targetValue).toFixed(2), unit: v.unit, notes: v.notes, createdBy: actor.userId, updatedBy: actor.userId } });
      await audit({ actorUserId: actor.userId, employeeId, action: "TARGET_CREATED", entity: "performance_targets", entityId: row.id, after: targetSnapshot(row) }, tx);
      await notify(tx, employeeId, "TARGET_ASSIGNED", "performance_targets", row.id, `target:${row.id}:assigned`, `New ${v.periodType === "WEEKLY" ? "weekly" : "monthly"} target: ${v.title}.`);
      created.push(row.id);
    }
    return created;
  });
}
/** Only a target whose period has not started can be redefined; results are recorded separately. */
export async function editTarget(identity: Identity | null, input: unknown) {
  const v = validated(editTargetSchema, input);
  return mutate(identity, async (actor, tx) => {
    const t = await loadTarget(tx, v.id, v.revision); staff(actor, t.employeeId); const c = await context(tx);
    if (t.status !== "ACTIVE" || dateKey(t.periodStart) <= c.today) throw new AppError(409, "STARTED", "Only a future target can be edited. Record its result or cancel it instead.");
    await changeTarget(tx, actor, t, { title: v.title, description: v.description, targetValue: decimal(v.targetValue).toFixed(2), unit: v.unit, notes: v.notes }, "TARGET_EDITED");
  });
}
/** Records the verified actual result. A correction of an existing result needs an explanation. */
export async function recordTargetResult(identity: Identity | null, input: unknown) {
  const v = validated(resultSchema, input);
  return mutate(identity, async (actor, tx) => {
    const t = await loadTarget(tx, v.id, v.revision); staff(actor, t.employeeId); const c = await context(tx);
    if (t.status !== "ACTIVE") throw new AppError(409, "CANCELLED", "A cancelled target has no result.");
    if (dateKey(t.periodStart) > c.today) throw new AppError(409, "NOT_STARTED", "Record a result once the target period has started.");
    if (t.actualValue !== null && !v.note) throw new AppError(400, "NOTE", "Explain the correction of an existing result.");
    await changeTarget(tx, actor, t, { actualValue: decimal(v.actualValue).toFixed(2), resultNote: v.note || null, resultRecordedBy: actor.userId, resultRecordedAt: c.now }, t.actualValue === null ? "TARGET_RESULT_RECORDED" : "TARGET_RESULT_CORRECTED", v.note || undefined);
  });
}
export async function cancelTarget(identity: Identity | null, input: unknown) {
  const v = validated(cancelSchema, input);
  return mutate(identity, async (actor, tx) => {
    const t = await loadTarget(tx, v.id, v.revision); staff(actor, t.employeeId);
    if (t.status !== "ACTIVE") throw new AppError(409, "CANCELLED", "This target is already cancelled.");
    await changeTarget(tx, actor, t, { status: "CANCELLED" }, "TARGET_CANCELLED", v.reason);
  });
}
const targetView = (t: PerformanceTarget) => ({ id: t.id, employeeId: t.employeeId, title: t.title, description: t.description, periodType: t.periodType, periodStart: dateKey(t.periodStart), periodEnd: dateKey(t.periodEnd), targetValue: Number(t.targetValue), unit: t.unit, actualValue: num(t.actualValue), resultNote: t.resultNote, resultRecordedAt: t.resultRecordedAt, status: t.status, notes: t.notes, revision: t.revision, achievement: t.actualValue === null ? null : Math.min(1, Number(t.actualValue) / Number(t.targetValue)), rawAchievement: t.actualValue === null ? null : Number(t.actualValue) / Number(t.targetValue) });
export async function targetList(identity: Identity | null, query: unknown = {}) {
  await requireModule("ratings");
  return securityBoundary(identity, async actor => {
    staff(actor); const v = validated(targetListSchema, query), c = await context(db);
    const where: Prisma.PerformanceTargetWhereInput = { ...(actor.role === "HR_MANAGER" && actor.employeeId ? { employeeId: { not: actor.employeeId } } : {}), ...(v.employeeId ? { employeeId: v.employeeId } : {}), ...(v.periodType ? { periodType: v.periodType } : {}),
      ...(v.state === "CANCELLED" ? { status: "CANCELLED" } : v.state === "AWAITING" ? { status: "ACTIVE", actualValue: null } : v.state === "RECORDED" ? { status: "ACTIVE", actualValue: { not: null } } : {}),
      ...(v.month ? { periodEnd: { gte: dateValue(v.month), lt: dateValue(nextMonth(v.month)) } } : {}) };
    if (v.employeeId && actor.role === "HR_MANAGER" && v.employeeId === actor.employeeId) where.employeeId = { in: [] };
    const rows = await db.performanceTarget.findMany({ where, orderBy: [{ periodEnd: "desc" }, { title: "asc" }, { id: "asc" }], skip: (v.page - 1) * 25, take: 26 });
    const people = new Map((await db.employee.findMany({ where: { id: { in: rows.map(r => r.employeeId) } }, select: { id: true, legalName: true, employeeNumber: true } })).map(e => [e.id, e]));
    const employees = await db.employee.findMany({ where: { ...(actor.role === "HR_MANAGER" && actor.employeeId ? { id: { not: actor.employeeId } } : {}), employmentPeriods: { some: { OR: [{ endDate: null }, { endDate: { gt: dateValue(c.today) } }] } } }, orderBy: { legalName: "asc" }, take: 300, select: { id: true, legalName: true, employeeNumber: true } });
    return { records: rows.slice(0, 25).map(r => ({ ...targetView(r), employee: people.get(r.employeeId)! })), hasNext: rows.length > 25, page: v.page, employees, today: c.today, weekStartDay: c.weekStartDay };
  });
}
// ---------- Monthly assessment ----------
/** Every input of one employee's month, scored. Read-only: used for previews and frozen into the snapshot. */
export async function assessmentFacts(tx: Database, employeeId: string, month: string, c: Awaited<ReturnType<typeof context>>) {
  const until = nextMonth(month), ended = c.now >= dayStart(until, c.zone), modules = await enabledModules(tx);
  const [work, tasks, targets, warnings] = await Promise.all([
    summary(tx, employeeId, month, until, c.now),
    modules.tasks ? tx.taskAssignment.findMany({ where: { employeeId, dueDate: { gte: dateValue(month), lt: dateValue(until) } }, orderBy: [{ dueDate: "asc" }, { id: "asc" }], select: { id: true, title: true, dueDate: true, status: true, completedAt: true } }) : Promise.resolve([]),
    tx.performanceTarget.findMany({ where: { employeeId, status: "ACTIVE", periodEnd: { gte: dateValue(month), lt: dateValue(until) } }, orderBy: [{ periodEnd: "asc" }, { id: "asc" }] }),
    modules.warnings ? tx.disciplinaryRecord.findMany({ where: { employeeId, ...publishedWarning, issueDate: { gte: dateValue(month), lt: dateValue(until) } }, orderBy: [{ issueDate: "asc" }, { id: "asc" }], select: { id: true, severity: true, issueDate: true } }) : Promise.resolve([]),
  ]);
  // Work time: scheduled payable minutes (after approved leave and holidays) completed, and scheduled days attended.
  const required = work.days.reduce((n, d) => n + d.requiredSeconds, 0), credited = work.days.reduce((n, d) => n + Math.max(0, d.requiredSeconds - d.missingSeconds), 0);
  const eligible = work.days.filter(d => d.requiredSeconds > 0), attended = eligible.filter(d => d.requiredSeconds - d.missingSeconds > 0);
  const pendingReasons = [...(work.pendingCorrections ? ["attendance corrections awaiting review"] : []), ...(work.days.some(d => d.incompleteCount > 0) || work.openCount ? ["missing checkouts"] : []), ...(work.pendingMissingReviews ? ["missing-time reports awaiting review"] : []), ...work.issues];
  const minutesRatio = ratio(credited, required), daysRatio = ratio(attended.length, eligible.length);
  const workComponent: ComponentInput = !ended ? { key: "workTime", status: "INCOMPLETE", ratio: null, reason: "The month has not ended." } : pendingReasons.length ? { key: "workTime", status: "INCOMPLETE", ratio: null, reason: `Resolve ${pendingReasons.join(", ")}.` }
    : required === 0 ? { key: "workTime", status: "NOT_APPLICABLE", ratio: null, reason: "No scheduled work this month." } : { key: "workTime", status: "COMPLETE", ratio: workTimeRatio(minutesRatio, daysRatio) };
  // Tasks due this month, completed by their due date (organization-local).
  const taskItems = tasks.map(t => { const completedOn = t.completedAt ? localDate(t.completedAt, c.zone) : null, due = dateKey(t.dueDate!); return { id: t.id, title: t.title, dueDate: due, completedOn, outcome: t.status !== "COMPLETED" ? "NOT_COMPLETED" : completedOn! <= due ? "ON_TIME" : "LATE" }; });
  const onTime = taskItems.filter(t => t.outcome === "ON_TIME").length;
  const taskComponent: ComponentInput = !taskItems.length ? { key: "tasks", status: "NOT_APPLICABLE", ratio: null, reason: "No tasks were due this month." } : !ended ? { key: "tasks", status: "INCOMPLETE", ratio: null, reason: "The month has not ended." } : { key: "tasks", status: "COMPLETE", ratio: onTime / taskItems.length };
  // Targets ending this month. Results are recorded by staff; an awaited result keeps the month incomplete.
  const targetItems = targets.map(targetView), tr = targetRatio(targetItems.map(t => ({ target: t.targetValue, actual: t.actualValue })));
  const targetComponent: ComponentInput = { key: "targets", status: tr.status, ratio: tr.ratio, ...(tr.status === "NOT_APPLICABLE" ? { reason: "No targets ended this month." } : tr.status === "INCOMPLETE" ? { reason: `${tr.awaiting} target result${tr.awaiting === 1 ? "" : "s"} still to be recorded.` } : {}) };
  const warningItems = warnings.map(w => ({ id: w.id, severity: w.severity, label: severityLabels[w.severity as WarningSeverity] ?? w.severity, issueDate: dateKey(w.issueDate), points: c.mapping[w.severity as WarningSeverity] ?? 0 }));
  const score = automatedScore([workComponent, taskComponent, targetComponent]), deduction = warningDeduction(warningItems, c.mapping);
  return { month, ended, score, deduction, mapping: c.mapping,
    workTime: { requiredSeconds: required, creditedSeconds: credited, missingSeconds: required - credited, confirmedAwaySeconds: work.confirmedMissingSeconds, eligibleDays: eligible.length, attendedDays: attended.length, minutesRatio, daysRatio },
    tasks: { total: taskItems.length, onTime, late: taskItems.filter(t => t.outcome === "LATE").length, notCompleted: taskItems.filter(t => t.outcome === "NOT_COMPLETED").length, items: taskItems },
    targets: { items: targetItems.map(t => ({ id: t.id, title: t.title, periodType: t.periodType, periodStart: t.periodStart, periodEnd: t.periodEnd, unit: t.unit, target: t.targetValue, actual: t.actualValue, achievement: t.achievement })) },
    warnings: warningItems };
}
type Facts = Awaited<ReturnType<typeof assessmentFacts>>;
/** What a reviewer sees: stored snapshot when finalized, otherwise a live preview with what blocks finalization. */
function present(row: PerformanceAssessment | null, facts: Facts | null, staffView: boolean) {
  const manual = num(row?.manualScore ?? null);
  if (row?.status === "FINALIZED") {
    const b = row.breakdown as Facts & { manual: number };
    return { status: "FINALIZED" as const, manual, raw: num(row.automatedRaw), deduction: num(row.warningDeduction), automated: num(row.automatedFinal), total: num(row.totalScore), breakdown: b, blockers: [] as string[], comment: row.manualComment, ...(staffView ? { privateNote: row.privateNote } : {}), finalizedAt: row.finalizedAt, revision: row.revision, reopenReason: row.reopenReason };
  }
  const blockers = [...(!facts?.ended ? ["The month has not ended."] : []), ...(manual === null ? ["Enter the manual assessment."] : []), ...(facts?.score.components.filter(c => c.status === "INCOMPLETE").map(c => `${c.label}: ${c.reason}`) ?? []), ...(facts?.score.status === "NO_DATA" ? ["No measurable work, task or target data this month."] : [])];
  const scores = facts?.score.raw !== null && facts?.score.raw !== undefined && manual !== null ? finalScores(manual, facts.score.raw, facts.deduction) : null;
  return { status: row ? "DRAFT" as const : "NOT_STARTED" as const, manual, raw: facts?.score.raw ?? null, deduction: facts?.deduction ?? null, automated: facts && facts.score.raw !== null ? finalScores(0, facts.score.raw, facts.deduction).automated : null, total: scores?.total ?? null, breakdown: facts, blockers: [...new Set(blockers)], comment: row?.manualComment ?? "", ...(staffView ? { privateNote: row?.privateNote ?? "" } : {}), finalizedAt: null, revision: row?.revision ?? 0, reopenReason: row?.reopenReason ?? null };
}
const assessmentAudit = (r: PerformanceAssessment) => ({ status: r.status, manualScore: r.manualScore?.toFixed(1) ?? null, comment: r.manualComment, automatedRaw: r.automatedRaw?.toFixed(2) ?? null, warningDeduction: r.warningDeduction?.toFixed(2) ?? null, automatedFinal: r.automatedFinal?.toFixed(2) ?? null, totalScore: r.totalScore?.toFixed(2) ?? null, revision: r.revision });
function fresh(row: PerformanceAssessment | null, value: number) { if ((row?.revision ?? 0) !== value) throw new AppError(409, "STALE", "This assessment changed since the page loaded. Refresh and try again."); }
/** Records the manual 0-5 assessment (steps of 0.5). Low scores need an explanation the employee can read. */
export async function saveManualAssessment(identity: Identity | null, input: unknown) {
  const v = validated(manualSchema, input);
  return mutate(identity, async (actor, tx) => {
    staff(actor, v.employeeId); const c = await context(tx);
    if (!validManual(v.manualScore)) throw new AppError(400, "SCORE", "Enter a manual score from 0 to 5 in steps of 0.5.");
    if (v.manualScore <= explainAtOrBelow && !v.comment) throw new AppError(400, "COMMENT", `Explain a manual score of ${explainAtOrBelow} or lower in the comment.`);
    if (!await tx.employmentPeriod.count({ where: { employeeId: v.employeeId, startDate: { lt: dateValue(nextMonth(v.month)) }, OR: [{ endDate: null }, { endDate: { gt: dateValue(v.month) } }] } })) throw new AppError(400, "EMPLOYMENT", "The employee was not employed in this month.");
    const row = await tx.performanceAssessment.findUnique({ where: { employeeId_month: { employeeId: v.employeeId, month: dateValue(v.month) } } }); fresh(row, v.revision);
    if (row?.status === "FINALIZED") throw new AppError(409, "FINALIZED", "This month is finalized. An administrator must reopen it first.");
    const data = { manualScore: v.manualScore.toFixed(1), manualComment: v.comment, privateNote: v.privateNote, manualBy: actor.userId, manualAt: c.now };
    const next = row ? await tx.performanceAssessment.update({ where: { id: row.id }, data: { ...data, revision: { increment: 1 } } }) : await tx.performanceAssessment.create({ data: { ...data, employeeId: v.employeeId, month: dateValue(v.month) } });
    await audit({ actorUserId: actor.userId, employeeId: v.employeeId, action: row?.manualScore != null ? "RATING_MANUAL_CORRECTED" : "RATING_MANUAL_RECORDED", entity: "performance_assessments", entityId: next.id, ...(row ? { before: assessmentAudit(row) } : {}), after: assessmentAudit(next) }, tx);
    return next.id;
  });
}
/** Freezes the month: all inputs complete, manual score present; the snapshot keeps every number shown. */
export async function finalizeAssessment(identity: Identity | null, input: unknown) {
  const v = validated(finalizeSchema, input);
  return mutate(identity, async (actor, tx) => {
    staff(actor, v.employeeId); const c = await context(tx);
    const row = await tx.performanceAssessment.findUnique({ where: { employeeId_month: { employeeId: v.employeeId, month: dateValue(v.month) } } });
    if (!row) throw new AppError(409, "MANUAL", "Enter the manual assessment first."); fresh(row, v.revision);
    if (row.status === "FINALIZED") throw new AppError(409, "FINALIZED", "This month is already finalized.");
    const facts = await assessmentFacts(tx, v.employeeId, v.month, c), view = present(row, facts, true);
    if (view.blockers.length || facts.score.raw === null) throw new AppError(409, "NOT_READY", `Not ready to finalize: ${view.blockers.join(" ")}`);
    const manual = Number(row.manualScore), scores = finalScores(manual, facts.score.raw, facts.deduction);
    const breakdown = JSON.parse(JSON.stringify({ formulaVersion: "rating-v1", ...facts, manual, raw: facts.score.raw, automated: scores.automated, total: scores.total })) as Prisma.InputJsonObject;
    const next = await tx.performanceAssessment.update({ where: { id: row.id }, data: { status: "FINALIZED", automatedRaw: facts.score.raw.toFixed(2), warningDeduction: facts.deduction.toFixed(2), automatedFinal: scores.automated.toFixed(2), totalScore: scores.total.toFixed(2), breakdown, finalizedBy: actor.userId, finalizedAt: c.now, revision: { increment: 1 } } });
    await audit({ actorUserId: actor.userId, employeeId: v.employeeId, action: "RATING_FINALIZED", entity: "performance_assessments", entityId: row.id, before: assessmentAudit(row), after: { ...assessmentAudit(next), warnings: facts.warnings.map(w => ({ severity: w.severity, points: w.points, issueDate: w.issueDate })) } }, tx);
    await notify(tx, v.employeeId, "RATING_FINALIZED", "performance_assessments", row.id, `rating:${row.id}:${next.revision}`, `Your performance rating for ${v.month.slice(0, 7)} is final.`);
    // The quarter becomes final with its third finalized month (its average is derived, never re-deducted).
    const q = quarterOf(v.month), months = quarterMonths(q.year, q.quarter);
    const quarter = await tx.performanceAssessment.findMany({ where: { employeeId: v.employeeId, status: "FINALIZED", month: { in: months.map(dateValue) } } });
    if (quarter.length === 3) await audit({ actorUserId: actor.userId, employeeId: v.employeeId, action: "QUARTER_RATING_FINALIZED", entity: "performance_assessments", entityId: row.id, after: { quarter: `${q.year}-Q${q.quarter}`, ...quarterSummary(quarter.map(m => ({ manual: Number(m.manualScore), automated: Number(m.automatedFinal), total: Number(m.totalScore) })))! } }, tx);
    return next.id;
  });
}
/** Administrator-only correction path: the frozen values stay in the audit history, the month returns to Draft. */
export async function reopenAssessment(identity: Identity | null, input: unknown) {
  const v = validated(reopenSchema, input);
  return mutate(identity, async (actor, tx) => {
    assertRole(actor, ["ADMIN"]); staff(actor, v.employeeId);
    const row = await tx.performanceAssessment.findUnique({ where: { employeeId_month: { employeeId: v.employeeId, month: dateValue(v.month) } } });
    if (!row || row.status !== "FINALIZED") throw new AppError(409, "STATUS", "Only a finalized assessment can be reopened."); fresh(row, v.revision);
    const next = await tx.performanceAssessment.update({ where: { id: row.id }, data: { status: "DRAFT", finalizedBy: null, finalizedAt: null, automatedRaw: null, warningDeduction: null, automatedFinal: null, totalScore: null, breakdown: Prisma.DbNull, reopenReason: v.reason, revision: { increment: 1 } } });
    await audit({ actorUserId: actor.userId, employeeId: v.employeeId, action: "RATING_REOPENED", entity: "performance_assessments", entityId: row.id, reason: v.reason, before: { ...assessmentAudit(row), breakdown: row.breakdown as Prisma.InputJsonObject }, after: assessmentAudit(next) }, tx);
  });
}
const employedIn = (month: string): Prisma.EmployeeWhereInput => ({ employmentPeriods: { some: { startDate: { lt: dateValue(nextMonth(month)) }, OR: [{ endDate: null }, { endDate: { gt: dateValue(month) } }] } } });
async function departmentsOf(client: Database, ids: string[], month: string) {
  const periods = await client.employmentPeriod.findMany({ where: { employeeId: { in: ids }, startDate: { lt: dateValue(nextMonth(month)) } }, orderBy: { startDate: "desc" }, select: { employeeId: true, departmentLabel: true, departmentId: true } });
  return new Map(ids.map(id => [id, periods.find(p => p.employeeId === id) ?? null]));
}
/** Staff month view: every employee employed in the month with their (preview or final) assessment. */
export async function assessmentRoster(identity: Identity | null, query: unknown = {}) {
  await requireModule("ratings");
  return securityBoundary(identity, async actor => {
    staff(actor); const v = validated(rosterSchema, query);
    return db.$transaction(async tx => {
      const c = await context(tx), month = v.month || `${addDays(`${c.today.slice(0, 7)}-01`, -1).slice(0, 7)}-01`;
      const where: Prisma.EmployeeWhereInput = { ...employedIn(month), ...(actor.role === "HR_MANAGER" && actor.employeeId ? { id: { not: actor.employeeId } } : {}),
        ...(v.search ? { OR: [{ legalName: { contains: v.search, mode: "insensitive" } }, { employeeNumber: { contains: v.search, mode: "insensitive" } }] } : {}),
        ...(v.departmentId ? { employmentPeriods: { some: { departmentId: v.departmentId, startDate: { lt: dateValue(nextMonth(month)) }, OR: [{ endDate: null }, { endDate: { gt: dateValue(month) } }] } } } : {}) };
      const employees = await tx.employee.findMany({ where, orderBy: [{ legalName: "asc" }, { id: "asc" }], skip: (v.page - 1) * 25, take: 26, select: { id: true, legalName: true, employeeNumber: true } });
      const page = employees.slice(0, 25), rows = await tx.performanceAssessment.findMany({ where: { month: dateValue(month), employeeId: { in: page.map(e => e.id) } } }), departments = await departmentsOf(tx, page.map(e => e.id), month);
      const records = [];
      for (const e of page) { const row = rows.find(r => r.employeeId === e.id) ?? null; records.push({ employee: e, department: departments.get(e.id)?.departmentLabel ?? "—", ...present(row, row?.status === "FINALIZED" ? null : await assessmentFacts(tx, e.id, month, c), true) }); }
      return { month, records, page: v.page, hasNext: employees.length > 25, today: c.today, isAdmin: actor.role === "ADMIN", departments: await tx.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) };
    }, { isolationLevel: "RepeatableRead", timeout: 30000 });
  });
}
export async function assessmentDetail(identity: Identity | null, employeeIdInput: unknown, monthInput: unknown) {
  await requireModule("ratings");
  return securityBoundary(identity, async actor => {
    const employeeId = validated(uuidSchema, employeeIdInput), month = validated(monthKey, monthInput); staff(actor, employeeId);
    return db.$transaction(async tx => {
      const employee = await tx.employee.findUnique({ where: { id: employeeId }, select: { id: true, legalName: true, employeeNumber: true } });
      if (!employee) throw new AppError(404, "NOT_FOUND", "Employee not found.");
      const c = await context(tx), row = await tx.performanceAssessment.findUnique({ where: { employeeId_month: { employeeId, month: dateValue(month) } } });
      return { employee, month, isAdmin: actor.role === "ADMIN", timezone: c.zone, ...present(row, row?.status === "FINALIZED" ? null : await assessmentFacts(tx, employeeId, month, c), true) };
    }, { isolationLevel: "RepeatableRead", timeout: 15000 });
  });
}
/** Monthly and quarterly ranking from finalized snapshots only; ties share a rank (1, 1, 3). */
export async function ratingRanking(identity: Identity | null, query: unknown = {}) {
  await requireModule("ratings");
  return securityBoundary(identity, async actor => {
    staff(actor); const v = validated(quarterSchema, query), c = await context(db);
    const current = quarterOf(c.today.slice(0, 7) + "-01"), [year, q] = v.quarter ? [Number(v.quarter.slice(0, 4)), Number(v.quarter.slice(6))] : [current.year, current.quarter];
    const months = quarterMonths(year, q), rows = await db.performanceAssessment.findMany({ where: { status: "FINALIZED", month: { in: months.map(dateValue) } } });
    const ids = [...new Set(rows.map(r => r.employeeId))], people = await db.employee.findMany({ where: { id: { in: ids } }, select: { id: true, legalName: true, employeeNumber: true } }), departments = await departmentsOf(db, ids, months[2]);
    const inDepartment = (id: string) => !v.departmentId || departments.get(id)?.departmentId === v.departmentId;
    const base = (id: string) => { const p = people.find(x => x.id === id)!; return { employeeId: id, name: p.legalName, number: p.employeeNumber, department: departments.get(id)?.departmentLabel ?? "—" }; };
    const quarter = ids.filter(inDepartment).map(id => ({ ...base(id), ...quarterSummary(rows.filter(r => r.employeeId === id).map(r => ({ manual: Number(r.manualScore), automated: Number(r.automatedFinal), total: Number(r.totalScore) })))! }));
    const monthly = months.map(month => ({ month, ranking: rank(rows.filter(r => dateKey(r.month) === month && inDepartment(r.employeeId)).map(r => ({ ...base(r.employeeId), manual: Number(r.manualScore), automated: Number(r.automatedFinal), total: Number(r.totalScore) }))) }));
    return { year, quarter: q, months, official: rank(quarter.filter(r => r.status === "FINAL")), provisional: quarter.filter(r => r.status === "PROVISIONAL").sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)), monthly,
      departments: await db.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }), current: `${current.year}-Q${current.quarter}` };
  });
}
/** The employee's own finalized ratings (no private notes), quarter averages, targets and this month's tasks. */
export async function ownRatings(identity: Identity | null) {
  await requireModule("ratings");
  return securityBoundary(identity, async actor => {
    if (!actor.employeeId) return null;
    const employeeId = actor.employeeId, c = await context(db), modules = await enabledModules();
    const rows = await db.performanceAssessment.findMany({ where: { employeeId, status: "FINALIZED" }, orderBy: { month: "desc" }, take: 24 });
    const monthly = rows.map(r => ({ month: dateKey(r.month), ...present(r, null, false) }));
    const quarters = [...new Set(rows.map(r => { const q = quarterOf(dateKey(r.month)); return `${q.year}-Q${q.quarter}`; }))].map(key => {
      const [year, quarter] = [Number(key.slice(0, 4)), Number(key.slice(6))], months = quarterMonths(year, quarter);
      return { key, ...quarterSummary(rows.filter(r => months.includes(dateKey(r.month))).map(r => ({ manual: Number(r.manualScore), automated: Number(r.automatedFinal), total: Number(r.totalScore) })))! };
    });
    const targets = await db.performanceTarget.findMany({ where: { employeeId, periodEnd: { gte: dateValue(addDays(c.today, -366)) } }, orderBy: [{ periodEnd: "desc" }, { title: "asc" }], take: 100 });
    const month = `${c.today.slice(0, 7)}-01`, tasks = modules.tasks ? await db.taskAssignment.findMany({ where: { employeeId, dueDate: { gte: dateValue(month), lt: dateValue(nextMonth(month)) } }, select: { status: true, dueDate: true, completedAt: true } }) : [];
    const onTime = tasks.filter(t => t.status === "COMPLETED" && t.completedAt && localDate(t.completedAt, c.zone) <= dateKey(t.dueDate!)).length;
    return { monthly, quarters, targets: targets.map(targetView), tasks: { month, total: tasks.length, onTime, late: tasks.filter(t => t.status === "COMPLETED").length - onTime, open: tasks.filter(t => t.status !== "COMPLETED").length }, mapping: c.mapping, today: c.today };
  });
}
/** Admin setting: rating points deducted per confirmed warning severity. */
export async function updateWarningDeductions(identity: Identity | null, input: unknown) {
  const v = validated(deductionSchema, input);
  return authorizedMutation(identity, async (actor, tx) => {
    assertRole(actor, ["ADMIN"]);
    const old = await tx.organizationSettings.findUniqueOrThrow({ where: { id: 1 }, select: { warningDeductions: true } }), next = deductionMapping(v);
    await tx.organizationSettings.update({ where: { id: 1 }, data: { warningDeductions: next, changedBy: actor.userId } });
    await audit({ actorUserId: actor.userId, action: "WARNING_DEDUCTIONS_CHANGED", entity: "organization_settings", entityId: "1", before: { deductions: deductionMapping(old.warningDeductions) }, after: { deductions: next } }, tx);
  });
}
export async function warningDeductionSettings(identity: Identity | null) {
  return securityBoundary(identity, async actor => { assertRole(actor, ["ADMIN"]); return deductionMapping((await db.organizationSettings.findUniqueOrThrow({ where: { id: 1 }, select: { warningDeductions: true } })).warningDeductions); });
}
