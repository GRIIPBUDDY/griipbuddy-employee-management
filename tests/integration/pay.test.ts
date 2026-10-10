import { beforeAll,afterAll,it,expect,vi } from "vitest";
import { randomUUID } from "node:crypto";
import { testPostgres } from "../postgres";
import type { Identity } from "@/types/auth";
import type { PrismaClient } from "@/generated/prisma/client";
import type * as Rates from "@/features/pay/rates";
import type * as Periods from "@/features/pay/periods";
import type * as Commissions from "@/features/pay/commissions";
import type * as Adjustments from "@/features/pay/adjustments";
import type * as Reconciliation from "@/features/pay/reconciliation";
import type * as Corrections from "@/features/review/corrections";
import type * as Overtime from "@/features/review/overtime";
let database:Awaited<ReturnType<typeof testPostgres>>,db:PrismaClient,r:typeof Rates,p:typeof Periods,c:typeof Commissions,a:typeof Adjustments,re:typeof Reconciliation,co:typeof Corrections,o:typeof Overtime;
let admin:Identity,hr:Identity,plainHr:Identity,alice:Identity,bob:Identity,aliceId:string,bobId:string,dayId:string,aliceStint:string,bobStint:string,dayStint:string,periodId:string,febId:string,marId:string,orderId:string,adjId:string,bobSession:string,reviewId:string,originalId:string,bobOriginal:string,reconId:string,reconKey:string;
let now=new Date("2029-12-01T12:00:00Z");
const identity=(userId:string,sessionVersion=1):Identity=>({userId,sessionVersion,issuedAt:Date.now(),absoluteExpiresAt:Date.now()+43200000});
const rate=(employeeId:string,employmentPeriodId:string,payType="MONTHLY",baseAmount="3100")=>({employeeId,employmentPeriodId,payType,baseAmount,effectiveFrom:"2020-01-01",effectiveUntil:"",overtimeHourlyEquivalent:payType==="HOURLY"?"":"100",overtimeMultiplier:"1.5",reason:"Agreed terms"});
const current=()=>db.salaryPeriod.findUniqueOrThrow({where:{id:periodId}});
const calculate=async(id=periodId)=>p.calculatePeriod(admin,{periodId:id,revision:(await db.salaryPeriod.findUniqueOrThrow({where:{id}})).inputRevision});
const advance=async(status:"REVIEWED"|"APPROVED"|"FINALIZED",id=periodId)=>p.transitionPeriod(admin,{periodId:id,revision:(await db.salaryPeriod.findUniqueOrThrow({where:{id}})).inputRevision,status});
const claim=(reference:string)=>({reference,reason:"Verified order evidence",orderValue:"123.45"});
const added=(date:string,start:string,end:string)=>({type:"ADD",workDate:date,checkinAt:`${date}T${start}Z`,checkoutAt:`${date}T${end}Z`,reason:"Recorded actual work",operationKey:randomUUID()});
const approve=async(id:string)=>co.decideCorrection(hr,{id,decision:"APPROVED",comment:"Verified evidence"});
beforeAll(async()=>{
 database=await testPostgres();process.env.DATABASE_URL=database.runtimeUrl;db=(await import("@/lib/db/client")).db;
 const clock=await import("@/features/time/clock");vi.spyOn(clock,"databaseNow").mockImplementation(async()=>new Date(now));vi.spyOn(clock,"databaseOrderNow").mockImplementation(async()=>new Date(now));
 r=await import("@/features/pay/rates");p=await import("@/features/pay/periods");c=await import("@/features/pay/commissions");a=await import("@/features/pay/adjustments");re=await import("@/features/pay/reconciliation");co=await import("@/features/review/corrections");o=await import("@/features/review/overtime");
 const u=await db.user.create({data:{email:"pay-admin@example.test",role:"ADMIN",mustChangePassword:false,passwordHash:"synthetic"}});admin=identity(u.id);
 await db.organizationSettings.create({data:{companyName:"Pay tests",changedBy:u.id,overtimePolicyVersions:[{effectiveFrom:"2020-01-06",thresholdSeconds:18000,ruleVersion:1}]}});
 hr=identity((await db.user.create({data:{email:"pay-hr@example.test",role:"HR_MANAGER",mustChangePassword:false,passwordHash:"synthetic",canManageCommissions:true}})).id);
 plainHr=identity((await db.user.create({data:{email:"pay-plainhr@example.test",role:"HR_MANAGER",mustChangePassword:false,passwordHash:"synthetic"}})).id);
 for(const name of ["Alice","Bob","Daily"]){const user=await db.user.create({data:{email:`${name.toLowerCase()}-pay@example.test`,role:"EMPLOYEE",mustChangePassword:false,passwordHash:"synthetic"}}),e=await db.employee.create({data:{userId:user.id,employeeNumber:name,legalName:`${name} Pay`,createdBy:u.id,employmentPeriods:{create:{startDate:new Date("2020-01-01"),departmentLabel:"Operations",positionLabel:"Associate",createdBy:u.id}}},include:{employmentPeriods:true}});
 if(name==="Alice"){alice=identity(user.id);aliceId=e.id;aliceStint=e.employmentPeriods[0].id;}else if(name==="Bob"){bob=identity(user.id);bobId=e.id;bobStint=e.employmentPeriods[0].id;}else{dayId=e.id;dayStint=e.employmentPeriods[0].id;}}
 const schedules=await import("@/features/time/schedules");for(const [employeeId,employmentPeriodId] of [[aliceId,aliceStint],[bobId,bobStint],[dayId,dayStint]])await schedules.publishSchedule(admin,{employeeId,employmentPeriodId,effectiveFrom:"2030-01-01",effectiveUntil:"",label:"Monday work",reason:"Assigned work",slots:[{weekday:1,startMinute:540,endMinute:780,endDayOffset:0}]});
 now=new Date("2030-01-07T12:00:00Z");const security=await import("@/features/accounts/service");await security.updateAccountSecurity(admin,{userId:alice.userId,role:"EMPLOYEE",isActive:true,canManageCommissions:false,preorderCommissionEnabled:true});alice=identity(alice.userId,2);
});
afterAll(async()=>{vi.restoreAllMocks();await db?.$disconnect();await database?.stop();});
it("protects compensation changes and rejects rates outside employment or overlapping history",async()=>{
 await expect(r.publishRate(alice,rate(aliceId,aliceStint))).rejects.toMatchObject({status:403});await expect(r.publishRate(hr,rate(aliceId,bobStint))).rejects.toMatchObject({status:404});
 await r.publishRate(hr,rate(aliceId,aliceStint));await r.publishRate(hr,rate(bobId,bobStint,"HOURLY","10"));await r.publishRate(hr,rate(dayId,dayStint,"DAILY","100"));
 await expect(r.publishRate(hr,rate(aliceId,aliceStint))).rejects.toMatchObject({code:"RATE_OVERLAP"});await expect(r.rateHistory(alice,bobId,true)).rejects.toMatchObject({status:404});
 expect(JSON.stringify(await r.rateHistory(alice,aliceId,true))).not.toContain("changeReason");
});
it("creates one exact calendar-month period with its organization currency and no browser totals",async()=>{
 periodId=await p.createPeriod(hr,{month:"2030-01"});expect(await p.createPeriod(admin,{month:"2030-01"})).toBe(periodId);expect(await current()).toMatchObject({status:"DRAFT",currency:"BDT",startDate:new Date("2030-01-01"),endDate:new Date("2030-02-01")});
 await expect(p.createPeriod(hr,{month:"2030-01",currency:"USD"})).rejects.toMatchObject({status:400});await expect(p.createPeriod(hr,{month:"2030-13"})).rejects.toMatchObject({status:400});await expect(p.calculatePeriod(alice,{periodId,revision:1})).rejects.toMatchObject({status:403});
});
it("estimates monthly, hourly and daily pay using the existing reviewed actual-time services",async()=>{
 const request=await co.submitCorrection(bob,added("2030-01-07","03:00:00","09:00:00"));await approve(request);bobSession=(await db.attendanceCorrection.findUniqueOrThrow({where:{id:request}})).appliedSessionId!;
 const daily=await co.submitCorrection(hr,added("2030-01-07","03:00:00","05:00:00"),dayId);await approve(daily);
 now=new Date("2030-02-11T12:00:00Z");await calculate();const rows=await db.salaryCalculation.findMany({where:{salaryPeriodId:periodId}});
 expect(rows.find(s=>s.employeeId===aliceId)?.baseAmount.toFixed(2)).toBe("3100.00");expect(rows.find(s=>s.employeeId===bobId)?.baseAmount.toFixed(2)).toBe("60.00");expect(rows.find(s=>s.employeeId===dayId)?.baseAmount.toFixed(2)).toBe("50.00");expect(rows.find(s=>s.employeeId===bobId)?.overtimeAmount.toFixed(2)).toBe("0.00");
 await expect(advance("REVIEWED")).rejects.toMatchObject({code:"UNRESOLVED_PAY"});expect((await p.salaryData(alice,{},true)).records).toHaveLength(0);
});
it("includes only approved valid overtime without counting the same hourly seconds twice",async()=>{
 const row=await o.calculateOvertime(hr,{employeeId:bobId,week:"2030-01-07"});reviewId=row.id;await o.decideOvertime(hr,{id:row.id,revision:row.revision,decision:"APPROVED",approvedSeconds:3600,comment:"Agreed overtime"});await calculate();const s=await db.salaryCalculation.findUniqueOrThrow({where:{employeeId_salaryPeriodId:{employeeId:bobId,salaryPeriodId:periodId}}});expect(s).toMatchObject({baseAmount:expect.anything()});expect(s.baseAmount.toFixed(2)).toBe("50.00");expect(s.overtimeAmount.toFixed(2)).toBe("15.00");expect(s.finalAmount.toFixed(2)).toBe("65.00");
});
it("resets unfinished review and revisions when effective compensation changes",async()=>{
 const old=(await r.rateHistory(hr,aliceId)).rates.find(x=>!x.supersededAt)!,before=(await current()).inputRevision;
 await r.publishRate(hr,{...rate(aliceId,aliceStint),baseAmount:"6200",effectiveFrom:"2030-01-16",baseRateId:old.id,revision:old.revision});expect((await current()).inputRevision).toBeGreaterThan(before);expect((await r.rateHistory(hr,aliceId)).rates).toHaveLength(3);await calculate();expect((await db.salaryCalculation.findUniqueOrThrow({where:{employeeId_salaryPeriodId:{employeeId:aliceId,salaryPeriodId:periodId}}})).baseAmount.toFixed(2)).toBe("4700.00");
 await expect(p.transitionPeriod(admin,{periodId,revision:before,status:"REVIEWED"})).rejects.toMatchObject({code:"STALE"});
});
it("gates every own/staff commission path and rejects authoritative employee-supplied fields",async()=>{
 await expect(c.commissionData(bob)).rejects.toMatchObject({status:403});await expect(c.submitPreorder(bob,claim("denied"))).rejects.toMatchObject({status:403});await expect(c.commissionData(plainHr,{},true)).rejects.toMatchObject({status:403});
 for(const extra of [{employeeId:bobId},{commissionAmount:"999"},{orderAt:"2020-01-01T00:00:00Z"}])await expect(c.submitPreorder(alice,{...claim("tamper"),...extra})).rejects.toMatchObject({status:400});
 await expect(c.decidePreorder(alice,{id:randomUUID(),revision:1,decision:"APPROVED",comment:"self"})).rejects.toMatchObject({status:403});
});
it("computes fixed commission on the server and preserves company-wide cancelled reference uniqueness",async()=>{
 await c.updateCommissionPolicy(admin,{type:"FIXED",value:"12.345",reason:"Agreed fixed commission"});now=new Date("2030-01-20T12:00:00Z");orderId=await c.submitPreorder(alice,claim("  order-1  "));
 const row=await db.preorder.findUniqueOrThrow({where:{id:orderId}});expect(row.reference).toBe("ORDER-1");expect(row.commissionAmount.toFixed(2)).toBe("12.35");expect(row.status).toBe("PENDING");
 await expect(c.submitPreorder(alice,claim("order-1"))).rejects.toMatchObject({code:"DUPLICATE_REFERENCE"});const cancelled=await c.submitPreorder(alice,claim("Cancelled-ref"));await c.withdrawPreorder(alice,cancelled);await expect(c.submitPreorder(alice,claim("cancelled-ref"))).rejects.toMatchObject({code:"DUPLICATE_REFERENCE"});
});
it("computes percentage commission and retains old rule snapshots after settings changes",async()=>{
 await c.updateCommissionPolicy(admin,{type:"PERCENT",value:"2.5",reason:"New percentage"});const id=await c.submitPreorder(alice,claim("pct"));expect((await db.preorder.findUniqueOrThrow({where:{id}})).commissionAmount.toFixed(2)).toBe("3.09");expect((await db.preorder.findUniqueOrThrow({where:{id:orderId}})).commissionAmount.toFixed(2)).toBe("12.35");await c.withdrawPreorder(alice,id);
 await expect(c.submitPreorder(alice,{reference:"no-value",reason:"claim"})).rejects.toMatchObject({code:"COMMISSION_RULE"});await expect(c.updateCommissionPolicy(hr,{type:"FIXED",value:"5",reason:"not admin"})).rejects.toMatchObject({status:403});
});
it("excludes pending commission and blocks closeout until assigned and approved or explicitly deferred",async()=>{
 now=new Date("2030-02-11T12:00:00Z");await calculate();expect((await db.salaryCalculation.findUniqueOrThrow({where:{employeeId_salaryPeriodId:{employeeId:aliceId,salaryPeriodId:periodId}}})).commissionAmount.toFixed(2)).toBe("0.00");await expect(advance("REVIEWED")).rejects.toMatchObject({code:"UNRESOLVED_PAY"});
 let row=await db.preorder.findUniqueOrThrow({where:{id:orderId}});await c.assignPreorder(hr,{id:row.id,revision:row.revision,periodId,reason:"Earned in January"});await calculate();await expect(advance("REVIEWED")).rejects.toMatchObject({code:"UNRESOLVED_PAY"});row=await db.preorder.findUniqueOrThrow({where:{id:orderId}});await c.decidePreorder(hr,{id:row.id,revision:row.revision,decision:"APPROVED",comment:"Order verified"});await calculate();expect((await db.salaryCalculation.findUniqueOrThrow({where:{employeeId_salaryPeriodId:{employeeId:aliceId,salaryPeriodId:periodId}}})).commissionAmount.toFixed(2)).toBe("12.35");
});
it("approves a validated adjustment before salary inclusion, with idempotency and audit",async()=>{
 const input={employeeId:aliceId,periodId,type:"ALLOWANCE",amount:"100",reason:"Reviewed allowance",operationKey:randomUUID()};adjId=await a.createAdjustment(hr,input);expect(await a.createAdjustment(hr,input)).toBe(adjId);await calculate();expect((await db.salaryCalculation.findUniqueOrThrow({where:{employeeId_salaryPeriodId:{employeeId:aliceId,salaryPeriodId:periodId}}})).bonusAmount.toFixed(2)).toBe("0.00");await expect(advance("REVIEWED")).rejects.toMatchObject({code:"UNRESOLVED_PAY"});const row=await db.salaryAdjustment.findUniqueOrThrow({where:{id:adjId}});await a.decideAdjustment(hr,{id:row.id,revision:row.revision,decision:"APPROVED",comment:"Authorized allowance"});await calculate();expect((await db.salaryCalculation.findUniqueOrThrow({where:{employeeId_salaryPeriodId:{employeeId:aliceId,salaryPeriodId:periodId}}})).bonusAmount.toFixed(2)).toBe("100.00");
 await expect(a.createAdjustment(alice,input)).rejects.toMatchObject({status:403});await expect(a.createAdjustment(hr,{...input,amount:"-1",type:"BONUS",operationKey:randomUUID()})).rejects.toMatchObject({status:400});
});
it("recalculates one employee/month row, rejects stale revisions and hidden own drafts",async()=>{
 const count=await db.salaryCalculation.count({where:{salaryPeriodId:periodId}});await Promise.all([calculate(),calculate()]);expect(await db.salaryCalculation.count({where:{salaryPeriodId:periodId}})).toBe(count);expect(count).toBe(3);const row=await db.salaryCalculation.findFirstOrThrow({where:{salaryPeriodId:periodId,employeeId:aliceId}});await expect(p.salaryData(alice,{id:row.id},true)).rejects.toMatchObject({status:404});await expect(p.salaryData(alice,{employeeId:bobId},true)).rejects.toMatchObject({status:400});
});
it("requires Admin for salary approval/finalization and advances the entire period atomically",async()=>{
 await advance("REVIEWED");await expect(p.transitionPeriod(hr,{periodId,revision:(await current()).inputRevision,status:"APPROVED"})).rejects.toMatchObject({status:403});await advance("APPROVED");await advance("FINALIZED");expect((await current()).status).toBe("FINALIZED");const own=(await p.salaryData(alice,{},true)).records[0];originalId=own.id;expect(own.finalAmount).toBe("4812.35");expect("snapshot" in own && own.snapshot?.adjustments[0].reason).toBe("Approved adjustment");bobOriginal=(await p.salaryData(bob,{},true)).records[0].id;
 expect((await db.preorder.findUniqueOrThrow({where:{id:orderId}})).status).toBe("INCLUDED");expect((await db.salaryAdjustment.findUniqueOrThrow({where:{id:adjId}})).includedSalaryCalculationId).toBe(originalId);await advance("FINALIZED");expect(await db.auditLog.count({where:{action:"SALARY_PERIOD_FINALIZED",entityId:periodId}})).toBe(1);
});
it("hides foreign finalized salary and own commission records by ID",async()=>{
 await expect(p.salaryData(bob,{id:originalId},true)).rejects.toMatchObject({status:404});await expect(p.salaryData(alice,{id:bobOriginal},true)).rejects.toMatchObject({status:404});await expect(c.commissionData(alice,{id:randomUUID()})).rejects.toMatchObject({status:404});await expect(c.commissionData(alice,{employeeId:bobId})).rejects.toMatchObject({status:400});await expect(p.periodData(alice,{id:periodId})).rejects.toMatchObject({status:403});
 const unprivileged=(await p.salaryData(plainHr,{id:originalId})).records[0];expect(Object.keys(unprivileged).sort()).toEqual(["employee","finalAmount","id","period"]);
});
it("database guards preserve final statements, periods, included commissions and adjustments",async()=>{
 await expect(calculate()).rejects.toMatchObject({code:"FINALIZED"});await expect(db.salaryCalculation.update({where:{id:originalId},data:{finalAmount:"1"}})).rejects.toBeDefined();await expect(db.salaryPeriod.update({where:{id:periodId},data:{status:"DRAFT"}})).rejects.toBeDefined();await expect(db.preorder.update({where:{id:orderId},data:{commissionAmount:"99",revision:{increment:1}}})).rejects.toBeDefined();await expect(db.salaryAdjustment.update({where:{id:adjId},data:{reason:"tampered",revision:{increment:1}}})).rejects.toBeDefined();
 const privileges=(await database.owner.query("SELECT has_table_privilege('employee_runtime','salary_calculations','DELETE') AS remove,has_table_privilege('employee_runtime','audit_logs','UPDATE') AS audit_edit")).rows[0];expect(privileges).toEqual({remove:false,audit_edit:false});
});
it("live commission revocation suppresses all breakdown/line item amounts but retains finalized total",async()=>{
 const security=await import("@/features/accounts/service");await security.updateAccountSecurity(admin,{userId:alice.userId,role:"EMPLOYEE",isActive:true,canManageCommissions:false,preorderCommissionEnabled:false});await expect(c.commissionData(alice)).rejects.toMatchObject({status:401});alice=identity(alice.userId,3);await expect(c.commissionData(alice)).rejects.toMatchObject({status:403});
 const own=(await p.salaryData(alice,{id:originalId},true)).records[0];expect(Object.keys(own).sort()).toEqual(["finalAmount","id","period"]);expect(own.finalAmount).toBe("4812.35");expect(JSON.stringify(own)).not.toMatch(/commission|"12\.35"|snapshot|4812\.35.*reason/);
 const timeline=await import("@/features/people/timeline"),notifs=await import("@/features/review/notifications");expect((await timeline.ownTimeline(alice)).some(e=>e.type==="COMMISSION_DECIDED" || e.type==="SALARY_FINALIZED")).toBe(false);expect((await notifs.notificationList(alice)).some(n=>n.sourceType==="preorders")).toBe(false);expect((await notifs.notificationList(alice)).some(n=>n.sourceType==="salary_calculations")).toBe(true);
});
it("historical rate correction preserves final pay and computes a reviewed later delta",async()=>{
 febId=await p.createPeriod(hr,{month:"2030-02"});const old=(await r.rateHistory(hr,aliceId)).rates.find(r=>!r.supersededAt && r.baseAmount==="6200")!;await r.publishRate(hr,{...rate(aliceId,aliceStint),baseAmount:"9300",effectiveFrom:"2030-01-16",effectiveUntil:"2030-02-01",baseRateId:old.id,revision:old.revision});expect((await db.salaryCalculation.findUniqueOrThrow({where:{id:originalId}})).finalAmount.toFixed(2)).toBe("4812.35");reconKey=randomUUID();
 await expect(re.reconcileSalary(plainHr,{originalCalculationId:originalId,targetPeriodId:febId,operationKey:reconKey,reason:"Correct historical terms"})).rejects.toMatchObject({status:403});
 reconId=await re.reconcileSalary(hr,{originalCalculationId:originalId,targetPeriodId:febId,operationKey:reconKey,reason:"Correct historical terms"});expect((await db.salaryAdjustment.findUniqueOrThrow({where:{id:reconId}})).amount.toFixed(2)).toBe("1600.00");
 await expect(re.reconcileSalary(hr,{originalCalculationId:originalId,targetPeriodId:febId,operationKey:randomUUID(),reason:"Repeated correction"})).rejects.toMatchObject({code:"OUTSTANDING_CORRECTION"});
});
it("later historical mutations invalidate both reconciliation approval and its target month",async()=>{
 let row=await db.salaryAdjustment.findUniqueOrThrow({where:{id:reconId}});await a.decideAdjustment(hr,{id:row.id,revision:row.revision,decision:"APPROVED",comment:"Checked desired delta"});await calculate(febId);
 const old=(await r.rateHistory(hr,aliceId)).rates.find(r=>!r.supersededAt && r.baseAmount==="9300")!;await r.publishRate(hr,{...rate(aliceId,aliceStint),baseAmount:"12400",effectiveFrom:"2030-01-16",effectiveUntil:"2030-02-01",baseRateId:old.id,revision:old.revision});row=await db.salaryAdjustment.findUniqueOrThrow({where:{id:reconId}});expect(row.status).toBe("PENDING");expect(row.reconciliationSnapshot).toBeNull();expect((await db.salaryPeriod.findUniqueOrThrow({where:{id:febId}})).status).toBe("DRAFT");await expect(a.decideAdjustment(hr,{id:row.id,revision:row.revision,decision:"APPROVED",comment:"Stale"})).rejects.toMatchObject({code:"RECONCILE_AGAIN"});
 await re.reconcileSalary(hr,{originalCalculationId:originalId,targetPeriodId:febId,operationKey:reconKey,revision:row.revision,reason:"Recomputed current terms"});row=await db.salaryAdjustment.findUniqueOrThrow({where:{id:reconId}});expect(row.amount.toFixed(2)).toBe("3200.00");await a.decideAdjustment(hr,{id:row.id,revision:row.revision,decision:"APPROVED",comment:"Verified latest facts"});
});
it("does not repeat a finalized historic delta in a second correction",async()=>{
 now=new Date("2030-03-11T12:00:00Z");await calculate(febId);await advance("REVIEWED",febId);await advance("APPROVED",febId);await advance("FINALIZED",febId);marId=await p.createPeriod(hr,{month:"2030-03"});const second=await re.reconcileSalary(hr,{originalCalculationId:originalId,targetPeriodId:marId,operationKey:randomUUID(),reason:"Verify no double payment"});const row=await db.salaryAdjustment.findUniqueOrThrow({where:{id:second}});expect(row.amount.toFixed(2)).toBe("0.00");expect(row.commissionRelated).toBe(true);await a.decideAdjustment(hr,{id:row.id,revision:row.revision,decision:"REJECTED",comment:"No additional correction due"});
});
it("refunds included commission through a classified computed later correction, preserving the original claim",async()=>{
 const id=await re.reconcileSalary(hr,{originalCalculationId:originalId,targetPeriodId:marId,operationKey:randomUUID(),reason:"Verified cancellation/refund",commissionChange:{preorderId:orderId,amount:"0"}}),row=await db.salaryAdjustment.findUniqueOrThrow({where:{id}});expect(row.amount.toFixed(2)).toBe("-12.35");expect(row.commissionRelated).toBe(true);expect((await db.preorder.findUniqueOrThrow({where:{id:orderId}})).commissionAmount.toFixed(2)).toBe("12.35");await a.decideAdjustment(hr,{id,revision:row.revision,decision:"APPROVED",comment:"Refund verified"});
});
it("attendance correction makes approved overtime stale and invalidates unfinished dependent salary",async()=>{
 const before=(await db.salaryPeriod.findUniqueOrThrow({where:{id:marId}})).inputRevision;
 const req=await co.submitCorrection(bob,{...added("2030-01-07","03:00:00","10:00:00"),type:"REPLACE",sessionId:bobSession});await approve(req);expect((await db.overtimeReview.findUniqueOrThrow({where:{id:reviewId}})).status).toBe("STALE");expect((await db.salaryCalculation.findUniqueOrThrow({where:{id:bobOriginal}})).finalAmount.toFixed(2)).toBe("65.00");
 await expect(re.reconcileSalary(hr,{originalCalculationId:bobOriginal,targetPeriodId:marId,operationKey:randomUUID(),reason:"Changed attendance"})).rejects.toMatchObject({code:"UNRESOLVED_PAY"});expect((await db.salaryPeriod.findUniqueOrThrow({where:{id:marId}})).inputRevision).toBeGreaterThanOrEqual(before);
 const row=await o.calculateOvertime(hr,{employeeId:bobId,week:"2030-01-07"});await o.decideOvertime(hr,{id:row.id,revision:row.revision,decision:"REJECTED",approvedSeconds:0,comment:"No further premium approved"});
 const id=await re.reconcileSalary(hr,{originalCalculationId:bobOriginal,targetPeriodId:marId,operationKey:randomUUID(),reason:"Reconciled corrected actual work"});expect((await db.salaryAdjustment.findUniqueOrThrow({where:{id}})).amount.toFixed(2)).toBe("5.00");
});
it("audits compensation, approval, commission rules and final salary corrections with retained acting users",async()=>{
 for(const action of ["COMPENSATION_CREATED","COMPENSATION_CHANGED","COMMISSION_POLICY_CHANGED","PREORDER_CREATED","COMMISSION_APPROVED","SALARY_ADJUSTMENT_APPROVED","SALARY_PERIOD_FINALIZED","SALARY_RECONCILIATION_CREATED","SALARY_INPUTS_CHANGED"])expect(await db.auditLog.count({where:{action}}),action).toBeGreaterThan(0);
 expect(JSON.stringify(await db.auditLog.findMany({where:{entity:{in:["compensation_rates","salary_calculations","preorders"]}}}))).not.toMatch(/passwordHash|AUTH_SECRET/);
});
it("cannot finalize a month before its complete boundary week ends",async()=>{
 const id=await p.createPeriod(hr,{month:"2030-04"});now=new Date("2030-05-01T00:00:00Z");await calculate(id);await expect(advance("REVIEWED",id)).rejects.toMatchObject({code:"BOUNDARY_WEEK_OPEN"});now=new Date("2030-05-13T00:00:00Z");
});
it("rejects a negative final salary and lets staff edit a mistaken approved deduction for review again",async()=>{
 const period=await db.salaryPeriod.findUniqueOrThrow({where:{startDate:new Date("2030-04-01")}});const id=await a.createAdjustment(hr,{employeeId:aliceId,periodId:period.id,type:"DEDUCTION",amount:"99999",reason:"Synthetic overlarge deduction",operationKey:randomUUID()}),row=await db.salaryAdjustment.findUniqueOrThrow({where:{id}});await a.decideAdjustment(hr,{id,revision:row.revision,decision:"APPROVED",comment:"Synthetic negative-pay test"});await calculate(period.id);await expect(advance("REVIEWED",period.id)).rejects.toMatchObject({code:"NEGATIVE_SALARY"});
 const edited=await db.salaryAdjustment.findUniqueOrThrow({where:{id}});await a.editAdjustment(hr,{id,revision:edited.revision,amount:"0",reason:"Corrected mistaken deduction"});const pending=await db.salaryAdjustment.findUniqueOrThrow({where:{id}});expect(pending.status).toBe("PENDING");await a.decideAdjustment(hr,{id,revision:pending.revision,decision:"REJECTED",comment:"Not payable"});
});
it("a newly inserted roster member invalidates prior calculation and requires complete rate coverage",async()=>{
 const period=await db.salaryPeriod.findUniqueOrThrow({where:{startDate:new Date("2030-04-01")}});await calculate(period.id);const before=await db.salaryPeriod.findUniqueOrThrow({where:{id:period.id}}),user=await db.user.create({data:{email:"new-pay@example.test",passwordHash:"synthetic",mustChangePassword:false}}),e=await db.employee.create({data:{userId:user.id,legalName:"New Employee",employeeNumber:"NEW",createdBy:admin.userId,employmentPeriods:{create:{startDate:new Date("2030-04-03"),departmentLabel:"Operations",positionLabel:"Associate",createdBy:admin.userId}}},include:{employmentPeriods:true}});
 expect((await db.salaryPeriod.findUniqueOrThrow({where:{id:period.id}})).inputRevision).toBeGreaterThan(before.inputRevision);await calculate(period.id);await expect(advance("REVIEWED",period.id)).rejects.toMatchObject({code:"UNRESOLVED_PAY"});await r.publishRate(hr,{...rate(e.id,e.employmentPeriods[0].id),effectiveFrom:"2030-04-03"});await calculate(period.id);expect((await p.periodData(hr,{id:period.id})).calculations).toHaveLength(4);
});
it("a change in a neighboring month invalidates both boundary-week salary inputs",async()=>{
 const april=await db.salaryPeriod.findUniqueOrThrow({where:{startDate:new Date("2030-04-01")}}),mayId=await p.createPeriod(hr,{month:"2030-05"}),beforeApril=april.inputRevision,beforeMay=(await db.salaryPeriod.findUniqueOrThrow({where:{id:mayId}})).inputRevision;
 const req=await co.submitCorrection(bob,added("2030-05-01","03:00:00","04:00:00"));await approve(req);expect((await db.salaryPeriod.findUniqueOrThrow({where:{id:april.id}})).inputRevision).toBeGreaterThan(beforeApril);expect((await db.salaryPeriod.findUniqueOrThrow({where:{id:mayId}})).inputRevision).toBeGreaterThan(beforeMay);
});
it("historical pre-orders require retained eligibility valid at the order instant, rather than a current flag",async()=>{
 const grant=await db.auditLog.findFirstOrThrow({where:{employeeId:aliceId,action:"ACCOUNT_SECURITY_CHANGED",after:{path:["preorderCommissionEnabled"],equals:true}}}),revocation=await db.auditLog.findFirstOrThrow({where:{employeeId:aliceId,action:"ACCOUNT_SECURITY_CHANGED",after:{path:["preorderCommissionEnabled"],equals:false}}});
 const good=new Date(Math.ceil(grant.eventTime.getTime()/1000)*1000),bad=new Date(Math.floor((revocation.eventTime.getTime()+2000)/1000)*1000);
 const data={employeeId:aliceId,reference:"historical-earned",orderAt:good.toISOString(),orderValue:"10",eligibilityEvidenceId:grant.id,commissionType:"FIXED",commissionValue:"0",reason:"Historical earning proof"};
 const id=await c.submitPreorder(hr,data,true);expect((await db.preorder.findUniqueOrThrow({where:{id}})).commissionAmount.toFixed(2)).toBe("0.00");await expect(c.submitPreorder(hr,{...data,reference:"after-revocation",orderAt:bad.toISOString()},true)).rejects.toMatchObject({code:"ELIGIBILITY_EVIDENCE"});await expect(c.submitPreorder(hr,{...data,reference:"foreign-proof",eligibilityEvidenceId:randomUUID()},true)).rejects.toMatchObject({code:"ELIGIBILITY_EVIDENCE"});
 const row=await db.preorder.findUniqueOrThrow({where:{id}});await c.decidePreorder(hr,{id,revision:row.revision,decision:"REJECTED",comment:"Zero claim used only as historical proof test"});
});
it("commission eligibility is reset on rehire and the prior stint grant remains historical evidence",async()=>{
 const user=await db.user.create({data:{email:"rehire-pay@example.test",passwordHash:"synthetic",mustChangePassword:false}}),e=await db.employee.create({data:{userId:user.id,legalName:"Rehire",employeeNumber:"REHIRE",preorderCommissionEnabled:true,createdBy:admin.userId,employmentPeriods:{create:{startDate:new Date("2020-01-01"),endDate:new Date("2021-01-01"),departmentLabel:"Operations",positionLabel:"Associate",createdBy:admin.userId}}}});
 await db.employmentPeriod.create({data:{employeeId:e.id,startDate:new Date("2031-01-01"),departmentLabel:"Operations",positionLabel:"Associate",createdBy:admin.userId}});expect((await db.employee.findUniqueOrThrow({where:{id:e.id}})).preorderCommissionEnabled).toBe(false);expect(await db.auditLog.count({where:{employeeId:e.id,action:"EMPLOYEE_ELIGIBILITY_RESET"}})).toBe(1);
});
it("approved daily unscheduled work requires an explicit reviewed Other adjustment instead of a guessed daily rate",async()=>{
 const april=await db.salaryPeriod.findUniqueOrThrow({where:{startDate:new Date("2030-04-01")}});const req=await co.submitCorrection(hr,added("2030-04-02","03:00:00","04:00:00"),dayId);await approve(req);await calculate(april.id);await expect(advance("REVIEWED",april.id)).rejects.toMatchObject({code:"UNRESOLVED_PAY"});const id=await a.createAdjustment(hr,{employeeId:dayId,periodId:april.id,type:"OTHER",amount:"35",reason:"Reviewed unscheduled daily work on April 2; agreed amount 35",operationKey:randomUUID()}),row=await db.salaryAdjustment.findUniqueOrThrow({where:{id}});await a.decideAdjustment(hr,{id,revision:row.revision,decision:"APPROVED",comment:"Reviewed all unscheduled daily work for this month"});await calculate(april.id);await advance("REVIEWED",april.id);expect((await db.salaryCalculation.findUniqueOrThrow({where:{employeeId_salaryPeriodId:{employeeId:dayId,salaryPeriodId:april.id}}})).finalAmount.toFixed(2)).toBe("35.00");
});
it("HR may manage commission without personal eligibility but cannot decide their own financial proposals",async()=>{
 expect((await c.commissionData(hr,{},true)).records.length).toBeGreaterThan(0);await expect(c.commissionData(hr)).rejects.toMatchObject({status:403});
 const e=await db.employee.create({data:{userId:hr.userId,legalName:"HR Own Profile",employeeNumber:"HR-OWN",createdBy:admin.userId,employmentPeriods:{create:{startDate:new Date("2031-01-01"),departmentLabel:"Operations",positionLabel:"Manager",createdBy:admin.userId}}}}),id=await a.createAdjustment(hr,{employeeId:e.id,periodId:marId,type:"BONUS",amount:"10",reason:"Own request",operationKey:randomUUID()}),row=await db.salaryAdjustment.findUniqueOrThrow({where:{id}});await expect(a.decideAdjustment(hr,{id,revision:row.revision,decision:"APPROVED",comment:"Self"})).rejects.toMatchObject({status:403});
});

