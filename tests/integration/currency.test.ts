import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { testPostgres } from "../postgres";
import type { Identity } from "@/types/auth";

it("allows only Admin prospective changes, blocks open money, and retains finalized BDT reports", async () => {
  const database = await testPostgres();
  process.env.DATABASE_URL = database.runtimeUrl;
  const { db } = await import("@/lib/db/client");
  try {
    const user = await db.user.create({data:{email:"admin@currency.test",role:"ADMIN",passwordHash:"synthetic",mustChangePassword:false}});
    const hr = await db.user.create({data:{email:"hr@currency.test",role:"HR_MANAGER",passwordHash:"synthetic",mustChangePassword:false}});
    const identity = (id: string): Identity => ({userId:id,sessionVersion:1,issuedAt:Date.now(),absoluteExpiresAt:Date.now()+43200000});
    await db.organizationSettings.create({data:{companyName:"Currency test",changedBy:user.id,overtimePolicyVersions:[]}});
    const { updateSettings } = await import("@/features/settings/service");
    const settings = {companyName:"Currency test",timezone:"Asia/Dhaka",earlyCheckinMinutes:5};
    expect((await db.organizationSettings.findUniqueOrThrow({where:{id:1}})).currency).toBe("BDT");
    await expect(updateSettings(identity(hr.id),{...settings,currency:"USD"})).rejects.toMatchObject({status:403});
    await expect(updateSettings(identity(user.id),{...settings,currency:"ZZZ"})).rejects.toMatchObject({status:400});
    const employee = await db.employee.create({data:{userId:user.id,employeeNumber:"CUR-001",legalName:"Currency test",createdBy:user.id,employmentPeriods:{create:{startDate:new Date("2000-01-01"),departmentLabel:"Operations",positionLabel:"Associate",createdBy:user.id}}}});
    const stint = await db.employmentPeriod.findFirstOrThrow({where:{employeeId:employee.id}});
    const rate = await db.compensationRate.create({data:{employeeId:employee.id,employmentPeriodId:stint.id,effectiveFrom:new Date("2000-01-01"),effectiveUntil:new Date("2000-02-01"),payType:"MONTHLY",baseAmount:"123.45",currency:"BDT",changeReason:"Historical terms",createdBy:user.id}});
    const period = await db.salaryPeriod.create({data:{startDate:new Date("2000-01-01"),endDate:new Date("2000-02-01"),timezoneSnapshot:"Asia/Dhaka",currency:"BDT",createdBy:user.id}});
    await expect(updateSettings(identity(user.id),{...settings,currency:"USD"})).rejects.toMatchObject({code:"CURRENCY_IN_USE"});
    await expect(database.owner.query("UPDATE organization_settings SET currency='USD' WHERE id=1")).rejects.toBeDefined();
    await database.owner.query("UPDATE salary_periods SET status='APPROVED',calculated_input_revision=input_revision,reviewed_by=$2,reviewed_at=now(),approved_by=$2,approved_at=now() WHERE id=$1",[period.id,user.id]);
    await database.owner.query("BEGIN");
    await database.owner.query("SELECT set_config('app.salary_finalizing',$1,true)",[period.id]);
    await database.owner.query("INSERT INTO salary_calculations(id,employee_id,salary_period_id,input_revision,base_amount,overtime_amount,commission_amount,bonus_amount,deduction_amount,other_amount,final_amount,calculation_snapshot,calculated_by,calculated_at,finalized_at) VALUES($1,$2,$3,1,123.45,0,0,0,0,0,123.45,$4,$5,now(),now())",[randomUUID(),employee.id,period.id,{formatVersion:1,commissionRelated:false},user.id]);
    await database.owner.query("UPDATE salary_periods SET status='FINALIZED',finalized_by=$2,finalized_at=now() WHERE id=$1",[period.id,user.id]);
    await database.owner.query("COMMIT");
    await updateSettings(identity(user.id),{...settings,currency:"usd"});
    await updateSettings(identity(user.id),settings); // Old API clients do not reset a changed default.
    expect((await db.organizationSettings.findUniqueOrThrow({where:{id:1}})).currency).toBe("USD");
    expect((await db.compensationRate.findUniqueOrThrow({where:{id:rate.id}})).currency).toBe("BDT");
    const { reportData } = await import("@/features/insights/reports");
    const { reportCsv } = await import("@/features/insights/csv");
    const report = await reportData(identity(user.id),"salary",{});
    expect(report.records[0]).toMatchObject({currency:"BDT",final_amount:"123.45"});
    expect(reportCsv(report.columns,report.records)).toContain("BDT");
    const active = {employeeId:employee.id,employmentPeriodId:stint.id,effectiveFrom:new Date("2030-01-01"),payType:"MONTHLY" as const,baseAmount:"50",currency:"USD",changeReason:"Future terms",createdBy:user.id};
    await db.compensationRate.create({data:active});
    await expect(updateSettings(identity(user.id),{...settings,currency:"BDT"})).rejects.toMatchObject({code:"CURRENCY_IN_USE"});
    await expect(database.owner.query("UPDATE organization_settings SET currency='BDT' WHERE id=1")).rejects.toBeDefined();
  } finally {
    await database.owner.query("ROLLBACK");
    await db.$disconnect();
    await database.stop();
  }
});
