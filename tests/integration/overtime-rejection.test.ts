import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { testPostgres } from "../postgres";
import type { Identity } from "@/types/auth";
import type { PrismaClient } from "@/generated/prisma/client";
import type * as Overtime from "@/features/review/overtime";
import type * as Corrections from "@/features/review/corrections";
let database: Awaited<ReturnType<typeof testPostgres>>, db: PrismaClient;
let overtime: typeof Overtime, corrections: typeof Corrections;
let admin: Identity, hr: Identity, actionIdentity: Identity;
vi.mock("@/lib/auth/request", () => ({ assertMutationOrigin: async () => {}, getIdentity: async () => actionIdentity }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const identity = (userId: string): Identity => ({userId, sessionVersion: 1, issuedAt: Date.now(), absoluteExpiresAt: Date.now() + 43200000});
beforeAll(async () => {
  database = await testPostgres(); process.env.DATABASE_URL = database.runtimeUrl;
  db = (await import("@/lib/db/client")).db;
  vi.spyOn(await import("@/features/time/clock"), "databaseNow").mockImplementation(async () => new Date("2030-02-11T12:00:00Z"));
  overtime = await import("@/features/review/overtime"); corrections = await import("@/features/review/corrections");
  admin = identity((await db.user.create({data:{email:"reject-admin@example.test",role:"ADMIN",mustChangePassword:false,passwordHash:"synthetic"}})).id);
  hr = identity((await db.user.create({data:{email:"reject-hr@example.test",role:"HR_MANAGER",mustChangePassword:false,passwordHash:"synthetic"}})).id);
  await db.organizationSettings.create({data:{companyName:"Rejection regression",changedBy:admin.userId,earningsEffectiveFrom:new Date("2031-01-01"),overtimePolicyVersions:[{effectiveFrom:"2020-01-06",thresholdSeconds:18000,ruleVersion:1}]}});
});
afterAll(async () => { vi.restoreAllMocks(); await db?.$disconnect(); await database?.stop(); });
async function pending(role: "EMPLOYEE" | "HR_MANAGER" = "EMPLOYEE") {
  const key = randomUUID(), user = await db.user.create({data:{email:`${key}@example.test`,role,mustChangePassword:false,passwordHash:"synthetic"}});
  const employee = await db.employee.create({data:{userId:user.id,legalName:"Overtime regression",employeeNumber:key.slice(0,24),createdBy:admin.userId,employmentPeriods:{create:{startDate:new Date("2020-01-01"),departmentLabel:"Operations",positionLabel:"Associate",createdBy:admin.userId}}},include:{employmentPeriods:true}});
  const who = identity(user.id);
  const request = await corrections.submitCorrection(who,{type:"ADD",workDate:"2030-01-07",checkinAt:"2030-01-07T03:00:00Z",checkoutAt:"2030-01-07T11:00:00Z",reason:"Verified eight-hour session",operationKey:randomUUID()});
  await corrections.decideCorrection(admin,{id:request,decision:"APPROVED",comment:"Evidence checked"});
  const sessions = await db.attendanceSession.findMany({where:{employeeId:employee.id}});
  const row = await overtime.calculateOvertime(hr,{employeeId:employee.id,week:"2030-01-07"});
  return {who,employee,row,sessions};
}
const rejection = (row: {id:string;revision:number}, comment = "") => ({id:row.id,revision:row.revision,decision:"REJECTED",approvedSeconds:0,comment});
it.each(["", "Evidence checked"])("reproduces Reject with prefilled positive hours and reason %j", async comment => {
  const {row} = await pending(); actionIdentity = hr;
  const form = new FormData();
  Object.entries({kind:"overtimeDecision",id:row.id,revision:String(row.revision),decision:"REJECTED",approvedHours:"3",approvedMinutes:"0",approvedRemainder:"0",comment}).forEach(([k,v])=>form.set(k,v));
  const result = await (await import("@/features/review/actions")).reviewAction({},form);
  expect(result.error).toBeUndefined(); expect(result.success).toBeTruthy();
  expect(await db.overtimeReview.findUniqueOrThrow({where:{id:row.id}})).toMatchObject({status:"REJECTED",approvedSeconds:0,reviewedBy:hr.userId});
});
it.each(["HR", "Admin"])("%s rejection persists, retains attendance and writes one audit and notification", async role => {
  const {who,employee,row,sessions} = await pending(), reviewer = role === "HR" ? hr : admin;
  await overtime.decideOvertime(reviewer,rejection(row,"Evidence does not support overtime approval"));
  const saved = await db.overtimeReview.findUniqueOrThrow({where:{id:row.id}});
  expect(saved).toMatchObject({status:"REJECTED",reviewedBy:reviewer.userId,reviewedAt:new Date("2030-02-11T12:00:00Z"),reviewComment:"Evidence does not support overtime approval",revision:row.revision+1});
  expect(await db.attendanceSession.findMany({where:{employeeId:employee.id}})).toEqual(sessions);
  const own = await overtime.overtimeData(who,employee.id,"2030-01-07",true);
  expect(own.row?.status).toBe("REJECTED"); expect(own.activeApprovedSeconds).toBe(0); expect(own.allocation).toEqual([]);
  expect(await db.auditLog.count({where:{entityId:row.id,action:"OVERTIME_REJECTED",actorUserId:reviewer.userId}})).toBe(1);
  expect(await db.notification.findMany({where:{sourceId:row.id,eventType:"OVERTIME_DECIDED",recipientUserId:who.userId}})).toMatchObject([{text:"Your weekly overtime review was rejected."}]);
  const refreshed = await overtime.calculateOvertime(hr,{employeeId:employee.id,week:"2030-01-07"});
  expect(refreshed).toMatchObject({status:"REJECTED",revision:saved.revision});
  expect((await overtime.overtimeQueue(hr,{status:"PENDING"})).records.some(r=>r.id===row.id)).toBe(false);
});
it("excludes rejected overtime from the actual salary capture and calculation engine", async () => {
  const {employee,row} = await pending(); await overtime.decideOvertime(hr,rejection(row));
  await (await import("@/features/pay/rates")).publishRate(hr,{employeeId:employee.id,employmentPeriodId:employee.employmentPeriods[0].id,effectiveFrom:"2020-01-01",effectiveUntil:"",payType:"HOURLY",baseAmount:"20",overtimeHourlyEquivalent:"",overtimeMultiplier:"1.5",reason:"Agreed hourly terms"});
  const p = await import("@/features/pay/periods"), id = await p.createPeriod(admin,{month:"2030-01"});
  const captured = await (await import("@/features/pay/capture")).captureEmployee(db,await db.salaryPeriod.findUniqueOrThrow({where:{id}}),employee.id,new Date("2030-02-11T12:00:00Z"));
  expect(captured.days.every(day=>day.approvedOvertime.length===0)).toBe(true);
  const output = (await import("@/features/pay/engine")).calculatePay(captured);
  expect(output.overtimeAmount).toBe("0.00"); expect(output.baseAmount).toBe("160.00");
});
it("denies employees, unauthenticated callers and HR self review", async () => {
  const ordinary = await pending(), self = await pending("HR_MANAGER");
  await expect(overtime.decideOvertime(ordinary.who,rejection(ordinary.row))).rejects.toMatchObject({status:403});
  await expect(overtime.decideOvertime(null,rejection(ordinary.row))).rejects.toMatchObject({status:401});
  await expect(overtime.decideOvertime(self.who,rejection(self.row))).rejects.toMatchObject({code:"SELF_REVIEW"});
  await expect(overtime.overtimeData(ordinary.who,self.employee.id,"2030-01-07",true)).rejects.toMatchObject({status:404});
});
it("handles concurrent and duplicate decisions without duplicate audit or notifications", async () => {
  const {row} = await pending();
  const results = await Promise.allSettled([overtime.decideOvertime(hr,rejection(row)),overtime.decideOvertime(admin,rejection(row))]);
  expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  // The winning reviewer's identical retry is a no-op; anyone else is told the record is already decided.
  const winner=(await db.overtimeReview.findUniqueOrThrow({where:{id:row.id}})).reviewedBy===hr.userId?hr:admin,other=winner===hr?admin:hr;
  await expect(overtime.decideOvertime(winner,rejection(row))).resolves.toBe(row.id);
  await expect(overtime.decideOvertime(other,rejection(row))).rejects.toMatchObject({code:"ALREADY_REVIEWED"});
  expect(await db.auditLog.count({where:{entityId:row.id,action:"OVERTIME_REJECTED"}})).toBe(1);
  expect(await db.notification.count({where:{sourceId:row.id,eventType:"OVERTIME_DECIDED"}})).toBe(1);
});
it("preserves status on stale revisions, invalid amounts and newer decisions", async () => {
  const {row} = await pending();
  await expect(overtime.decideOvertime(hr,{...rejection(row),revision:row.revision+1})).rejects.toMatchObject({code:"STALE"});
  await expect(overtime.decideOvertime(hr,{...rejection(row),approvedSeconds:1})).rejects.toMatchObject({code:"APPROVAL_AMOUNT"});
  expect((await db.overtimeReview.findUniqueOrThrow({where:{id:row.id}})).status).toBe("PENDING");
  await overtime.decideOvertime(hr,{...rejection(row,"Approved evidence"),decision:"APPROVED",approvedSeconds:3600});
  await expect(overtime.decideOvertime(admin,rejection(row))).rejects.toMatchObject({code:"ALREADY_REVIEWED"});
  expect((await db.overtimeReview.findUniqueOrThrow({where:{id:row.id}})).status).toBe("APPROVED");
});
it("requires a fresh review after changed evidence without restoring rejected overtime pay", async () => {
  const {who,employee,row,sessions}=await pending();await overtime.decideOvertime(hr,rejection(row));
  const request=await corrections.submitCorrection(who,{type:"REPLACE",sessionId:sessions[0].id,workDate:"2030-01-07",checkinAt:"2030-01-07T03:00:00Z",checkoutAt:"2030-01-07T12:00:00Z",reason:"Additional evidence of checkout",operationKey:randomUUID()});
  await corrections.decideCorrection(admin,{id:request,decision:"APPROVED",comment:"Evidence checked"});
  const stale=await overtime.overtimeData(who,employee.id,"2030-01-07",true);expect(stale.row?.status).toBe("STALE");expect(stale.activeApprovedSeconds).toBe(0);
  await expect(overtime.decideOvertime(hr,rejection(row))).rejects.toMatchObject({code:"STALE"});
  const refreshed=await overtime.calculateOvertime(hr,{employeeId:employee.id,week:"2030-01-07"});expect(refreshed.status).toBe("PENDING");
  expect((await overtime.overtimeData(who,employee.id,"2030-01-07",true)).activeApprovedSeconds).toBe(0);
  expect(await db.auditLog.count({where:{entityId:row.id,action:"OVERTIME_REJECTED"}})).toBe(1);
});
it("cannot overwrite a decided overtime record captured in finalized earnings", async () => {
  const {employee,row}=await pending();await overtime.decideOvertime(hr,rejection(row));
  // A synthetic finalized snapshot isolates decision protection from payroll roster setup.
  const frozen=await db.weeklyEarningStatement.create({data:{employeeId:employee.id,weekStartDate:new Date("2030-01-07"),weekEndDate:new Date("2030-01-14"),timezoneSnapshot:"Asia/Dhaka",currency:"BDT",status:"FINALIZED",calculationSnapshot:{formatVersion:1,reviewId:row.id},monthComponents:{},sourceFingerprint:"0".repeat(64),baseAmount:"160",overtimeAmount:"0",commissionAmount:"0",bonusAmount:"0",deductionAmount:"0",otherAmount:"0",finalAmount:"160",calculatedBy:admin.userId,reviewedBy:admin.userId,finalizedBy:admin.userId,finalizedAt:new Date("2030-02-11T12:00:00Z")}});
  const saved=await db.overtimeReview.findUniqueOrThrow({where:{id:row.id}});
  await expect(overtime.decideOvertime(admin,{...rejection(saved),decision:"APPROVED",approvedSeconds:3600,comment:"Attempt to overwrite finalized review"})).rejects.toMatchObject({code:"ALREADY_REVIEWED"});
  expect(await db.weeklyEarningStatement.findUniqueOrThrow({where:{id:frozen.id}})).toEqual(frozen);
  expect(await db.overtimeReview.findUniqueOrThrow({where:{id:row.id}})).toEqual(saved);
});
it("preserves pending state when audit insertion fails inside the transaction", async () => {
  const {row}=await pending();
  const audit=await import("@/lib/db/audit"),failure=vi.spyOn(audit,"audit").mockRejectedValueOnce(new Error("Simulated audit failure"));
  await expect(overtime.decideOvertime(hr,rejection(row))).rejects.toThrow("Simulated audit failure");failure.mockRestore();
  expect((await db.overtimeReview.findUniqueOrThrow({where:{id:row.id}})).status).toBe("PENDING");
  expect(await db.notification.count({where:{sourceId:row.id,eventType:"OVERTIME_DECIDED"}})).toBe(0);
});
