import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit, type Database } from "@/lib/db/audit";
import { securityBoundary } from "@/lib/authorization/actor";
import { authorizedMutation } from "@/lib/db/mutation";
import { assertRole } from "@/lib/authorization/policy";
import { validated, uuidSchema, optionCode } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import type { Identity } from "@/types/auth";
import { databaseNow } from "@/features/time/clock";
import { addDays, dateKey, dateValue, dayStart, localDate, weekday } from "@/features/time/dates";
import { optionItems } from "@/features/settings/config";
type Rules = { timezone: string; workingDays: unknown; leaveDayBasis: string };
/**
 * Leave days within [from, until): each counted local date is 1 day when fully covered and 0.5 when partly covered.
 * With the working-day basis, non-working weekdays and company holidays are not counted.
 */
export async function leaveDays(tx: Database, startAt: Date, endAt: Date, rules: Rules, from?: string, until?: string) {
  const first = localDate(startAt, rules.timezone), last = localDate(new Date(endAt.getTime() - 1000), rules.timezone);
  const low = from && from > first ? from : first, high = until && addDays(until, -1) < last ? addDays(until, -1) : last;
  if (high < low) return 0;
  const working = new Set(Array.isArray(rules.workingDays) ? rules.workingDays as number[] : [1, 2, 3, 4, 5, 6]);
  const holidays = rules.leaveDayBasis === "WORKING" ? new Set((await tx.calendarDay.findMany({ where: { localDate: { gte: dateValue(low), lte: dateValue(high) } }, select: { localDate: true } })).map(h => dateKey(h.localDate))) : new Set<string>();
  let days = 0;
  for (let date = low; date <= high; date = addDays(date, 1)) {
    if (rules.leaveDayBasis === "WORKING" && (!working.has(weekday(date)) || holidays.has(date))) continue;
    const dayFrom = dayStart(date, rules.timezone).getTime(), dayUntil = dayStart(addDays(date, 1), rules.timezone).getTime();
    const covered = Math.min(endAt.getTime(), dayUntil) - Math.max(startAt.getTime(), dayFrom);
    if (covered <= 0) continue;
    days += covered >= dayUntil - dayFrom ? 1 : 0.5;
  }
  return days;
}
export type LeaveBalance = { category: string; label: string; paid: boolean; entitlement: number | null; override: boolean; used: number; pending: number; remaining: number | null; available: number | null };
/** Yearly balances per leave type. A per-employee allowance overrides the leave type's default. */
export async function leaveBalances(tx: Database, employeeId: string, year: number): Promise<LeaveBalance[]> {
  const settings = await tx.organizationSettings.findUniqueOrThrow({ where: { id: 1 }, select: { timezone: true, workingDays: true, leaveDayBasis: true } });
  const from = `${year}-01-01`, until = `${year + 1}-01-01`;
  const [categories, overrides, requests] = await Promise.all([
    optionItems("LEAVE_CATEGORY", tx),
    tx.leaveAllowance.findMany({ where: { employeeId, year } }),
    tx.leaveRequest.findMany({ where: { employeeId, status: { in: ["APPROVED", "PENDING"] }, startAt: { lt: dayStart(until, settings.timezone) }, endAt: { gt: dayStart(from, settings.timezone) } }, select: { category: true, status: true, startAt: true, endAt: true } }),
  ]);
  const rows: LeaveBalance[] = [];
  for (const c of categories) {
    const override = overrides.find(o => o.category === c.code), base = c.attributes.yearlyDays;
    const entitlement = override ? Number(override.days) : typeof base === "number" ? base : null;
    let used = 0, pending = 0;
    for (const r of requests.filter(r => r.category === c.code)) { const d = await leaveDays(tx, r.startAt, r.endAt, settings, from, until); if (r.status === "APPROVED") used += d; else pending += d; }
    rows.push({ category: c.code, label: c.label, paid: c.attributes.paid !== false, entitlement, override: !!override, used, pending, remaining: entitlement === null ? null : entitlement - used, available: entitlement === null ? null : entitlement - used - pending });
  }
  return rows;
}
/** Days a new request needs per calendar year, checked against the balance rule (block or flag). */
export async function balanceCheck(tx: Database, employeeId: string, category: string, startAt: Date, endAt: Date, alreadyPending = false) {
  const settings = await tx.organizationSettings.findUniqueOrThrow({ where: { id: 1 }, select: { timezone: true, workingDays: true, leaveDayBasis: true, leaveOverBalance: true } });
  const firstYear = Number(localDate(startAt, settings.timezone).slice(0, 4)), lastYear = Number(localDate(new Date(endAt.getTime() - 1000), settings.timezone).slice(0, 4));
  const over: string[] = [];
  for (let year = firstYear; year <= lastYear; year++) {
    const balance = (await leaveBalances(tx, employeeId, year)).find(b => b.category === category);
    if (!balance || balance.available === null) continue;
    const requested = await leaveDays(tx, startAt, endAt, settings, `${year}-01-01`, `${year + 1}-01-01`);
    const available = balance.available + (alreadyPending ? requested : 0);
    if (requested > available) over.push(`${balance.label} ${year}: ${requested} day${requested === 1 ? "" : "s"} requested, ${Math.max(0, available)} available`);
  }
  return { over, rule: settings.leaveOverBalance };
}
const yearSchema = z.coerce.number().int().min(1900).max(2199);
export async function balanceData(identity: Identity | null, input: { employeeId?: unknown; year?: unknown } = {}, staff = false) {
  return securityBoundary(identity, async actor => {
    if (staff) assertRole(actor, ["ADMIN", "HR_MANAGER"]);
    const settings = await db.organizationSettings.findUniqueOrThrow({ where: { id: 1 }, select: { timezone: true, leaveDayBasis: true, leaveOverBalance: true } });
    const year = input.year ? validated(yearSchema, input.year) : Number(localDate(await databaseNow(db), settings.timezone).slice(0, 4));
    const employeeId = staff ? validated(uuidSchema, input.employeeId) : actor.employeeId;
    if (!employeeId) return null;
    if (staff && !await db.employee.findUnique({ where: { id: employeeId }, select: { id: true } })) throw new AppError(404, "NOT_FOUND", "Employee not found.");
    return { year, employeeId, basis: settings.leaveDayBasis, rule: settings.leaveOverBalance, balances: await leaveBalances(db, employeeId, year) };
  });
}
const allowanceSchema = z.object({ employeeId: uuidSchema, year: yearSchema, category: optionCode, days: z.coerce.number().min(0).max(366).multipleOf(0.5, "Use whole or half days."), reason: z.string().trim().min(1).max(500) }).strict();
export async function setLeaveAllowance(identity: Identity | null, input: unknown) {
  await securityBoundary(identity, async actor => assertRole(actor, ["ADMIN", "HR_MANAGER"])); const v = validated(allowanceSchema, input);
  await authorizedMutation(identity, async (actor, tx) => {
    assertRole(actor, ["ADMIN", "HR_MANAGER"]);
    if (actor.role === "HR_MANAGER" && actor.employeeId === v.employeeId) throw new AppError(403, "SELF_REVIEW", "An administrator must set your own leave allowance.");
    if (!await tx.employee.findUnique({ where: { id: v.employeeId }, select: { id: true } })) throw new AppError(404, "NOT_FOUND", "Employee not found.");
    if (!await tx.optionItem.count({ where: { list: "LEAVE_CATEGORY", code: v.category } })) throw new AppError(400, "OPTION_INVALID", "Choose a leave type.");
    const old = await tx.leaveAllowance.findUnique({ where: { employeeId_year_category: { employeeId: v.employeeId, year: v.year, category: v.category } } });
    const row = old ? await tx.leaveAllowance.update({ where: { id: old.id }, data: { days: v.days, reason: v.reason, revision: { increment: 1 } } }) : await tx.leaveAllowance.create({ data: { ...v, createdBy: actor.userId } });
    await audit({ actorUserId: actor.userId, employeeId: v.employeeId, action: "LEAVE_ALLOWANCE_SET", entity: "leave_allowances", entityId: row.id, reason: v.reason, ...(old ? { before: { days: Number(old.days) } } : {}), after: { year: v.year, category: v.category, days: v.days } }, tx);
  });
}
/** Leave types for forms (active) and labels (all, so historical requests stay readable). */
export async function leaveTypes(identity: Identity | null) {
  return securityBoundary(identity, async () => (await optionItems("LEAVE_CATEGORY", db, true)).map(i => ({ code: i.code, label: i.label, isActive: i.isActive, paid: i.attributes.paid !== false, yearlyDays: typeof i.attributes.yearlyDays === "number" ? i.attributes.yearlyDays : null })));
}