it("pending VOID of a long session invalidates every month touched by the original target",async()=>{
 const request=await co.submitCorrection(hr,{...added("2030-04-10","03:00:00","04:00:00"),checkoutAt:"2030-05-08T04:00:00Z"},aliceId);await approve(request);const target=(await db.attendanceCorrection.findUniqueOrThrow({where:{id:request}})).appliedSessionId!,april=await db.salaryPeriod.findUniqueOrThrow({where:{startDate:new Date("2030-04-01")}}),may=await db.salaryPeriod.findUniqueOrThrow({where:{startDate:new Date("2030-05-01")}});
 await co.submitCorrection(hr,{type:"VOID",sessionId:target,workDate:"2030-04-10",reason:"Review the full original interval",operationKey:randomUUID()},aliceId);
 expect((await db.salaryPeriod.findUniqueOrThrow({where:{id:april.id}})).inputRevision).toBeGreaterThan(april.inputRevision);expect((await db.salaryPeriod.findUniqueOrThrow({where:{id:may.id}})).inputRevision).toBeGreaterThan(may.inputRevision);
});
it("recalculating an unfinished month excludes an overtime approval made stale by a correction",async()=>{
 const may=await db.salaryPeriod.findUniqueOrThrow({where:{startDate:new Date("2030-05-01")}}),request=await co.submitCorrection(bob,added("2030-05-06","03:00:00","09:00:00"));await approve(request);const session=(await db.attendanceCorrection.findUniqueOrThrow({where:{id:request}})).appliedSessionId!,review=await o.calculateOvertime(hr,{employeeId:bobId,week:"2030-05-06"});await o.decideOvertime(hr,{id:review.id,revision:review.revision,decision:"APPROVED",approvedSeconds:3600,comment:"One hour verified"});await calculate(may.id);let row=await db.salaryCalculation.findUniqueOrThrow({where:{employeeId_salaryPeriodId:{employeeId:bobId,salaryPeriodId:may.id}}});expect(row.overtimeAmount.toFixed(2)).toBe("15.00");
 const correction=await co.submitCorrection(bob,{...added("2030-05-06","03:00:00","10:00:00"),type:"REPLACE",sessionId:session});await approve(correction);expect((await db.salaryPeriod.findUniqueOrThrow({where:{id:may.id}})).status).toBe("DRAFT");await calculate(may.id);row=await db.salaryCalculation.findUniqueOrThrow({where:{employeeId_salaryPeriodId:{employeeId:bobId,salaryPeriodId:may.id}}});expect(row.overtimeAmount.toFixed(2)).toBe("0.00");expect((row.calculationSnapshot as {blockers:string[]}).blockers).toContain("Overtime week 2030-05-06 needs current review");
});
