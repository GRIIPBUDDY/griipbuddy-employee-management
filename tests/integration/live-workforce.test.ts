import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { testPostgres } from "../postgres";
import type { Identity } from "@/types/auth";
import type { PrismaClient } from "@/generated/prisma/client";
// Live workforce: who is working right now, from open attendance sessions. Disposable database, synthetic people,
// controlled server clock. "Now" is Wednesday 2030-06-05 11:00 Asia/Dhaka (05:00 UTC).
let database: Awaited<ReturnType<typeof testPostgres>>, db: PrismaClient, admin: Identity, hr: Identity;
const people: Record<string, { id: string; who: Identity }> = {};
let now = new Date("2030-06-05T05:00:00Z");
const auth = vi.hoisted(() => ({ identity: null as Identity | null }));
vi.mock("@/lib/auth/request", () => ({ assertMutationOrigin: async () => {}, getIdentity: async () => auth.identity }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const identity = (userId: string): Identity => { const issuedAt = Date.now(); return { userId, sessionVersion: 1, issuedAt, absoluteExpiresAt: issuedAt + 43200000 }; };
const at = (value: string) => { now = new Date(value); };
const live = async (who: Identity = admin, query: Record<string, string> = {}) => (await import("@/features/time/live")).liveWorkforce(who, query);
const names = (data: Awaited<ReturnType<typeof live>>) => data.rows.map(r => r.employee.name).sort();
async function route(who: Identity | null, search = "") {
  auth.identity = who;
  try { const response = await (await import("@/app/api/manage/live-workforce/route")).GET(new Request(`http://localhost/api/manage/live-workforce${search}`)); return { status: response.status, cache: response.headers.get("cache-control"), body: await response.json() }; }
  finally { auth.identity = null; }
}
/** Statements sent to PostgreSQL while `work` runs (every pg client, including BEGIN/COMMIT). */
async function statements(work: () => Promise<unknown>) {
  const spy = vi.spyOn(pg.Client.prototype, "query");
  try { await work(); return spy.mock.calls.map(([q]) => typeof q === "string" ? q : (q as { text?: string })?.text ?? ""); } finally { spy.mockRestore(); }
}
beforeAll(async () => {
  database = await testPostgres(); process.env.DATABASE_URL = database.runtimeUrl; db = (await import("@/lib/db/client")).db;
  vi.spyOn(await import("@/features/time/clock"), "databaseNow").mockImplementation(async () => new Date(now));
  const make = (email: string, role: "ADMIN" | "HR_MANAGER" | "EMPLOYEE") => db.user.create({ data: { email, role, displayName: email.split("@")[0], passwordHash: "synthetic", mustChangePassword: false } });
  const a = await make("live-admin@example.test", "ADMIN"); admin = identity(a.id); hr = identity((await make("live-hr@example.test", "HR_MANAGER")).id);
  await db.organizationSettings.create({ data: { companyName: "Live regression", timezone: "Asia/Dhaka", changedBy: a.id, overtimePolicyVersions: [{ effectiveFrom: "2020-01-06", thresholdSeconds: 172800, ruleVersion: 1 }] } });
  const ops = await db.department.create({ data: { name: "Operations", normalizedName: "operations", createdBy: a.id } });
  const support = await db.department.create({ data: { name: "Support", normalizedName: "support", createdBy: a.id } });
  for (const key of ["done", "night", "morning", "absent", "scheduled", "late", "held", "suspended", ...[1, 2, 3, 4, 5].map(n => `extra${n}`)]) {
    const user = await make(`${key}@live.example.test`, "EMPLOYEE"), department = key === "morning" ? support : ops;
    const e = await db.employee.create({ data: { userId: user.id, legalName: `Live ${key}`, employeeNumber: `LV-${key.toUpperCase()}`, createdBy: a.id, employmentPeriods: { create: { startDate: new Date("2020-01-01"), departmentId: department.id, departmentLabel: department.name, positionLabel: "Associate", createdBy: a.id } } } });
    people[key] = { id: e.id, who: identity(user.id) };
  }
  const attendance = await import("@/features/time/attendance"), schedules = await import("@/features/time/schedules");
  // "absent", "scheduled" and "suspended": Wednesday 09:00–13:00 schedule (published before the week).
  at("2030-06-01T00:00:00Z");
  for (const key of ["absent", "scheduled", "suspended"]) {
    const period = (await db.employmentPeriod.findFirstOrThrow({ where: { employeeId: people[key].id } })).id;
    await schedules.publishSchedule(admin, { employeeId: people[key].id, employmentPeriodId: period, effectiveFrom: "2030-06-02", effectiveUntil: "", label: "Day", reason: "Weekly Work Hour", duration: "INDEFINITE", slots: [{ weekday: 3, startMinute: 540, endMinute: 780, endDayOffset: 0 }] });
  }
  await (await import("@/features/accounts/controls")).changeEmployeeStatus(admin, { employeeId: people.suspended.id, status: "SUSPENDED", reason: "Synthetic suspended account" });
  // "night": unscheduled session from Tuesday 22:00 local, still open.
  at("2030-06-04T16:00:00Z"); await attendance.checkInUnscheduled(people.night.who, { operationKey: randomUUID() });
  // "done": worked 08:00–10:00 local today and checked out.
  at("2030-06-05T02:00:00Z"); const done = await attendance.checkInUnscheduled(people.done.who, { operationKey: randomUUID() });
  at("2030-06-05T04:00:00Z"); await attendance.checkOut(people.done.who, { sessionId: done!.id, operationKey: randomUUID() });
  // "morning": unscheduled session from 09:30 local, still open.
  at("2030-06-05T03:30:00Z"); await attendance.checkInUnscheduled(people.morning.who, { operationKey: randomUUID() });
  // "scheduled": checked in at 08:55 for the 09:00–13:00 period (inside the early check-in window), still open.
  const slot = await db.scheduleSlot.findFirstOrThrow({ where: { workSchedule: { employeeId: people.scheduled.id } } });
  at("2030-06-05T02:55:00Z"); await attendance.checkIn(people.scheduled.who, { slotId: slot.id, workDate: "2030-06-05", operationKey: randomUUID() });
  at("2030-06-05T05:00:00Z");
});
afterAll(async () => { vi.restoreAllMocks(); await db?.$disconnect(); await database?.stop(); });
it("REPRODUCES the original defect: no service lists who is working; the dashboard counts checked-out people as working", async () => {
  const dashboard = await (await import("@/features/insights/dashboard")).managementDashboard(admin);
  // 4 people touched today (done, night, morning, scheduled), but only 3 are working now — the old card mixed both.
  expect(dashboard.cards.find(c => c.label === "Employees with sessions today")?.value).toBe(4);
  expect(dashboard.attendance).toEqual({ completed: 1, open: 3 });
  // The attendance report shows open sessions as zero worked time; it is a per-date history, not a live view.
  const report = await (await import("@/features/review/data")).attendanceManagement(admin, { range: "today", employeeId: people.night.id });
  expect(report.records[0]).toMatchObject({ actualSeconds: 0, openCount: 1 });
  // Fixed: the dashboard now carries the live list, by name.
  expect(dashboard.live.summary.working).toBe(3);
  expect(dashboard.live.rows.map(r => r.employee.name).sort()).toEqual(["Live morning", "Live night", "Live scheduled"]);
});
it("1–3: open sessions are working; not-checked-in and checked-out employees are not", async () => {
  const data = await live();
  expect(names(data)).toEqual(["Live morning", "Live night", "Live scheduled"]);
  expect(names(data)).not.toContain("Live done"); // checked out
  expect(names(data)).not.toContain("Live absent"); // scheduled, not checked in
  expect(data.summary).toEqual({ working: 3, sessions: 3, scheduledToday: 2, notCheckedIn: 1, attention: 2 });
  const byName = Object.fromEntries(data.rows.map(r => [r.employee.name, r]));
  expect(byName["Live scheduled"]).toMatchObject({ status: "WITHIN_SCHEDULE", attention: false, todayPeriods: ["09:00–13:00"], department: "Operations", employee: { number: "LV-SCHEDULED" } });
  expect(byName["Live morning"]).toMatchObject({ status: "UNSCHEDULED", attention: true, todayPeriods: [], department: "Support" });
});
it("4: a session started yesterday and still open stays visible, including just after midnight", async () => {
  at("2030-06-04T19:00:00Z"); // 01:00 local on Wednesday: the date changed three hours after the 22:00 check-in
  try {
    const data = await live();
    expect(data.today).toBe("2030-06-05");
    expect(data.rows.find(r => r.employee.name === "Live night")).toMatchObject({ workDate: "2030-06-04", startedToday: false, checkinAt: "2030-06-04T16:00:00.000Z", elapsedSeconds: 3 * 3600, status: "UNSCHEDULED" });
  } finally { at("2030-06-05T05:00:00Z"); }
  // At 11:00 the unscheduled session has been open 13 hours: flagged as incomplete, never closed.
  expect((await live()).rows.find(r => r.employee.name === "Live night")).toMatchObject({ elapsedSeconds: 13 * 3600, status: "INCOMPLETE", attention: true });
  expect(await db.attendanceSession.count({ where: { employeeId: people.night.id, checkoutAt: null } })).toBe(1);
});
it("5–6: the live list ignores historical date filters; the historical report still obeys them", async () => {
  const data = (await import("@/features/review/data"));
  // The live endpoint has no date input at all: a date filter is rejected, not silently applied.
  await expect(live(admin, { range: "date", date: "2030-06-01" })).rejects.toMatchObject({ status: 400 });
  expect(names(await live())).toContain("Live night");
  // Historical: today's report does not list the night session's work date; yesterday's does.
  const today = await data.attendanceManagement(admin, { range: "date", date: "2030-06-05", employeeId: people.night.id });
  const yesterday = await data.attendanceManagement(admin, { range: "date", date: "2030-06-04", employeeId: people.night.id });
  expect(today.records.every(r => r.date === "2030-06-05")).toBe(true);
  expect(yesterday.records.map(r => r.date)).toEqual(["2030-06-04"]);
  const older = await data.attendanceManagement(admin, { range: "date", date: "2030-06-01" });
  expect(older.records.every(r => r.date === "2030-06-01")).toBe(true);
});
it("16: organization-local date and server time drive every figure", async () => {
  at("2030-06-04T18:30:00Z"); // 00:30 local on 5 June while UTC is still 4 June
  try {
    const data = await live();
    expect(data).toMatchObject({ today: "2030-06-05", timezone: "Asia/Dhaka", generatedAt: "2030-06-04T18:30:00.000Z" });
    // Before 09:00 local nobody is "not yet checked in"; "scheduled" has not checked in yet at this time either.
    expect(data.summary).toMatchObject({ scheduledToday: 2, notCheckedIn: 0 });
  } finally { at("2030-06-05T05:00:00Z"); }
  at("2030-06-05T08:00:00Z"); // 14:00 local: the 09:00–13:00 period has ended but "scheduled" is still checked in
  try {
    const row = (await live()).rows.find(r => r.employee.name === "Live scheduled")!;
    expect(row).toMatchObject({ status: "PAST_END", attention: true, elapsedSeconds: 5 * 3600 + 5 * 60 });
  } finally { at("2030-06-05T05:00:00Z"); }
  at("2030-06-06T05:00:00Z"); // next day: still open, period ended before today began
  try { expect((await live()).rows.find(r => r.employee.name === "Live scheduled")).toMatchObject({ status: "INCOMPLETE", startedToday: false }); }
  finally { at("2030-06-05T05:00:00Z"); }
});
it("13–14: employees cannot read the workforce list or anyone's status; HR gets the same list with no private fields", async () => {
  await expect(live(people.morning.who)).rejects.toMatchObject({ status: 403 });
  for (const query of ["", `?employeeId=${people.night.id}`, "?status=WITHIN_SCHEDULE", "?search=Live"]) {
    const response = await route(people.morning.who, query);
    expect([400, 403]).toContain(response.status);
    expect(JSON.stringify(response.body)).not.toContain("Live night");
  }
  expect((await route(null)).status).toBe(401);
  // Request payloads cannot widen access either: unknown fields are refused for staff too.
  expect((await route(admin, `?employeeId=${people.night.id}`)).status).toBe(400);
  const staff = await live(hr);
  expect(names(staff)).toEqual(names(await live()));
  expect(JSON.stringify(staff)).not.toMatch(/salary|commission|bank|compensation|dateOfBirth|emergency|email|incident/i);
});
it("11: the endpoint is uncached and reflects server-side changes on the next request", async () => {
  const before = await route(admin);
  expect(before).toMatchObject({ status: 200, cache: "private, no-store" });
  expect(before.body.summary.working).toBe(3);
  const attendance = await import("@/features/time/attendance");
  at("2030-06-05T05:01:00Z"); const session = await attendance.checkInUnscheduled(people.late.who, { operationKey: randomUUID() });
  try {
    const after = await route(admin);
    expect(after.body.summary.working).toBe(4);
    expect(after.body.rows.find((r: { employee: { name: string } }) => r.employee.name === "Live late")).toMatchObject({ checkinAt: "2030-06-05T05:01:00.000Z", elapsedSeconds: 0 });
    // Server-side filters work on the same data.
    expect((await route(admin, "?search=lv-late")).body.rows).toHaveLength(1);
    expect((await route(admin, "?status=ATTENTION")).body.rows.map((r: { employee: { name: string } }) => r.employee.name).sort()).toEqual(["Live late", "Live morning", "Live night"]);
  } finally { at("2030-06-05T05:30:00Z"); await attendance.checkOut(people.late.who, { sessionId: session!.id, operationKey: randomUUID() }); at("2030-06-05T05:00:00Z"); }
});
it("8–9: a successful check-in appears with server times; checkout removes it and the completed session stays in history", async () => {
  const attendance = await import("@/features/time/attendance");
  at("2030-06-05T06:00:00Z"); const session = await attendance.checkInUnscheduled(people.late.who, { operationKey: randomUUID() });
  at("2030-06-05T06:20:00Z");
  const row = (await live()).rows.find(r => r.employee.name === "Live late")!;
  expect(row).toMatchObject({ sessionId: session!.id, checkinAt: "2030-06-05T06:00:00.000Z", elapsedSeconds: 1200, startedToday: true, workDate: "2030-06-05" });
  at("2030-06-05T07:00:00Z"); await attendance.checkOut(people.late.who, { sessionId: session!.id, operationKey: randomUUID() });
  expect(names(await live())).not.toContain("Live late");
  const history = await (await import("@/features/review/data")).attendanceManagement(admin, { range: "date", date: "2030-06-05", employeeId: people.late.id });
  expect(history.records[0].actualSeconds).toBe(29 * 60 + 3600); // 05:01–05:30 earlier plus 06:00–07:00
  expect(await db.auditLog.count({ where: { entityId: session!.id, action: { in: ["UNSCHEDULED_CHECKED_IN", "ATTENDANCE_CHECKED_OUT"] } } })).toBeGreaterThanOrEqual(2);
  at("2030-06-05T05:00:00Z");
});
it("10: failed check-in and checkout attempts leave the live list unchanged", async () => {
  const attendance = await import("@/features/time/attendance"), before = await live();
  // Second check-in while already working (database allows one open session per employee).
  await expect(attendance.checkInUnscheduled(people.morning.who, { operationKey: randomUUID() })).rejects.toThrow();
  // Checking out someone else's session.
  const night = before.rows.find(r => r.employee.name === "Live night")!;
  await expect(attendance.checkOut(people.morning.who, { sessionId: night.sessionId, operationKey: randomUUID() })).rejects.toThrow();
  // Checking in to another employee's period.
  const slot = await db.scheduleSlot.findFirstOrThrow({ where: { workSchedule: { employeeId: people.absent.id } } });
  await expect(attendance.checkIn(people.extra1.who, { slotId: slot.id, workDate: "2030-06-05", operationKey: randomUUID() })).rejects.toThrow();
  const after = await live();
  expect(after.summary).toEqual(before.summary);
  expect(after.rows.map(r => [r.sessionId, r.status])).toEqual(before.rows.map(r => [r.sessionId, r.status]));
});
it("15: open sessions on accounts put on hold or suspended are kept and flagged for review, never closed", async () => {
  const attendance = await import("@/features/time/attendance"), controls = await import("@/features/accounts/controls");
  at("2030-06-05T04:00:00Z"); const session = await attendance.checkInUnscheduled(people.held.who, { operationKey: randomUUID() });
  at("2030-06-05T05:00:00Z");
  await controls.changeEmployeeStatus(admin, { employeeId: people.held.id, status: "ON_HOLD", reason: "Synthetic hold" });
  const row = (await live()).rows.find(r => r.employee.name === "Live held")!;
  expect(row).toMatchObject({ sessionId: session!.id, attention: true, flags: ["Account on hold — review this open session"] });
  // The held employee's own request is refused by the existing policy; the session is untouched.
  await expect(attendance.checkOut(people.held.who, { sessionId: session!.id, operationKey: randomUUID() })).rejects.toThrow();
  await controls.changeEmployeeStatus(admin, { employeeId: people.held.id, status: "SUSPENDED", reason: "Synthetic suspension" });
  expect((await live()).rows.find(r => r.employee.name === "Live held")?.flags).toEqual(["Account suspended — review this open session"]);
  expect(await db.attendanceSession.findUniqueOrThrow({ where: { id: session!.id }, select: { checkoutAt: true, voidedAt: true } })).toEqual({ checkoutAt: null, voidedAt: null });
  // A suspended employee with a period today is not expected to check in.
  const summary = (await live()).summary;
  expect(summary).toMatchObject({ scheduledToday: 2, notCheckedIn: 1, working: 4 });
});
it("7: unexpected duplicate open sessions are flagged without counting the employee twice", async () => {
  expect(await db.attendanceSession.count({ where: { employeeId: people.morning.id, checkoutAt: null, voidedAt: null } })).toBe(1);
  // The database forbids this twice (unique open-session index and the no-overlap constraint); lift both in the
  // disposable database only, to simulate legacy inconsistent data.
  const overlap = (await database.owner.query("SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname='attendance_no_overlap'")).rows[0].def as string;
  await database.owner.query("DROP INDEX attendance_one_open; ALTER TABLE attendance_sessions DROP CONSTRAINT attendance_no_overlap");
  const original = await db.attendanceSession.findFirstOrThrow({ where: { employeeId: people.morning.id, checkoutAt: null } });
  const duplicate = randomUUID();
  await database.owner.query(`INSERT INTO attendance_sessions (id,employee_id,employment_period_id,work_date,timezone_snapshot,rules_version_snapshot,early_checkin_minutes_snapshot,checkin_at,source,created_by,checkin_operation_key,revision,created_at,updated_at)
    VALUES ($1,$2,$3,'2030-06-05','Asia/Dhaka',1,10,'2030-06-05T04:30:00Z','UNSCHEDULED',$4,$5,1,now(),now())`, [duplicate, people.morning.id, original.employmentPeriodId, original.createdBy, randomUUID()]);
  try {
    const before = await live(), row = before.rows.find(r => r.employee.name === "Live morning")!;
    expect(before.rows.filter(r => r.employee.name === "Live morning")).toHaveLength(1);
    expect(row).toMatchObject({ sessionId: original.id, sessionCount: 2, attention: true });
    expect(row.flags).toContain("More than one open session — data needs review");
    expect(before.summary.sessions).toBe(before.summary.working + 1);
  } finally {
    // Test-database repair only: void the synthetic duplicate without the correction workflow, then restore the index.
    await database.owner.query("BEGIN; SET LOCAL session_replication_role = replica");
    await database.owner.query("UPDATE attendance_sessions SET voided_at=now(), void_reason='Synthetic duplicate removed' WHERE id=$1", [duplicate]);
    await database.owner.query("COMMIT");
    await database.owner.query(`CREATE UNIQUE INDEX attendance_one_open ON attendance_sessions(employee_id) WHERE checkout_at IS NULL AND voided_at IS NULL; ALTER TABLE attendance_sessions ADD CONSTRAINT attendance_no_overlap ${overlap}`);
  }
});
it("17: statement count is constant regardless of how many people are working; the attendance report batches review lookups", async () => {
  const { liveWorkforceData, liveQuerySchema } = await import("@/features/time/live"), query = liveQuerySchema.parse({});
  const small = await statements(() => liveWorkforceData(db, query));
  expect(small.length).toBeGreaterThanOrEqual(3); // the counter sees real statements
  const attendance = await import("@/features/time/attendance"), sessions: string[] = [];
  for (const n of [1, 2, 3, 4, 5]) sessions.push((await attendance.checkInUnscheduled(people[`extra${n}`].who, { operationKey: randomUUID() }))!.id);
  try {
    expect((await liveWorkforceData(db, query)).summary.working).toBeGreaterThanOrEqual(9);
    const large = await statements(() => liveWorkforceData(db, query));
    expect(large.length).toBe(small.length);
    expect(large.length).toBeLessThanOrEqual(5); // settings, server time, open sessions, today's periods, expected arrivals
  } finally { at("2030-06-05T05:10:00Z"); for (const [n, id] of sessions.entries()) await attendance.checkOut(people[`extra${n + 1}`].who, { sessionId: id, operationKey: randomUUID() }); at("2030-06-05T05:00:00Z"); }
  // Attendance report: stored overtime reviews for the whole page in one query (previously one per employee-week).
  const report = await statements(() => import("@/features/review/data").then(m => m.attendanceManagement(admin, { range: "custom", from: "2030-06-01", to: "2030-06-14" })));
  expect(report.filter(q => /"overtime_reviews"/.test(q)).length).toBe(1);
});
it("18: the live view only reads — attendance, overtime and pay data are unchanged by it", async () => {
  const snapshot = async () => (await database.owner.query(`SELECT (SELECT md5(string_agg(row(s.*)::text, ',' ORDER BY s.id)) FROM attendance_sessions s) AS sessions,
    (SELECT md5(coalesce(string_agg(row(o.*)::text, ',' ORDER BY o.id), '')) FROM overtime_reviews o) AS overtime, (SELECT count(*) FROM audit_logs) AS audits,
    (SELECT md5(coalesce(string_agg(row(c.*)::text, ',' ORDER BY c.id), '')) FROM salary_calculations c) AS salary`)).rows[0];
  const before = await snapshot();
  for (let i = 0; i < 3; i++) { await live(); await live(hr); await route(admin); }
  await (await import("@/features/insights/dashboard")).managementDashboard(admin);
  expect(await snapshot()).toEqual(before);
  // The completed morning session of "done" is still two hours of actual time.
  const done = await (await import("@/features/review/data")).attendanceManagement(admin, { range: "date", date: "2030-06-05", employeeId: people.done.id });
  expect(done.records[0]).toMatchObject({ actualSeconds: 7200, openCount: 0 });
});
