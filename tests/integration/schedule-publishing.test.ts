import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { testPostgres } from "../postgres";
import type { Identity } from "@/types/auth";
import type { PrismaClient } from "@/generated/prisma/client";
import { standardDailyPattern } from "@/features/time/default-pattern";
let database:Awaited<ReturnType<typeof testPostgres>>,db:PrismaClient,admin:Identity;
vi.mock("@/lib/auth/request",()=>({assertMutationOrigin:async()=>{},getIdentity:async()=>admin}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
beforeAll(async()=>{
 database=await testPostgres();process.env.DATABASE_URL=database.runtimeUrl;db=(await import("@/lib/db/client")).db;
 const user=await db.user.create({data:{email:"schedule-admin@example.test",role:"ADMIN",passwordHash:"synthetic",mustChangePassword:false}});
 const issuedAt=Date.now();admin={userId:user.id,sessionVersion:1,issuedAt,absoluteExpiresAt:issuedAt+43200000};
 await db.organizationSettings.create({data:{companyName:"Schedule regression",changedBy:user.id,overtimePolicyVersions:[]}});
 vi.spyOn(await import("@/features/time/clock"),"databaseNow").mockImplementation(async()=>new Date("2030-01-06T18:30:00Z"));
});
afterAll(async()=>{vi.restoreAllMocks();await db?.$disconnect();await database?.stop();});
async function fixture(){
 const key=randomUUID(),user=await db.user.create({data:{email:key+"@example.test",role:"EMPLOYEE",passwordHash:"synthetic",mustChangePassword:false}});
 const employee=await db.employee.create({data:{userId:user.id,legalName:"Schedule fixture",employeeNumber:key.slice(0,24),createdBy:admin.userId,employmentPeriods:{create:{startDate:new Date("2020-01-01"),departmentLabel:"Operations",positionLabel:"Associate",createdBy:admin.userId}}},include:{employmentPeriods:true}});
 const form=new FormData();Object.entries({employeeId:employee.id,employmentPeriodId:employee.employmentPeriods[0].id,effectiveFrom:"2030-01-07",effectiveUntil:"",label:"Six-day recurring",reason:"Weekly Work Hour",duration:"INDEFINITE"}).forEach(([k,v])=>form.set(k,v));
 standardDailyPattern([1,2,3,4,5,6],480).forEach((s,key)=>{
  form.append("slotKey",String(key));form.set(`weekday-${key}`,String(s.weekday));form.set(`start-${key}`,`${String(Math.floor(s.startMinute/60)).padStart(2,"0")}:${String(s.startMinute%60).padStart(2,"0")}`);form.set(`end-${key}`,`${String(Math.floor(s.endMinute/60)).padStart(2,"0")}:${String(s.endMinute%60).padStart(2,"0")}`);form.set(`endday-${key}`,String(s.endDayOffset));
 });return {employee,form,who:{...admin,userId:user.id}};
}
it("publishes the actual six-day form atomically with twelve periods and organization-local dates",async()=>{
 const {employee,form}=await fixture();const result=await(await import("@/features/time/actions")).publishAction({},form);
 expect(result.error).toBeUndefined();expect(result.success).toBeTruthy();
 const rows=await db.workSchedule.findMany({where:{employeeId:employee.id},include:{slots:true}});expect(rows).toHaveLength(1);expect(rows[0].slots).toHaveLength(12);expect(rows[0].effectiveFrom.toISOString()).toBe("2030-01-07T00:00:00.000Z");expect(rows[0].effectiveUntil).toBeNull();
 expect([...new Set(rows[0].slots.map(s=>s.weekday))].sort()).toEqual([1,2,3,4,5,6]);expect(rows[0].slots.reduce((sum,s)=>sum+s.endMinute+s.endDayOffset*1440-s.startMinute,0)).toBe(48*60);
});
it("reports an existing assignment clearly and never adds records on repeat submission",async()=>{
 const {employee,form}=await fixture(),action=(await import("@/features/time/actions")).publishAction;
 expect((await action({},form)).success).toBeTruthy();const before=await db.workSchedule.findMany({where:{employeeId:employee.id},include:{slots:true}});
 const duplicate=await action({},form);expect(duplicate.error).toMatch(/existing assignment|future replacement/i);
 expect(await db.workSchedule.findMany({where:{employeeId:employee.id},include:{slots:true}})).toEqual(before);
});
it("classifies native assignment collisions for direct schedule requests",async()=>{
 const {employee,form}=await fixture();await(await import("@/features/time/actions")).publishAction({},form);
 const input={employeeId:employee.id,employmentPeriodId:employee.employmentPeriods[0].id,effectiveFrom:"2030-01-07",effectiveUntil:"",label:"Six-day recurring",reason:"Weekly Work Hour",duration:"INDEFINITE",slots:standardDailyPattern([1,2,3,4,5,6],480)};
 await expect((await import("@/features/time/schedules")).publishSchedule(admin,input)).rejects.toMatchObject({code:"SCHEDULE_CONFLICT",status:409});
});
it("allows one concurrent publication and retains one complete audit/activity outcome",async()=>{
 const {employee,form}=await fixture(),action=(await import("@/features/time/actions")).publishAction;
 const results=await Promise.all([action({},form),action({},form)]);expect(results.filter(r=>r.success)).toHaveLength(1);expect(results.filter(r=>r.error)).toHaveLength(1);
 const rows=await db.workSchedule.findMany({where:{employeeId:employee.id},include:{slots:true}});expect(rows).toHaveLength(1);expect(rows[0].slots).toHaveLength(12);
 expect(await db.auditLog.count({where:{employeeId:employee.id,action:"SCHEDULE_CREATED"}})).toBe(1);expect(await db.employeeActivity.count({where:{employeeId:employee.id,type:"SCHEDULE_CREATED"}})).toBe(1);
});
it("rejects invalid overlapping daily periods without saving partial assignments",async()=>{
 const {employee,form}=await fixture();form.set("start-1","10:00");form.set("end-1","14:00");
 expect((await(await import("@/features/time/actions")).publishAction({},form)).error).toMatch(/overlap/i);
 expect(await db.workSchedule.count({where:{employeeId:employee.id}})).toBe(0);expect(await db.auditLog.count({where:{employeeId:employee.id,action:"SCHEDULE_CREATED"}})).toBe(0);
});
it.each([['WEEK','',"2030-01-14"],['CUSTOM','2030-01-10',"2030-01-10"]])("publishes %s effective bounds",async(duration,end,expectedEnd)=>{
 const {employee,form}=await fixture();form.set("duration",duration);form.set("effectiveUntil",end);
 if(duration==='WEEK')form.set("holidayWorkRequired","on");
 expect((await(await import("@/features/time/actions")).publishAction({},form)).success).toBeTruthy();
 expect((await db.workSchedule.findFirstOrThrow({where:{employeeId:employee.id}})).effectiveUntil?.toISOString()).toBe(expectedEnd+"T00:00:00.000Z");
});
it("resolves the six-day pattern in Asia/Dhaka and scopes employee visibility",async()=>{
 const {employee,form,who}=await fixture();expect((await(await import("@/features/time/actions")).publishAction({},form)).success).toBeTruthy();
 const data=await import("@/features/time/data"),own=await data.ownSchedule(who);expect(own?.today).toBe("2030-01-07");expect(own?.timezone).toBe("Asia/Dhaka");expect(own?.scheduledSeconds).toBe(48*3600);
 expect(own?.periods.map(p=>[p.scheduledStartAt.toISOString(),p.scheduledEndAt.toISOString()])).toEqual([["2030-01-07T02:00:00.000Z","2030-01-07T06:00:00.000Z"],["2030-01-07T10:00:00.000Z","2030-01-07T14:00:00.000Z"]]);
 const other=await fixture();await expect(data.employeeSchedule(other.who,employee.id,{},true)).rejects.toMatchObject({status:404});
 await expect((await import("@/features/time/schedules")).publishSchedule(who,{employeeId:employee.id,employmentPeriodId:employee.employmentPeriods[0].id,effectiveFrom:"2030-01-14",effectiveUntil:"",label:"",reason:"Not authorized",slots:[]})).rejects.toMatchObject({status:403});
});
it("publishes an explicit future replacement while retaining the prior period history",async()=>{
 const {employee,form}=await fixture(),action=(await import("@/features/time/actions")).publishAction;expect((await action({},form)).success).toBeTruthy();
 const original=await db.workSchedule.findFirstOrThrow({where:{employeeId:employee.id},include:{slots:true}});form.set("baseScheduleId",original.id);form.set("baseRevision",String(original.revision));form.delete("duration");form.set("editScope","FUTURE");form.set("effectiveFrom","2030-01-08");
 expect((await action({},form)).success).toBeTruthy();const saved=await db.workSchedule.findUniqueOrThrow({where:{id:original.id},include:{slots:true}});expect(saved.slots).toEqual(original.slots);expect(saved.effectiveUntil?.toISOString()).toBe("2030-01-08T00:00:00.000Z");
 const rows=await db.workSchedule.findMany({where:{employeeId:employee.id},include:{slots:true}});expect(rows).toHaveLength(2);expect(rows.find(r=>r.id!==original.id)?.slots).toHaveLength(12);
});
it("rolls back an entire future replacement when audit insertion fails",async()=>{
 const {employee,form}=await fixture(),action=(await import("@/features/time/actions")).publishAction;expect((await action({},form)).success).toBeTruthy();
 const before=await db.workSchedule.findMany({where:{employeeId:employee.id},include:{slots:true}}),base=before[0];form.set("baseScheduleId",base.id);form.set("baseRevision",String(base.revision));form.delete("duration");form.set("editScope","FUTURE");form.set("effectiveFrom","2030-01-08");
 const mocked=vi.spyOn(await import("@/lib/db/audit"),"audit").mockRejectedValueOnce(new Error("Synthetic audit interruption"));
 expect((await action({},form)).error).toBeTruthy();mocked.mockRestore();
 expect(await db.workSchedule.findMany({where:{employeeId:employee.id},include:{slots:true}})).toEqual(before);
 expect(await db.auditLog.count({where:{employeeId:employee.id,action:"SCHEDULE_REPLACED"}})).toBe(0);
});
