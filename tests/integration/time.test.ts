import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { testPostgres } from "../postgres";
import { randomUUID } from "node:crypto";
import type { Identity } from "@/types/auth";
import type { PrismaClient } from "@/generated/prisma/client";
import type * as Schedules from "@/features/time/schedules";
import type * as Attendance from "@/features/time/attendance";
import type * as Data from "@/features/time/data";
let database: Awaited<ReturnType<typeof testPostgres>>, db: PrismaClient;
let schedules: typeof Schedules, attendance: typeof Attendance, data: typeof Data;
let admin: Identity, hr: Identity, alice: Identity, bob: Identity, aliceId: string, bobId: string, alicePeriod: string, bobPeriod: string, scheduleId: string, slotId: string, sessionId: string;
let night: Identity, nightId: string, nightPeriod: string, nightSchedule: string, nightSession: string;
const dateString = (date: Date) => date.toISOString().slice(0, 10);
let realDatabaseNow: typeof import("@/features/time/clock").databaseNow;
let now = new Date("2030-01-07T02:49:00Z"); // Monday, 08:49 Asia/Dhaka.
const at = (instant: string) => { now = new Date(instant); };
const identity = (userId: string): Identity => { const issuedAt = Date.now(); return { userId, issuedAt, absoluteExpiresAt: issuedAt + 43200000, sessionVersion: 1 }; };
const slot = (weekday = 1, startMinute = 540, endMinute = 780, endDayOffset = 0) => ({ weekday, startMinute, endMinute, endDayOffset });
const publish = (employeeId: string, employmentPeriodId: string, slots = [slot()], from = "2030-01-07", until = "") => ({ employeeId, employmentPeriodId, effectiveFrom: from, effectiveUntil: until, slots, label: "Normal weekly pattern", reason: "Initial assignment" });
const checkin = (selectedSlot = slotId, date = "2030-01-07", operationKey: string = randomUUID()) => ({ slotId: selectedSlot, workDate: date, operationKey });
const checkout = (selectedSession = sessionId, operationKey: string = randomUUID()) => ({ sessionId: selectedSession, operationKey });
beforeAll(async () => {
  database = await testPostgres(); await database.owner.query("ALTER DATABASE employee_foundation_test SET timezone TO 'Asia/Shanghai'"); process.env.DATABASE_URL = database.runtimeUrl;
  db = (await import("@/lib/db/client")).db;
  realDatabaseNow = (await import("@/features/time/clock")).databaseNow;
  vi.spyOn(await import("@/features/time/clock"), "databaseNow").mockImplementation(async () => new Date(now));
  schedules = await import("@/features/time/schedules"); attendance = await import("@/features/time/attendance"); data = await import("@/features/time/data");
  const administrator = await db.user.create({ data: { email: "time-admin@example.test", role: "ADMIN", passwordHash: "synthetic-unused-hash", mustChangePassword: false } }); admin = identity(administrator.id);
  await db.organizationSettings.create({ data: { companyName: "Time tests", changedBy: administrator.id, overtimePolicyVersions: [] } });
  hr = identity((await db.user.create({ data: { email: "time-hr@example.test", role: "HR_MANAGER", passwordHash: "synthetic-unused-hash", mustChangePassword: false } })).id);
  for (const name of ["Alice", "Bob"]) {
    const user = await db.user.create({ data: { email: `${name.toLowerCase()}-time@example.test`, role: "EMPLOYEE", passwordHash: "synthetic-unused-hash", mustChangePassword: false } });
    const employee = await db.employee.create({ data: { userId: user.id, employeeNumber: name, legalName: `${name} Time`, createdBy: administrator.id,
      employmentPeriods: { create: { startDate: new Date("2020-01-01"), departmentLabel: "Operations", positionLabel: "Associate", createdBy: administrator.id } } }, include: { employmentPeriods: true } });
    if (name === "Alice") { alice = identity(user.id); aliceId = employee.id; alicePeriod = employee.employmentPeriods[0].id; } else { bob = identity(user.id); bobId = employee.id; bobPeriod = employee.employmentPeriods[0].id; }
  }
});
afterAll(async () => { vi.restoreAllMocks(); await db?.$disconnect(); await database?.stop(); });
describe("Phase 3C locked schedule and actual attendance operations", () => {
  it("publishes independent recurring assignments with multiple daily periods", async () => {
    scheduleId = await schedules.publishSchedule(hr, publish(aliceId, alicePeriod, [slot(), slot(1, 840, 1080), slot(1, 1200, 1380), slot(2, 540, 780), slot(2, 900, 1140)]));
    const row = await db.workSchedule.findUniqueOrThrow({ where: { id: scheduleId }, include: { slots: true } }); expect(row.slots).toHaveLength(5);
    slotId = row.slots.find(s => s.weekday === 1 && s.startMinute === 540)!.id;
    await schedules.publishSchedule(admin, publish(bobId, bobPeriod, [slot(1, 600, 840), slot(1, 1080, 1380)]));
    const own = await data.ownSchedule(alice); expect(own?.periods.map(p => p.scheduledStartAt.toISOString())).toEqual(["2030-01-07T03:00:00.000Z", "2030-01-07T08:00:00.000Z", "2030-01-07T14:00:00.000Z"]);
    expect(JSON.stringify(own)).not.toMatch(/Bob Time|passwordHash|OperationKey|createdBy|userId/);
  });
  it("rejects overlap, reversed times, cyclic overnight overlap and invalid dates", async () => {
    await expect(schedules.publishSchedule(hr, publish(aliceId, alicePeriod, [slot(1, 540, 780), slot(1, 700, 840)], "2031-01-01"))).rejects.toMatchObject({ code: "SCHEDULE_OVERLAP" });
    await expect(schedules.publishSchedule(hr, publish(aliceId, alicePeriod, [slot(1, 780, 540)], "2031-01-01"))).rejects.toMatchObject({ status: 400 });
    await expect(schedules.publishSchedule(hr, publish(aliceId, alicePeriod, [slot(7, 1320, 120, 1), slot(1, 60, 180)], "2031-01-01"))).rejects.toMatchObject({ code: "SCHEDULE_OVERLAP" });
    await expect(schedules.publishSchedule(hr, publish(aliceId, alicePeriod, [slot()], "2030-01-07", "2030-01-06"))).rejects.toMatchObject({ status: 400 });
    await expect(schedules.publishSchedule(hr, publish(aliceId, alicePeriod, [slot()], "2029-12-31"))).rejects.toMatchObject({ code: "SCHEDULE_DATES" });
  });
  it("enforces stint ownership, effective ranges and existing assignment overlap", async () => {
    await expect(schedules.publishSchedule(hr, publish(aliceId, bobPeriod))).rejects.toMatchObject({ status: 404 });
    await expect(schedules.publishSchedule(hr, publish(aliceId, alicePeriod, [slot()], "2030-02-01"))).rejects.toBeDefined();
    await expect(attendance.checkIn(alice, checkin(slotId, "2030-01-06"))).rejects.toMatchObject({ code: "SCHEDULE_INELIGIBLE" });
    await expect(attendance.checkIn(alice, checkin(slotId, "2030-01-08"))).rejects.toMatchObject({ code: "SCHEDULE_INELIGIBLE" });
  });
  it("denies employee/guest schedule writes and staff-only direct reads", async () => {
    for (const caller of [null, alice]) {
      await expect(schedules.publishSchedule(caller, publish(bobId, bobPeriod))).rejects.toMatchObject({ status: caller ? 403 : 401 });
      await expect(data.employeeSchedule(caller, bobId)).rejects.toMatchObject({ status: caller ? 403 : 401 });
      await expect(data.attendanceHistory(caller, bobId)).rejects.toMatchObject({ status: caller ? 403 : 401 });
    }
    await expect(data.employeeSchedule(alice, bobId, {}, true)).rejects.toMatchObject({ status: 404 });
  });
  it("rejects 11 minutes early and 08:49:59, allowing exactly 10 minutes early", async () => {
    await expect(attendance.checkIn(alice, checkin())).rejects.toMatchObject({ code: "CHECKIN_EARLY" });
    at("2030-01-07T02:49:59Z"); await expect(attendance.checkIn(alice, checkin())).rejects.toMatchObject({ code: "CHECKIN_EARLY" });
    at("2030-01-07T02:50:00Z"); sessionId = (await attendance.checkIn(alice, checkin())).id;
    const session = await db.attendanceSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.checkinAt.toISOString()).toBe("2030-01-07T02:50:00.000Z"); expect(session.earlyCheckinMinutesSnapshot).toBe(10); expect(session.timezoneSnapshot).toBe("Asia/Dhaka");
    expect((await data.ownSchedule(alice))?.active?.id).toBe(sessionId);
  });
  it("blocks duplicate active check-in while the same operation key replays safely", async () => {
    const session = await db.attendanceSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(await attendance.checkIn(alice, checkin(slotId, "2030-01-07", session.checkinOperationKey!))).toEqual({ id: sessionId, replayed: true });
    await expect(attendance.checkIn(alice, checkin())).rejects.toMatchObject({ code: "OPEN_SESSION" });
    expect(await db.attendanceSession.count({ where: { employeeId: aliceId, checkoutAt: null } })).toBe(1);
  });
  it("rejects supplied owner/time/rule fields and foreign schedule/session selectors", async () => {
    const bobSlot = await db.scheduleSlot.findFirstOrThrow({ where: { workSchedule: { employeeId: bobId } } });
    for (const injected of [{ employeeId: bobId }, { checkinAt: "2030-01-07T04:00:00Z" }, { timezone: "UTC" }, { earlyCheckinMinutes: 60 }]) await expect(attendance.checkIn(alice, { ...checkin(), ...injected })).rejects.toMatchObject({ status: 400 });
    await expect(attendance.checkIn(bob, checkin(slotId))).rejects.toMatchObject({ status: 404 });
    await expect(attendance.checkOut(bob, checkout())).rejects.toMatchObject({ status: 404 });
    await expect(data.ownAttendanceDetail(bob, sessionId)).rejects.toMatchObject({ status: 404 });
    await expect(data.ownSchedule(alice, { employeeId: bobId })).rejects.toMatchObject({ status: 400 });
    expect(bobSlot.id).not.toBe(slotId);
  });
  it("records checkout after scheduled end with calculated actual duration and audit", async () => {
    at("2030-01-07T08:30:00Z"); // 14:30 vs scheduled 13:00.
    const result = await attendance.checkOut(alice, checkout()); expect(result.id).toBe(sessionId);
    const view = await data.ownAttendanceDetail(alice, sessionId); expect(view.durationSeconds).toBe(20400); expect(view.status).toBe("COMPLETED");
    expect(await db.auditLog.count({ where: { entityId: sessionId, action: { in: ["ATTENDANCE_CHECKED_IN", "ATTENDANCE_CHECKED_OUT"] } } })).toBe(2);
    const own = await (await import("@/features/people/timeline")).ownTimeline(alice); expect(own.filter(e => e.sourceId === sessionId)).toHaveLength(2);
  });
  it("allows late arrival before cutoff and return sessions to the same occurrence", async () => {
    const afternoon = await db.scheduleSlot.findFirstOrThrow({ where: { workScheduleId: scheduleId, startMinute: 840 } });
    sessionId = (await attendance.checkIn(alice, checkin(afternoon.id))).id;
    expect((await data.ownAttendanceDetail(alice, sessionId)).lateSeconds).toBe(1800);
    at("2030-01-07T09:00:00Z"); await attendance.checkOut(alice, checkout());
    at("2030-01-07T09:05:00Z"); sessionId = (await attendance.checkIn(alice, checkin(afternoon.id))).id;
    expect(await db.attendanceSession.count({ where: { employeeId: aliceId, scheduleSlotId: afternoon.id } })).toBe(2);
    at("2030-01-07T12:00:00Z"); await attendance.checkOut(alice, checkout());
  });
  it("rejects after-end check-in and checkout without an active own session", async () => {
    at("2030-01-07T12:00:01Z");
    const afternoon = await db.scheduleSlot.findFirstOrThrow({ where: { workScheduleId: scheduleId, startMinute: 840 } });
    await expect(attendance.checkIn(alice, checkin(afternoon.id))).rejects.toMatchObject({ code: "CHECKIN_ENDED" });
    await expect(attendance.checkOut(alice, checkout())).rejects.toMatchObject({ code: "SESSION_CLOSED" });
    await expect(attendance.checkOut(alice, checkout(randomUUID()))).rejects.toMatchObject({ status: 404 });
  });
  it("allows checkout after midnight and displays an incomplete open session without fabricating an end", async () => {
    const evening = await db.scheduleSlot.findFirstOrThrow({ where: { workScheduleId: scheduleId, startMinute: 1200 } });
    at("2030-01-07T14:00:00Z"); sessionId = (await attendance.checkIn(alice, checkin(evening.id))).id;
    at("2030-01-07T18:30:00Z"); // Next local day, 00:30.
    const open = await data.ownAttendanceDetail(alice, sessionId); expect(open.status).toBe("INCOMPLETE"); expect(open.checkoutAt).toBeNull(); expect(open.durationSeconds).toBeNull(); expect(open.provisionalSeconds).toBe(16200);
    await attendance.checkOut(alice, checkout()); expect((await data.ownAttendanceDetail(alice, sessionId)).durationSeconds).toBe(16200);
  });
  it("idempotent checkout never closes a later session and reused selectors are rejected", async () => {
    const old = await db.attendanceSession.findUniqueOrThrow({ where: { id: sessionId } });
    const tuesday = await db.scheduleSlot.findFirstOrThrow({ where: { workScheduleId: scheduleId, weekday: 2, startMinute: 540 } });
    at("2030-01-08T03:00:00Z"); const newer = (await attendance.checkIn(alice, checkin(tuesday.id, "2030-01-08"))).id;
    expect((await attendance.checkOut(alice, checkout(old.id, old.checkoutOperationKey!))).replayed).toBe(true);
    expect((await db.attendanceSession.findUniqueOrThrow({ where: { id: newer } })).checkoutAt).toBeNull();
    await expect(attendance.checkOut(alice, checkout(newer, old.checkoutOperationKey!))).rejects.toMatchObject({ code: "OPERATION_REUSED" });
    at("2030-01-08T04:00:00Z"); await attendance.checkOut(alice, checkout(newer));
  });
  it("concurrent different-key check-ins create exactly one open session", async () => {
    const tuesday = await db.scheduleSlot.findFirstOrThrow({ where: { workScheduleId: scheduleId, weekday: 2, startMinute: 900 } });
    at("2030-01-08T09:00:00Z"); const outcomes = await Promise.allSettled([attendance.checkIn(alice, checkin(tuesday.id, "2030-01-08")), attendance.checkIn(alice, checkin(tuesday.id, "2030-01-08"))]);
    expect(outcomes.filter(o => o.status === "fulfilled")).toHaveLength(1); expect(outcomes.filter(o => o.status === "rejected")).toHaveLength(1);
    sessionId = outcomes.find(o => o.status === "fulfilled")!.value.id;
    expect(await db.attendanceSession.count({ where: { employeeId: aliceId, checkoutAt: null } })).toBe(1);
    at("2030-01-08T10:00:00Z"); await attendance.checkOut(alice, checkout());
  });
  it("concurrent same-key retries produce one fact and one audit pair", async () => {
    const tuesday = await db.scheduleSlot.findFirstOrThrow({ where: { workScheduleId: scheduleId, weekday: 2, startMinute: 900 } }); const input = checkin(tuesday.id, "2030-01-08");
    at("2030-01-08T10:05:00Z"); const results = await Promise.all([attendance.checkIn(alice, input), attendance.checkIn(alice, input)]);
    expect(results[0].id).toBe(results[1].id); expect(results.map(r => r.replayed).sort()).toEqual([false, true]); sessionId = results[0].id;
    const out = checkout(); at("2030-01-08T10:10:00Z"); const closed = await Promise.all([attendance.checkOut(alice, out), attendance.checkOut(alice, out)]); expect(closed[0].id).toBe(closed[1].id);
    expect(await db.auditLog.count({ where: { entityId: sessionId, action: "ATTENDANCE_CHECKED_IN" } })).toBe(1); expect(await db.auditLog.count({ where: { entityId: sessionId, action: "ATTENDANCE_CHECKED_OUT" } })).toBe(1);
  });
  it("temporary future replacement requires explicit restoration and preserves snapshots/slots", async () => {
    const original = await db.workSchedule.findUniqueOrThrow({ where: { id: scheduleId }, include: { slots: true } });
    const snapshots = await db.attendanceSession.findMany({ where: { employeeId: aliceId }, select: { id: true, scheduledStartAt: true, scheduledEndAt: true, checkinAt: true, checkoutAt: true } });
    const replace = { ...publish(aliceId, alicePeriod, [slot(1, 600, 840)], "2030-01-14", "2030-01-21"), baseScheduleId: scheduleId, baseRevision: original.revision };
    await expect(schedules.publishSchedule(hr, replace)).rejects.toMatchObject({ code: "RESTORE_REQUIRED" });
    await schedules.publishSchedule(hr, { ...replace, restoreSlots: original.slots.map(({ weekday, startMinute, endMinute, endDayOffset }) => ({ weekday, startMinute, endMinute, endDayOffset })) });
    expect(await db.attendanceSession.findMany({ where: { employeeId: aliceId }, select: { id: true, scheduledStartAt: true, scheduledEndAt: true, checkinAt: true, checkoutAt: true } })).toEqual(snapshots);
    expect(await db.scheduleSlot.count({ where: { workScheduleId: scheduleId } })).toBe(5);
    expect(await db.workSchedule.count({ where: { employeeId: aliceId, supersededAt: null } })).toBe(3);
    await expect(schedules.publishSchedule(hr, { ...replace, restoreSlots: [] })).rejects.toMatchObject({ code: "STALE" });
  });
  it("future cancellation uses a rest version and retains previous published assignments", async () => {
    const restored = await db.workSchedule.findFirstOrThrow({ where: { employeeId: aliceId, effectiveFrom: new Date("2030-01-21"), supersededAt: null } });
    const cancelled = await schedules.publishSchedule(hr, { ...publish(aliceId, alicePeriod, [], "2030-01-21"), baseScheduleId: restored.id, baseRevision: restored.revision });
    expect((await db.workSchedule.findUniqueOrThrow({ where: { id: restored.id } })).supersededAt).not.toBeNull();
    expect(await db.scheduleSlot.count({ where: { workScheduleId: cancelled } })).toBe(0);
    expect(await db.auditLog.count({ where: { entityId: cancelled, action: "SCHEDULE_CANCELLED" } })).toBe(1);
  });
  it("rejects modifying today's pattern and prevents direct slot/attendance identity/timestamp edits", async () => {
    const base = await db.workSchedule.findUniqueOrThrow({ where: { id: scheduleId } });
    await expect(schedules.publishSchedule(hr, { ...publish(aliceId, alicePeriod, [slot()], "2030-01-08", "2030-01-09"), baseScheduleId: scheduleId, baseRevision: base.revision, restoreSlots: [] })).rejects.toMatchObject({ code: "HISTORICAL_SCHEDULE" });
    await expect(db.scheduleSlot.update({ where: { id: slotId }, data: { startMinute: 600 } })).rejects.toBeDefined();
    await expect(db.scheduleSlot.create({ data: { workScheduleId: scheduleId, ...slot(3) } })).rejects.toBeDefined();
    await expect(db.attendanceSession.update({ where: { id: sessionId }, data: { checkinAt: new Date("2030-01-08T09:00:00Z") } })).rejects.toBeDefined();
    await expect(database.owner.query("DELETE FROM attendance_sessions WHERE id=$1", [sessionId])).rejects.toBeDefined();
  });
  it("locks timezone after official time records while allowing future early-window policy changes", async () => {
    const { updateSettings } = await import("@/features/settings/service");
    await expect(updateSettings(admin, { companyName: "Time tests", timezone: "UTC", earlyCheckinMinutes: 10 })).rejects.toMatchObject({ code: "TIMEZONE_FROZEN" });
    await expect(database.owner.query("UPDATE organization_settings SET timezone='UTC' WHERE id=1")).rejects.toBeDefined();
    await updateSettings(admin, { companyName: "Time tests", timezone: "Asia/Dhaka", earlyCheckinMinutes: 5 });
    const monday = await db.scheduleSlot.findFirstOrThrow({ where: { workSchedule: { employeeId: bobId }, weekday: 1, startMinute: 600 } });
    at("2030-01-14T03:54:00Z"); await expect(attendance.checkIn(bob, checkin(monday.id, "2030-01-14"))).rejects.toMatchObject({ code: "CHECKIN_EARLY" });
    at("2030-01-14T03:55:00Z"); const id = (await attendance.checkIn(bob, checkin(monday.id, "2030-01-14"))).id; expect((await db.attendanceSession.findUniqueOrThrow({ where: { id } })).earlyCheckinMinutesSnapshot).toBe(5);
    at("2030-01-14T04:00:00Z"); await attendance.checkOut(bob, checkout(id));
  });
  it("database single-open and actual-overlap guards protect against bypass writes", async () => {
    const row = await db.attendanceSession.findUniqueOrThrow({ where: { id: sessionId } });
    const fields = { ...row, id: undefined, createdAt: undefined, updatedAt: undefined };
    await expect(db.attendanceSession.create({ data: { ...fields, checkinOperationKey: randomUUID(), checkoutOperationKey: randomUUID() } })).rejects.toBeDefined();
    await expect(db.attendanceSession.create({ data: { ...fields, employeeId: bobId, employmentPeriodId: bobPeriod, checkinOperationKey: randomUUID(), checkoutOperationKey: randomUUID() } })).rejects.toBeDefined();
  });
  it("supports overnight occurrences and rejects overlap at a future version boundary", async () => {
    const user = await db.user.create({ data: { email: "night@example.test", role: "EMPLOYEE", passwordHash: "synthetic-unused-hash", mustChangePassword: false } });
    const employee = await db.employee.create({ data: { userId: user.id, employeeNumber: "Night", legalName: "Night Worker", createdBy: admin.userId, employmentPeriods: { create: { startDate: new Date("2020-01-01"), createdBy: admin.userId, departmentLabel: "Operations", positionLabel: "Associate" } } }, include: { employmentPeriods: true } });
    night = identity(user.id); nightId = employee.id; nightPeriod = employee.employmentPeriods[0].id;
    nightSchedule = await schedules.publishSchedule(hr, publish(nightId, nightPeriod, [slot(7, 1320, 120, 1), slot(1, 180, 360)], "2030-01-20"));
    const replace = { ...publish(nightId, nightPeriod, [slot(1, 60, 360)], "2030-01-21"), baseScheduleId: nightSchedule, baseRevision: 1 };
    await expect(schedules.publishSchedule(hr, replace)).rejects.toMatchObject({ code: "SCHEDULE_OVERLAP" });
    expect((await db.workSchedule.findUniqueOrThrow({ where: { id: nightSchedule } })).effectiveUntil).toBeNull();
    await schedules.publishSchedule(hr, { ...replace, slots: [slot(1, 120, 360), slot(2, 3, 60)] });
    const sunday = await db.scheduleSlot.findFirstOrThrow({ where: { workScheduleId: nightSchedule, weekday: 7 } });
    at("2030-01-20T15:55:00Z"); const first = (await attendance.checkIn(night, checkin(sunday.id, "2030-01-20"))).id;
    at("2030-01-20T17:30:00Z"); await attendance.checkOut(night, checkout(first));
    at("2030-01-20T18:30:00Z"); nightSession = (await attendance.checkIn(night, checkin(sunday.id, "2030-01-20"))).id;
    at("2030-01-20T21:00:00Z"); await attendance.checkOut(night, checkout(nightSession));
    const record = await data.ownAttendanceDetail(night, nightSession); expect(dateString(record.workDate)).toBe("2030-01-20"); expect(record.scheduledEndAt?.toISOString()).toBe("2030-01-20T20:00:00.000Z");
    const week = await data.ownSchedule(night, { week: "2030-01-21" }); expect(week?.days[0].carryover).toHaveLength(1); expect(week?.scheduledSeconds).toBe(25020); expect(week?.actualSeconds).toBe(9000);
  });
  it("reads the authoritative clock after a lock wait across the near-midnight early window", async () => {
    const tuesday = await db.scheduleSlot.findFirstOrThrow({ where: { workSchedule: { employeeId: nightId, supersededAt: null }, weekday: 2 } });
    at("2030-01-21T17:57:59Z"); await expect(attendance.checkIn(night, checkin(tuesday.id, "2030-01-22"))).rejects.toMatchObject({ code: "CHECKIN_EARLY" });
    const clock = vi.mocked((await import("@/features/time/clock")).databaseNow); clock.mockClear();
    await database.owner.query("BEGIN"); await database.owner.query("SELECT pg_advisory_xact_lock(73102301)");
    const queued = attendance.checkIn(night, checkin(tuesday.id, "2030-01-22"));
    // Keep a rejection handler attached during the wait; the operation may not finish before release.
    const observed = queued.then(value => ({ value }), error => ({ error }));
    try {
      let blocked = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        blocked = (await database.owner.query("SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=73102301 AND NOT granted")).rowCount! > 0;
        if (blocked) break;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(blocked).toBe(true); expect(clock).not.toHaveBeenCalled(); at("2030-01-21T17:58:00Z");
    }
    finally { await database.owner.query("COMMIT"); }
    const result = await observed; if ("error" in result) throw result.error;
    nightSession = result.value.id;
    expect((await db.attendanceSession.findUniqueOrThrow({ where: { id: nightSession } })).checkinAt.toISOString()).toBe("2030-01-21T17:58:00.000Z");
    const base = await db.workSchedule.findFirstOrThrow({ where: { employeeId: nightId, effectiveFrom: new Date("2030-01-21"), supersededAt: null } });
    await expect(schedules.publishSchedule(hr, { ...publish(nightId, nightPeriod, [], "2030-01-22"), baseScheduleId: base.id, baseRevision: base.revision })).rejects.toMatchObject({ code: "ATTENDANCE_STARTED" });
    at("2030-01-21T18:30:00Z"); await attendance.checkOut(night, checkout(nightSession));
  });
  it("allows exactly the scheduled end but requires a strictly later checkout even if the clock moves backward", async () => {
    const evening = await db.scheduleSlot.findFirstOrThrow({ where: { workSchedule: { employeeId: bobId }, weekday: 1, startMinute: 1080 } });
    at("2030-01-21T17:00:00Z"); const id = (await attendance.checkIn(bob, checkin(evening.id, "2030-01-21"))).id;
    await expect(attendance.checkOut(bob, checkout(id))).rejects.toMatchObject({ code: "CHECKOUT_TIME" });
    at("2030-01-21T16:59:59Z"); await expect(attendance.checkOut(bob, checkout(id))).rejects.toMatchObject({ code: "CHECKOUT_TIME" });
    at("2030-01-21T17:00:01Z"); await attendance.checkOut(bob, checkout(id)); expect((await data.ownAttendanceDetail(bob, id)).durationSeconds).toBe(1);
  });
  it("database deferred guards reject cyclic weekly overlap and extra slots after shortening", async () => {
    await expect(db.$transaction(async tx => {
      await tx.workSchedule.create({ data: { employeeId: bobId, employmentPeriodId: bobPeriod, effectiveFrom: new Date("2040-01-01"), effectiveUntil: new Date("2040-02-01"), supersededAt: now, createdBy: admin.userId, changeReason: "Database validation test", slots: { create: [slot(7, 1320, 120, 1), slot(1, 60, 180)] } } });
    })).rejects.toBeDefined();
    const base = await db.workSchedule.findFirstOrThrow({ where: { employeeId: nightId, effectiveFrom: new Date("2030-01-21"), supersededAt: null } });
    await expect(db.$transaction(async tx => {
      await tx.workSchedule.update({ where: { id: base.id }, data: { effectiveUntil: new Date("2030-02-01"), revision: { increment: 1 } } });
      await tx.scheduleSlot.create({ data: { workScheduleId: base.id, ...slot(4) } });
    })).rejects.toBeDefined();
  });
  it("offboarding cancels future work while preserving open attendance and revoking own actions", async () => {
    const monday = await db.scheduleSlot.findFirstOrThrow({ where: { workSchedule: { employeeId: nightId, effectiveFrom: new Date("2030-01-21") }, weekday: 1 } });
    at("2030-01-28T00:00:00Z"); nightSession = (await attendance.checkIn(night, checkin(monday.id, "2030-01-28"))).id;
    const before = await db.attendanceSession.findUniqueOrThrow({ where: { id: nightSession } });
    await (await import("@/features/people/service")).deactivateEmployee(admin, { employeeId: nightId, reason: "End employment with factual open attendance retained" });
    expect(await db.attendanceSession.findUniqueOrThrow({ where: { id: nightSession } })).toEqual(before);
    await expect(attendance.checkOut(night, checkout(nightSession))).rejects.toMatchObject({ status: 401 });
    expect((await db.workSchedule.findFirstOrThrow({ where: { employeeId: nightId, effectiveFrom: new Date("2030-01-21") } })).effectiveUntil?.toISOString()).toBe("2030-01-29T00:00:00.000Z");
  });

  it("keeps runtime timestamps in UTC and reads the correct instant even with a non-UTC SQL session", async () => {
    expect((await db.$queryRaw<{ TimeZone: string }[]>`SHOW timezone`)[0].TimeZone).toBe("UTC");
    const before = (await database.owner.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
    const official = await db.$transaction(async tx => { await tx.$executeRaw`SET LOCAL timezone TO 'Asia/Shanghai'`; return realDatabaseNow(tx); });
    const after = (await database.owner.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
    expect(official.getTime()).toBeGreaterThanOrEqual(Math.floor(before.getTime() / 1000) * 1000);
    expect(official.getTime()).toBeLessThanOrEqual(after.getTime());
    const row = await db.attendanceSession.findUniqueOrThrow({ where: { id: nightSession } });
    expect(row.checkinAt.toISOString()).toBe("2030-01-28T00:00:00.000Z");
  });

});
