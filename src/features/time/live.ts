import "server-only";
import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db/client";
import type { Database } from "@/lib/db/audit";
import { securityBoundary } from "@/lib/authorization/actor";
import { assertRole } from "@/lib/authorization/policy";
import { validated, uuidSchema } from "@/lib/validation/schemas";
import type { Identity } from "@/types/auth";
import { databaseNow } from "./clock";
import type { LiveStatus } from "./live-status";
import { addDays, dateKey, dayStart, localDate, minuteLabel, weekday } from "./dates";
/**
 * Live workforce: who is working right now. The source of truth is the attendance session itself — a check-in with no
 * checkout that has not been voided — regardless of the calendar date it started on. Nothing here closes a session,
 * invents a checkout or classifies time as overtime; it only reports and flags sessions for review.
 */
export { liveStatuses, type LiveStatus } from "./live-status";
export const liveQuerySchema = z.object({
  search: z.string().trim().max(100).default(""), departmentId: z.union([uuidSchema, z.literal("")]).default(""),
  status: z.enum(["", "WITHIN_SCHEDULE", "PAST_END", "UNSCHEDULED", "INCOMPLETE", "ATTENTION"]).default(""),
}).strict();
type OpenRow = { session_id: string; employee_id: string; work_date: Date; checkin_at: Date; scheduled_start_at: Date | null; scheduled_end_at: Date | null; source: string; legal_name: string; employee_number: string; account_status: string; is_active: boolean; department: string | null; department_id: string | null };
type SlotRow = { employee_id: string; start_minute: number; end_minute: number; end_day_offset: number };
type ExpectedRow = { scheduled: bigint; missing: bigint };
/** An unscheduled session still open after this long is shown as incomplete (a likely missed checkout), never closed. */
const UNSCHEDULED_REVIEW_SECONDS = 12 * 3600;
export type LiveWorkforce = Awaited<ReturnType<typeof liveWorkforceData>>;
export type LiveRow = LiveWorkforce["rows"][number];
/** `context` lets a caller that already read the organization timezone and server time (the dashboard) reuse them. */
export async function liveWorkforceData(client: Database, query: z.infer<typeof liveQuerySchema>, context?: { now: Date; timezone: string }) {
  const zone = context?.timezone ?? (await client.organizationSettings.findUniqueOrThrow({ where: { id: 1 }, select: { timezone: true } })).timezone;
  const now = context?.now ?? await databaseNow(client), today = localDate(now, zone), todayStart = dayStart(today, zone), tomorrowStart = dayStart(addDays(today, 1), zone);
  const clock = Temporal.Instant.from(now.toISOString()).toZonedDateTimeISO(zone), localMinute = clock.hour * 60 + clock.minute;
  const scheduledToday = Prisma.sql`work_schedules w JOIN schedule_slots sl ON sl.work_schedule_id=w.id JOIN employment_periods p ON p.id=w.employment_period_id AND p.employee_id=w.employee_id
    WHERE w.superseded_at IS NULL AND w.effective_from<=${today}::date AND (w.effective_until IS NULL OR w.effective_until>${today}::date) AND sl.weekday=${weekday(today)}
      AND p.start_date<=${today}::date AND (p.end_date IS NULL OR p.end_date>${today}::date)
      AND (w.holiday_work_required OR NOT EXISTS (SELECT 1 FROM calendar_days c WHERE c.local_date=${today}::date))`;
  // Three statements regardless of headcount: open sessions, today's assigned periods, and today's expected arrivals.
  const [open, slots, expected] = await Promise.all([
    client.$queryRaw<OpenRow[]>(Prisma.sql`SELECT s.id AS session_id,s.employee_id,s.work_date,s.checkin_at,s.scheduled_start_at,s.scheduled_end_at,s.source,e.legal_name,e.employee_number,u.account_status,u.is_active,
        COALESCE(d.name,NULLIF(p.department_label,'')) AS department,p.department_id
      FROM attendance_sessions s JOIN employees e ON e.id=s.employee_id JOIN users u ON u.id=e.user_id JOIN employment_periods p ON p.id=s.employment_period_id LEFT JOIN departments d ON d.id=p.department_id
      WHERE s.checkout_at IS NULL AND s.voided_at IS NULL ORDER BY s.checkin_at,s.id`),
    client.$queryRaw<SlotRow[]>(Prisma.sql`SELECT w.employee_id,sl.start_minute,sl.end_minute,sl.end_day_offset FROM ${scheduledToday} ORDER BY sl.start_minute`),
    // Active accounts scheduled today; "not yet checked in" = first period already started, no session today, not working
    // now and not on approved leave today.
    client.$queryRaw<ExpectedRow[]>(Prisma.sql`WITH due AS (SELECT w.employee_id,min(sl.start_minute) AS first_start FROM ${scheduledToday}
        AND EXISTS (SELECT 1 FROM employees e JOIN users u ON u.id=e.user_id WHERE e.id=w.employee_id AND u.is_active AND u.account_status='ACTIVE') GROUP BY w.employee_id)
      SELECT count(*) AS scheduled,count(*) FILTER (WHERE first_start<=${localMinute}
        AND NOT EXISTS (SELECT 1 FROM attendance_sessions s WHERE s.employee_id=due.employee_id AND s.voided_at IS NULL AND (s.work_date=${today}::date OR s.checkout_at IS NULL OR s.checkin_at>=${todayStart}))
        AND NOT EXISTS (SELECT 1 FROM leave_requests l WHERE l.employee_id=due.employee_id AND l.status='APPROVED' AND l.start_at<${tomorrowStart} AND l.end_at>${todayStart})) AS missing FROM due`),
  ]);
  const periods = new Map<string, string[]>();
  for (const s of slots) periods.set(s.employee_id, [...(periods.get(s.employee_id) ?? []), `${minuteLabel(s.start_minute)}–${minuteLabel(s.end_minute)}${s.end_day_offset ? " (+1 day)" : ""}`]);
  const byEmployee = new Map<string, OpenRow[]>();
  for (const r of open) byEmployee.set(r.employee_id, [...(byEmployee.get(r.employee_id) ?? []), r]);
  const rows = [...byEmployee.values()].map(sessions => {
    // One row per employee: the earliest open session is the one that needs resolving first.
    const r = sessions[0], elapsedSeconds = Math.max(0, Math.floor((now.getTime() - r.checkin_at.getTime()) / 1000));
    let status: LiveStatus;
    if (r.scheduled_end_at) status = r.scheduled_end_at > now ? "WITHIN_SCHEDULE" : r.scheduled_end_at < todayStart ? "INCOMPLETE" : "PAST_END";
    else status = elapsedSeconds >= UNSCHEDULED_REVIEW_SECONDS ? "INCOMPLETE" : "UNSCHEDULED";
    const flags = [...(sessions.length > 1 ? ["More than one open session — data needs review"] : []), ...(!r.is_active || r.account_status !== "ACTIVE" ? [`Account ${r.account_status !== "ACTIVE" ? r.account_status.toLowerCase().replace("_", " ") : "inactive"} — review this open session`] : []), ...(r.checkin_at > now ? ["Check-in time is in the future — data needs review"] : [])];
    return {
      employee: { id: r.employee_id, name: r.legal_name, number: r.employee_number }, department: r.department ?? "—", departmentId: r.department_id,
      sessionId: r.session_id, sessionCount: sessions.length, workDate: dateKey(r.work_date), checkinAt: r.checkin_at.toISOString(), startedToday: r.checkin_at >= todayStart,
      scheduledStart: r.scheduled_start_at?.toISOString() ?? null, scheduledEnd: r.scheduled_end_at?.toISOString() ?? null, todayPeriods: periods.get(r.employee_id) ?? [],
      elapsedSeconds, status, flags, attention: status !== "WITHIN_SCHEDULE" || flags.length > 0,
    };
  });
  const search = query.search.toLowerCase();
  const visible = rows.filter(r => (!search || r.employee.name.toLowerCase().includes(search) || r.employee.number.toLowerCase().includes(search)) && (!query.departmentId || r.departmentId === query.departmentId)
    && (!query.status || (query.status === "ATTENTION" ? r.attention : r.status === query.status)));
  return {
    generatedAt: now.toISOString(), today, timezone: zone,
    summary: { working: rows.length, sessions: open.length, scheduledToday: Number(expected[0]?.scheduled ?? 0), notCheckedIn: Number(expected[0]?.missing ?? 0), attention: rows.filter(r => r.attention).length },
    rows: visible,
  };
}
/** Staff-only live view (Admin and HR/Manager). Employees never reach the company-wide list. */
export async function liveWorkforce(identity: Identity | null, input: unknown = {}) {
  return securityBoundary(identity, async actor => {
    assertRole(actor, ["ADMIN", "HR_MANAGER"]);
    return liveWorkforceData(db, validated(liveQuerySchema, input));
  });
}
