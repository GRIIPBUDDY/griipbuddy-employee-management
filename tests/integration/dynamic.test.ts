import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { testPostgres } from "../postgres";
import type { Identity } from "@/types/auth";
import type { PrismaClient } from "@/generated/prisma/client";
import { standardDailyPattern } from "@/features/time/default-pattern";
// Configurable organization: monthly-only payroll, module switches, editable lists, leave balances, rules,
// branding and PDFs/exports. Disposable database and a controlled clock only.
let database: Awaited<ReturnType<typeof testPostgres>>, db: PrismaClient, admin: Identity, hr: Identity, carol: Identity, carolId = "", carolPeriod = "", actionIdentity: Identity;
let now = new Date("2030-02-01T00:00:00Z");
vi.mock("@/lib/auth/request", () => ({ assertMutationOrigin: async () => {}, getIdentity: async () => actionIdentity }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const identity = (userId: string): Identity => { const issuedAt = Date.now(); return { userId, sessionVersion: 1, issuedAt, absoluteExpiresAt: issuedAt + 43200000 }; };
const at = (value: string) => { now = new Date(value); };
const allModules = { tasks: true, shiftSwaps: true, commissions: true, performance: true, warnings: true, assets: true, workRecords: true, weeklyEarnings: false };
async function attend(date: string, from = "02:00", until = "14:00") {
  const corrections = await import("@/features/review/corrections");
  for (const [start, end] of from === "02:00" && until === "14:00" ? [["02:00", "06:00"], ["10:00", "14:00"]] : [[from, until]]) {
    const id = await corrections.submitCorrection(hr, { type: "ADD", workDate: date, checkinAt: `${date}T${start}:00Z`, checkoutAt: `${date}T${end}:00Z`, reason: "Synthetic attendance", operationKey: randomUUID() }, carolId);
    await corrections.decideCorrection(admin, { id, decision: "APPROVED", comment: "Verified" });
  }
}
beforeAll(async () => {
  database = await testPostgres(); process.env.DATABASE_URL = database.runtimeUrl; db = (await import("@/lib/db/client")).db;
  vi.spyOn(await import("@/features/time/clock"), "databaseNow").mockImplementation(async () => new Date(now));
  const make = (email: string, role: "ADMIN" | "HR_MANAGER" | "EMPLOYEE") => db.user.create({ data: { email, role, displayName: email.split("@")[0], passwordHash: "synthetic", mustChangePassword: false } });
  const a = await make("dynamic-admin@example.test", "ADMIN"), h = await make("dynamic-hr@example.test", "HR_MANAGER"), c = await make("carol@example.test", "EMPLOYEE");
  admin = identity(a.id); hr = identity(h.id); carol = identity(c.id); actionIdentity = admin;
  await db.organizationSettings.create({ data: { companyName: "Dynamic regression", timezone: "Asia/Dhaka", changedBy: a.id, overtimePolicyVersions: [{ effectiveFrom: "2020-01-06", thresholdSeconds: 172800, ruleVersion: 1 }] } });
  const employee = await db.employee.create({ data: { userId: c.id, legalName: "Carol Monthly", employeeNumber: "CAR", createdBy: a.id, employmentPeriods: { create: { startDate: new Date("2020-01-01"), departmentLabel: "Operations", positionLabel: "Associate", createdBy: a.id } } }, include: { employmentPeriods: true } });
  carolId = employee.id; carolPeriod = employee.employmentPeriods[0].id;
  // Mon–Sat 08:00–12:00 and 16:00–20:00 (48 h a week); monthly terms ৳30,000 with a ৳150 overtime rate.
  await (await import("@/features/time/schedules")).publishSchedule(admin, { employeeId: carolId, employmentPeriodId: carolPeriod, effectiveFrom: "2030-02-01", effectiveUntil: "", label: "Split", reason: "Weekly Work Hour", duration: "INDEFINITE", slots: standardDailyPattern([1, 2, 3, 4, 5, 6], 480) });
  await (await import("@/features/pay/rates")).publishRate(admin, { employeeId: carolId, employmentPeriodId: carolPeriod, effectiveFrom: "2030-02-01", payType: "MONTHLY", baseAmount: "30000", overtimeHourlyRate: "150", overtimeMultiplier: "1", reason: "Offer letter" });
});
afterAll(async () => { vi.restoreAllMocks(); await db?.$disconnect(); await database?.stop(); });
it("the migration seeds every previously fixed list and starts with monthly pay and weekly statements off", async () => {
  const lists = await db.optionItem.groupBy({ by: ["list"], _count: true });
  expect(Object.fromEntries(lists.map(l => [l.list, l._count]))).toEqual({ LEAVE_CATEGORY: 6, ASSET_TYPE: 6, DOCUMENT_TYPE: 7, EMPLOYMENT_TYPE: 5, ADJUSTMENT_CATEGORY: 4 });
  const config = await import("@/features/settings/config");
  expect((await config.enabledModules()).weeklyEarnings).toBe(false);
  expect((await db.optionItem.findUniqueOrThrow({ where: { list_code: { list: "LEAVE_CATEGORY", code: "UNPAID" } } })).attributes).toMatchObject({ paid: false });
});
it("monthly salary is calculated straight from attendance, closes without weekly statements and exports payslips and payments", async () => {
  at("2030-03-31T00:00:00Z"); await attend("2030-03-04"); await attend("2030-03-05");
  const updatePayout = (await import("@/features/pay/payout")).updatePayout;
  await updatePayout(admin, { employeeId: carolId, method: "BKASH", accountName: "Carol Monthly", accountNumber: "01700000001", bankName: "", branch: "", routingNumber: "", reason: "Employee form" });
  at("2030-04-02T00:00:00Z"); // the month and its last overtime week (ending Sunday 31 March) have ended
  const p = await import("@/features/pay/periods"), id = await p.createPeriod(admin, { month: "2030-03" });
  expect((await db.salaryPeriod.findUniqueOrThrow({ where: { id } })).calculationMethod).toBe("MONTHLY_ATTENDANCE");
  const revision = async () => (await db.salaryPeriod.findUniqueOrThrow({ where: { id } })).inputRevision;
  await p.calculatePeriod(admin, { periodId: id, revision: await revision() });
  const row = await db.salaryCalculation.findFirstOrThrow({ where: { salaryPeriodId: id, employeeId: carolId } });
  // 26 scheduled days × 8 h = 208 planned hours; 16 covered hours of ৳30,000.
  expect(row.baseAmount.toFixed(2)).toBe("2307.69"); expect((row.calculationSnapshot as { formulaVersion: string }).formulaVersion).toBe("attendance-month-v2");
  expect(await db.weeklyEarningStatement.count()).toBe(0);
  for (const status of ["REVIEWED", "APPROVED", "FINALIZED"] as const) await p.transitionPeriod(admin, { periodId: id, revision: await revision(), status });
  const docs = await import("@/features/pay/documents");
  const slip = await docs.payslipPdf(carol, row.id, true);
  expect(Buffer.from(slip.bytes).subarray(0, 5).toString()).toBe("%PDF-"); expect(slip.filename).toBe("payslip-2030-03-CAR.pdf");
  const csv = await docs.paymentExport(hr, id);
  expect(csv.csv).toContain('"bKash"'); expect(csv.csv).toContain('"01700000001"'); expect(csv.csv).toContain('"2307.69"');
  expect(Buffer.from((await docs.registerPdf(hr, id)).bytes).subarray(0, 5).toString()).toBe("%PDF-");
  await expect(docs.payslipPdf(carol, row.id, false)).rejects.toMatchObject({ status: 403 });
  const audit = await db.auditLog.findFirstOrThrow({ where: { action: "PAYOUT_DETAILS_CHANGED" } });
  expect(JSON.stringify(audit.after)).not.toContain("01700000001");
});
it("an open weekly-ledger month without finalized weekly statements moves to the monthly method; other changes stay blocked", async () => {
  const p = await import("@/features/pay/periods");
  const legacy = await db.salaryPeriod.create({ data: { startDate: new Date("2030-04-01"), endDate: new Date("2030-05-01"), timezoneSnapshot: "Asia/Dhaka", currency: "BDT", calculationMethod: "WEEKLY_ATTENDANCE", createdBy: admin.userId } });
  await p.calculatePeriod(admin, { periodId: legacy.id, revision: legacy.inputRevision });
  expect((await db.salaryPeriod.findUniqueOrThrow({ where: { id: legacy.id } })).calculationMethod).toBe("MONTHLY_ATTENDANCE");
  expect(await db.auditLog.count({ where: { action: "SALARY_PERIOD_METHOD_CHANGED", entityId: legacy.id } })).toBe(1);
  const old = await db.salaryPeriod.create({ data: { startDate: new Date("2029-01-01"), endDate: new Date("2029-02-01"), timezoneSnapshot: "Asia/Dhaka", currency: "BDT", calculationMethod: "LEGACY_MONTHLY", createdBy: admin.userId } });
  await expect(db.salaryPeriod.update({ where: { id: old.id }, data: { calculationMethod: "MONTHLY_ATTENDANCE" } })).rejects.toThrow();
});
it("adjustment types come from the list and keep the payroll sign rules", async () => {
  const adjustments = await import("@/features/pay/adjustments"), period = (await db.salaryPeriod.findFirstOrThrow({ where: { startDate: new Date("2030-04-01") } })).id;
  const id = await adjustments.createAdjustment(hr, { employeeId: carolId, periodId: period, type: "ALLOWANCE", amount: "500", reason: "Transport", operationKey: randomUUID() });
  expect(await db.salaryAdjustment.findUniqueOrThrow({ where: { id }, select: { type: true, category: true } })).toEqual({ type: "BONUS", category: "ALLOWANCE" });
  await expect(adjustments.createAdjustment(hr, { employeeId: carolId, periodId: period, type: "ALLOWANCE", amount: "-5", reason: "Wrong sign", operationKey: randomUUID() })).rejects.toMatchObject({ code: "AMOUNT_SIGN" });
  await expect(adjustments.createAdjustment(hr, { employeeId: carolId, periodId: period, type: "OTHER", amount: "-50", reason: "Correction", operationKey: randomUUID() })).resolves.toBeTruthy();
  await expect(adjustments.createAdjustment(hr, { employeeId: carolId, periodId: period, type: "UNKNOWN", amount: "5", reason: "No type", operationKey: randomUUID() })).rejects.toMatchObject({ code: "OPTION_INVALID" });
});
it("switched-off modules are unavailable on the server and come back with their records", async () => {
  const s = await import("@/features/settings/organization"), tasks = await import("@/features/tasks/service");
  await s.updateModules(admin, { ...allModules, tasks: false, assets: false });
  await expect(tasks.taskData(admin, {})).rejects.toMatchObject({ status: 404, code: "MODULE_DISABLED" });
  await expect((await import("@/features/people-operations/assets")).assetData(admin, {})).rejects.toMatchObject({ status: 404 });
  await expect(s.updateModules(hr, allModules)).rejects.toMatchObject({ status: 403 });
  await s.updateModules(admin, allModules);
  await expect(tasks.taskData(admin, {})).resolves.toBeTruthy();
  expect(await db.auditLog.count({ where: { action: "MODULES_CHANGED" } })).toBe(2);
});
it("editable lists validate new records, keep historical codes and are admin-only", async () => {
  const s = await import("@/features/settings/organization"), assets = await import("@/features/people-operations/assets");
  await expect(assets.createAsset(hr, { assetCode: "TAB-1", type: "TABLET", name: "Tablet", condition: "New" })).rejects.toMatchObject({ code: "OPTION_INVALID" });
  await s.createOption(admin, { list: "ASSET_TYPE", code: "tablet", label: "Tablet", sortOrder: 70 });
  const id = await assets.createAsset(hr, { assetCode: "TAB-1", type: "TABLET", name: "Tablet", condition: "New" });
  await expect(s.createOption(admin, { list: "ASSET_TYPE", code: "TABLET", label: "Again" })).rejects.toMatchObject({ code: "OPTION_EXISTS" });
  await expect(s.createOption(hr, { list: "ASSET_TYPE", code: "DRONE", label: "Drone" })).rejects.toMatchObject({ status: 403 });
  const tablet = await db.optionItem.findUniqueOrThrow({ where: { list_code: { list: "ASSET_TYPE", code: "TABLET" } } });
  await s.updateOption(admin, { list: "ASSET_TYPE", code: "TABLET", label: "Tablet", sortOrder: 70, isActive: false, revision: tablet.revision });
  const asset = await db.asset.findUniqueOrThrow({ where: { id } });
  // An unchanged historical code stays valid when the record is edited; new records cannot use it.
  await expect(assets.editAsset(hr, { id, revision: asset.revision, data: { assetCode: "TAB-1", type: "TABLET", name: "Tablet (renamed)", condition: "Good" }, reason: "Rename" })).resolves.toBeUndefined();
  await expect(assets.createAsset(hr, { assetCode: "TAB-2", type: "TABLET", name: "Tablet", condition: "New" })).rejects.toMatchObject({ code: "OPTION_INVALID" });
  await expect(db.optionItem.delete({ where: { id: tablet.id } })).rejects.toThrow();
});
it("leave balances block or flag requests over the yearly allowance, and per-employee allowances override the default", async () => {
  const s = await import("@/features/settings/organization"), absence = await import("@/features/review/absence"), balance = await import("@/features/review/leave-balance");
  await s.createOption(admin, { list: "LEAVE_CATEGORY", code: "STUDY", label: "Study leave", paid: true, yearlyDays: 2 });
  // Monday–Wednesday: three working days.
  const request = { startDate: "2030-05-06", endDate: "2030-05-08", category: "STUDY", reason: "Exam", operationKey: randomUUID() };
  await expect(absence.requestDatedLeave(carol, request)).rejects.toMatchObject({ code: "LEAVE_BALANCE" });
  await expect(absence.requestDatedLeave(carol, { ...request, category: "UNPAID", type: "PAID", operationKey: randomUUID() })).rejects.toMatchObject({ status: 400 });
  const rules = { earlyCheckinMinutes: 10, lateGraceMinutes: 0, workingDays: [1, 2, 3, 4, 5, 6], leaveDayBasis: "WORKING", leaveOverBalance: "FLAG", salaryPaymentDay: "" };
  await s.updateRules(admin, rules);
  const leaveId = await absence.requestDatedLeave(carol, { ...request, operationKey: randomUUID() });
  expect((await db.leaveRequest.findUniqueOrThrow({ where: { id: leaveId } })).type).toBe("PAID");
  const staffView = await absence.absenceData(hr, true, 1, leaveId);
  expect(staffView.records[0].overBalance[0]).toMatch(/Study leave 2030: 3 days requested, 2 available/);
  await balance.setLeaveAllowance(hr, { employeeId: carolId, year: 2030, category: "STUDY", days: 5, reason: "Approved study plan" });
  expect((await absence.absenceData(hr, true, 1, leaveId)).records[0].overBalance).toEqual([]);
  const mine = await balance.balanceData(carol, { year: 2030 });
  expect(mine!.balances.find(b => b.category === "STUDY")).toMatchObject({ entitlement: 5, override: true, used: 0, pending: 3, available: 2 });
  // Calendar-day counting includes the weekly day off.
  expect(await balance.leaveDays(db, new Date("2030-05-04T18:00:00Z"), new Date("2030-05-06T18:00:00Z"), { timezone: "Asia/Dhaka", workingDays: [1, 2, 3, 4, 5, 6], leaveDayBasis: "CALENDAR" })).toBe(2);
  expect(await balance.leaveDays(db, new Date("2030-05-04T18:00:00Z"), new Date("2030-05-06T18:00:00Z"), { timezone: "Asia/Dhaka", workingDays: [1, 2, 3, 4, 5, 6], leaveDayBasis: "WORKING" })).toBe(1);
  await expect(s.updateRules(admin, { ...rules, workingDays: [] })).rejects.toMatchObject({ status: 400 });
});
it("the late grace period decides when an arrival counts as late", async () => {
  at("2030-02-05T18:00:00Z"); await attend("2030-02-04", "02:03", "06:00");
  const { summary } = await import("@/features/review/summary"), s = await import("@/features/settings/organization");
  expect((await summary(db, carolId, "2030-02-04", "2030-02-05", now)).days[0].lateSeconds).toBe(180);
  await s.updateRules(admin, { earlyCheckinMinutes: 10, lateGraceMinutes: 5, workingDays: [1, 2, 3, 4, 5, 6], leaveDayBasis: "WORKING", leaveOverBalance: "FLAG", salaryPaymentDay: "7" });
  expect((await summary(db, carolId, "2030-02-04", "2030-02-05", now)).days[0].lateSeconds).toBe(0);
  const report = await (await import("@/features/insights/reports")).reportData(hr, "lateness", { range: "custom", from: "2030-02-04", to: "2030-02-04", employeeId: carolId });
  // The 08:03 arrival is within the grace period; the missed afternoon period is an absence.
  expect(report.records[0]).toMatchObject({ employee_number: "CAR", late_count: 0, absence_count: 1, status: "ABSENT" });
  const pdf = await (await import("@/features/insights/report-pdf")).reportPdf(hr, "lateness", { range: "custom", from: "2030-02-04", to: "2030-02-04" });
  expect(Buffer.from(pdf.bytes).subarray(0, 5).toString()).toBe("%PDF-");
});
it("branding requires readable colors and stores a normalized logo", async () => {
  const s = await import("@/features/settings/organization");
  await expect(s.updateBranding(admin, { companyName: "GriipBuddy", companyLegalName: "GRIIPBUDDY LLC", companyAddress: "1021 E Lincolnway, Cheyenne, Wyoming 82001, United States", brandColor: "#ffd400" })).rejects.toMatchObject({ status: 400 });
  await s.updateBranding(admin, { companyName: "GriipBuddy", companyLegalName: "GRIIPBUDDY LLC", companyAddress: "1021 E Lincolnway, Cheyenne, Wyoming 82001, United States", brandColor: "#4B2A5E" });
  expect(await s.branding()).toMatchObject({ legalName: "GRIIPBUDDY LLC", brandColor: "#4b2a5e", logoRevision: 0 });
  const png = await sharp({ create: { width: 1200, height: 600, channels: 4, background: "#371d3f" } }).png().toBuffer();
  await s.updateLogo(admin, new Blob([new Uint8Array(png)], { type: "image/png" }));
  const meta = await sharp(await s.logoPng()).metadata();
  expect([meta.format, meta.width, meta.height]).toEqual(["png", 512, 512]);
  await expect(s.updateLogo(admin, new Blob([new TextEncoder().encode("not an image")]))).rejects.toMatchObject({ code: "LOGO_FORMAT" });
  await s.resetLogo(admin); expect((await s.branding()).logoRevision).toBe(2);
});
