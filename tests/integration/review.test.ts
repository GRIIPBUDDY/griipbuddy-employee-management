import { beforeAll,afterAll,describe,it,expect,vi } from "vitest";
import { randomUUID } from "node:crypto";
import { testPostgres } from "../postgres";
import type { Identity } from "@/types/auth";
import type { PrismaClient } from "@/generated/prisma/client";
import type * as Corrections from "@/features/review/corrections";
import type * as Overtime from "@/features/review/overtime";
import type * as Data from "@/features/review/data";
import type * as Absence from "@/features/review/absence";
let database:Awaited<ReturnType<typeof testPostgres>>,db:PrismaClient,c:typeof Corrections,o:typeof Overtime,d:typeof Data,a:typeof Absence;
let admin:Identity,hr:Identity,alice:Identity,bob:Identity,aliceId:string,bobId:string,hrId:string,alicePeriod:string,bobPeriod:string;
let firstRequest:string,firstSession:string,secondSession:string,reviewId:string,openSession:string,staleRequest:string;
let now=new Date("2030-01-07T00:00:00Z");
const identity=(userId:string):Identity=>({userId,issuedAt:Date.now(),absoluteExpiresAt:Date.now()+43200000,sessionVersion:1});
const at=(s:string)=>{now=new Date(s);};
const add=(date:string,start:string,end:string)=>({type:"ADD",workDate:date,checkinAt:start,checkoutAt:end,reason:"Evidence from work log",operationKey:randomUUID()});
const approve=(id:string)=>c.decideCorrection(hr,{id,decision:"APPROVED",comment:"Verified work evidence"});
beforeAll(async()=>{
 database=await testPostgres();process.env.DATABASE_URL=database.runtimeUrl;db=(await import("@/lib/db/client")).db;
 vi.spyOn(await import("@/features/time/clock"),"databaseNow").mockImplementation(async()=>new Date(now));
 c=await import("@/features/review/corrections");o=await import("@/features/review/overtime");d=await import("@/features/review/data");a=await import("@/features/review/absence");
 const user=await db.user.create({data:{email:"review-admin@example.test",role:"ADMIN",mustChangePassword:false,passwordHash:"synthetic"}});admin=identity(user.id);
 await db.organizationSettings.create({data:{companyName:"Review tests",changedBy:user.id,overtimePolicyVersions:[{effectiveFrom:"2020-01-06",thresholdSeconds:18000,ruleVersion:1}]}});
 for(const name of ["Alice","Bob","HR"]){const u=await db.user.create({data:{email:`${name.toLowerCase()}-review@example.test`,role:name==="HR"?"HR_MANAGER":"EMPLOYEE",mustChangePassword:false,passwordHash:"synthetic"}});
 const e=await db.employee.create({data:{userId:u.id,legalName:`${name} Review`,employeeNumber:name,createdBy:user.id,employmentPeriods:{create:{startDate:new Date("2020-01-01"),departmentLabel:"Operations",positionLabel:"Associate",createdBy:user.id}}},include:{employmentPeriods:true}});
 if(name==="Alice"){alice=identity(u.id);aliceId=e.id;alicePeriod=e.employmentPeriods[0].id;}else if(name==="Bob"){bob=identity(u.id);bobId=e.id;bobPeriod=e.employmentPeriods[0].id;}else{hr=identity(u.id);hrId=e.id;}}
 const schedules=await import("@/features/time/schedules");
 for(const [employeeId,employmentPeriodId] of [[aliceId,alicePeriod],[bobId,bobPeriod]])await schedules.publishSchedule(admin,{employeeId,employmentPeriodId,effectiveFrom:"2030-01-07",effectiveUntil:"",label:"Weekday work",reason:"Work assignment",slots:[{weekday:1,startMinute:540,endMinute:780,endDayOffset:0},{weekday:2,startMinute:540,endMinute:780,endDayOffset:0}]});
 at("2030-01-21T12:00:00Z");
});
afterAll(async()=>{vi.restoreAllMocks();await db?.$disconnect();await database?.stop();});
describe("Phase 3D corrections, exact attendance and weekly decisions",()=>{
 it("submits a pending missing-session request without changing actual facts",async()=>{
 const input=add("2030-01-07","2030-01-07T03:00:00Z","2030-01-07T05:00:00Z");firstRequest=await c.submitCorrection(alice,input);expect(await c.submitCorrection(alice,input)).toBe(firstRequest);
 expect(await db.attendanceSession.count({where:{employeeId:aliceId}})).toBe(0);expect((await c.correctionList(alice)).records[0].status).toBe("PENDING");
 await expect(c.submitCorrection(alice,{...input,reason:"Changed evidence"})).rejects.toMatchObject({code:"OPERATION_REUSED"});
 });
 it("notifies staff once and hides foreign requests, summaries and overtime",async()=>{
 expect(await db.notification.count({where:{sourceId:firstRequest,eventType:"STAFF_CORRECTION_PENDING"}})).toBe(2);
 await expect(c.correctionList(bob,{},false,firstRequest)).rejects.toMatchObject({status:404});await expect(o.overtimeData(alice,bobId,"2030-01-07",true)).rejects.toMatchObject({status:404});
 await expect(d.attendanceDay(alice,bobId,"2030-01-07")).rejects.toMatchObject({status:403});await expect(d.ownSummary(alice,{employeeId:bobId})).rejects.toMatchObject({status:400});
 expect(JSON.stringify(await c.correctionList(alice))).not.toMatch(/passwordHash|operationKey|requestedBy|reviewedBy/);
 });
 it("rejects identity, reviewer and status injection and foreign target selection",async()=>{
 await expect(c.submitCorrection(alice,{...add("2030-01-07","2030-01-07T05:00:00Z","2030-01-07T06:00:00Z"),employeeId:bobId})).rejects.toMatchObject({status:400});
 await expect(c.decideCorrection(alice,{id:firstRequest,decision:"APPROVED",comment:"No authority"})).rejects.toMatchObject({status:403});
 await expect(c.decideCorrection(hr,{id:firstRequest,decision:"APPROVED",comment:"Review",reviewedBy:alice.userId})).rejects.toMatchObject({status:400});
 });
 it("atomically approves ADD with source, original audit, timeline and employee notification",async()=>{
 await approve(firstRequest);const row=await db.attendanceCorrection.findUniqueOrThrow({where:{id:firstRequest}});firstSession=row.appliedSessionId!;expect(row.status).toBe("APPROVED");expect((await db.attendanceSession.findUniqueOrThrow({where:{id:firstSession}})).source).toBe("CORRECTION");
 expect(await db.auditLog.count({where:{entityId:firstSession,action:"ATTENDANCE_CORRECTION_CREATED"}})).toBe(1);expect(await db.employeeActivity.count({where:{sourceId:firstRequest}})).toBe(2);
 expect(await db.notification.count({where:{recipientUserId:alice.userId,sourceId:firstRequest}})).toBe(1);await expect(approve(firstRequest)).rejects.toMatchObject({code:"DECIDED"});
 });
 it("calculates one completed duration and sums multiple daily sessions",async()=>{
 const id=await c.submitCorrection(alice,add("2030-01-07","2030-01-07T06:00:00Z","2030-01-07T10:00:00Z"));await approve(id);secondSession=(await db.attendanceCorrection.findUniqueOrThrow({where:{id}})).appliedSessionId!;
 const day=await d.attendanceDay(hr,aliceId,"2030-01-07");expect(day.actualSeconds).toBe(21600);expect(day.sessions).toHaveLength(2);expect(day.scheduledSeconds).toBe(14400);
 });
 it("uses configured threshold and creates exactly one review during concurrent/repeated calculation",async()=>{
 const results=await Promise.all([o.calculateOvertime(hr,{employeeId:aliceId,week:"2030-01-07"}),o.calculateOvertime(admin,{employeeId:aliceId,week:"2030-01-08"})]);reviewId=results[0].id;expect(results[1].id).toBe(reviewId);expect(results[0]).toMatchObject({actualSecondsSnapshot:21600,potentialSecondsSnapshot:3600,thresholdSeconds:18000,status:"PENDING"});
 const again=await o.calculateOvertime(hr,{employeeId:aliceId,week:"2030-01-07"});expect(again.revision).toBe(1);expect(await db.auditLog.count({where:{entityId:reviewId,action:"OVERTIME_CALCULATED"}})).toBe(1);
 });
 it("makes zero overtime NOT_REQUIRED without an approval click",async()=>expect(await o.calculateOvertime(hr,{employeeId:bobId,week:"2030-01-07"})).toMatchObject({potentialSecondsSnapshot:0,status:"NOT_REQUIRED",approvedSeconds:0}));
 it("rejects over-approval and approves a partial chronological suffix",async()=>{
 await expect(o.decideOvertime(hr,{id:reviewId,revision:1,decision:"APPROVED",approvedSeconds:3601,comment:"Too much"})).rejects.toMatchObject({code:"APPROVAL_AMOUNT"});
 await o.decideOvertime(hr,{id:reviewId,revision:1,decision:"APPROVED",approvedSeconds:1800,comment:"Half of candidate time approved"});const view=await o.overtimeData(alice,aliceId,"2030-01-07",true);expect(view.activeApprovedSeconds).toBe(1800);expect(view.allocation).toEqual([{start:new Date("2030-01-07T09:30:00Z").getTime()/1000,end:new Date("2030-01-07T10:00:00Z").getTime()/1000}]);
 });
 it("rejects overlapping proposals and protects official timestamps from raw runtime mutation",async()=>{
 await expect(c.submitCorrection(alice,add("2030-01-07","2030-01-07T04:00:00Z","2030-01-07T06:00:00Z"))).rejects.toMatchObject({code:"ATTENDANCE_OVERLAP"});
 await expect(db.attendanceSession.update({where:{id:firstSession},data:{checkinAt:new Date("2030-01-07T02:00:00Z"),revision:{increment:1}}})).rejects.toBeDefined();
 await expect(c.submitCorrection(bob,{...add("2030-01-07","2030-01-07T03:00:00Z","2030-01-07T04:00:00Z"),type:"REPLACE",sessionId:firstSession})).rejects.toMatchObject({status:404});
 });
 it("approved REPLACE recalculates time and makes an approved result stale while preserving its amount",async()=>{
 const id=await c.submitCorrection(alice,{...add("2030-01-07","2030-01-07T06:00:00Z","2030-01-07T11:00:00Z"),type:"REPLACE",sessionId:secondSession});await approve(id);
 const row=await db.overtimeReview.findUniqueOrThrow({where:{id:reviewId}});expect(row.status).toBe("STALE");expect(row.approvedSeconds).toBe(1800);
 const view=await o.overtimeData(alice,aliceId,"2030-01-07",true);expect(view.current.actualSeconds).toBe(25200);expect(view.current.potentialSeconds).toBe(7200);expect(view.activeApprovedSeconds).toBe(0);
 expect(await db.auditLog.count({where:{entityId:reviewId,action:"OVERTIME_REVIEW_STALE"}})).toBe(1);expect(await db.notification.count({where:{sourceId:reviewId,eventType:"STAFF_OVERTIME_STALE"}})).toBe(2);
 });
 it("recalculates the same weekly row and records a rejection at the new revision",async()=>{
 const row=await o.calculateOvertime(hr,{employeeId:aliceId,week:"2030-01-07"});expect(row.id).toBe(reviewId);expect(row.potentialSecondsSnapshot).toBe(7200);
 await o.decideOvertime(hr,{id:row.id,revision:row.revision,decision:"REJECTED",approvedSeconds:0,comment:"No overtime approval"});expect((await o.overtimeData(alice,aliceId,"2030-01-07",true)).row?.status).toBe("REJECTED");
 await expect(o.decideOvertime(hr,{id:row.id,revision:row.revision,decision:"APPROVED",approvedSeconds:1,comment:"Stale"})).rejects.toMatchObject({code:"STALE"});
 });
 it("preserves official facts on rejection and lets employees withdraw only pending own requests",async()=>{
 const proposal={...add("2030-01-07","2030-01-07T03:00:00Z","2030-01-07T04:00:00Z"),type:"REPLACE",sessionId:firstSession};const id=await c.submitCorrection(alice,proposal);await c.decideCorrection(hr,{id,decision:"REJECTED",comment:"Insufficient evidence"});expect((await db.attendanceSession.findUniqueOrThrow({where:{id:firstSession}})).checkoutAt?.toISOString()).toBe("2030-01-07T05:00:00.000Z");
 const pending=await c.submitCorrection(alice,{...proposal,operationKey:randomUUID()});await expect(c.withdrawCorrection(bob,{id:pending})).rejects.toMatchObject({status:404});await c.withdrawCorrection(alice,{id:pending});expect((await db.attendanceCorrection.findUniqueOrThrow({where:{id:pending}})).status).toBe("WITHDRAWN");await expect(c.withdrawCorrection(alice,{id:firstRequest})).rejects.toMatchObject({code:"DECIDED"});
 });
 it("retains VOID facts and removes them from authoritative totals",async()=>{
 const id=await c.submitCorrection(alice,{type:"VOID",sessionId:firstSession,workDate:"2030-01-07",reason:"Erroneous declaration",operationKey:randomUUID()});await approve(id);expect((await db.attendanceSession.findUniqueOrThrow({where:{id:firstSession}})).voidedAt).not.toBeNull();expect((await d.attendanceDay(hr,aliceId,"2030-01-07")).actualSeconds).toBe(18000);
 });
 it("splits sessions crossing local midnight and the week boundary",async()=>{
 const id=await c.submitCorrection(bob,add("2030-01-06","2030-01-06T16:00:00Z","2030-01-06T20:00:00Z"));await approve(id);
 expect((await d.attendanceDay(hr,bobId,"2030-01-06")).actualSeconds).toBe(7200);expect((await d.attendanceDay(hr,bobId,"2030-01-07")).actualSeconds).toBe(7200);
 expect((await o.overtimeData(bob,bobId,"2030-01-07",true)).current.actualSeconds).toBe(7200);
 });
 it("detects missing checkout without counting live elapsed time",async()=>{
 at("2030-01-08T03:00:00Z");const slot=await db.scheduleSlot.findFirstOrThrow({where:{weekday:2,workSchedule:{employeeId:bobId}}});openSession=(await (await import("@/features/time/attendance")).checkIn(bob,{slotId:slot.id,workDate:"2030-01-08",operationKey:randomUUID()})).id;
 at("2030-01-21T12:00:00Z");const day=await d.attendanceDay(hr,bobId,"2030-01-08");expect(day.days[0]).toMatchObject({actualSeconds:0,incompleteCount:1,absenceCount:0});await expect(o.calculateOvertime(hr,{employeeId:bobId,week:"2030-01-07"})).rejects.toMatchObject({code:"UNRESOLVED_ATTENDANCE"});
 });
 it("rejects a stale correction when the employee checks out before review",async()=>{
 staleRequest=await c.submitCorrection(bob,{...add("2030-01-08","2030-01-08T03:00:00Z","2030-01-08T07:00:00Z"),type:"REPLACE",sessionId:openSession});
 at("2030-01-08T08:00:00Z");await (await import("@/features/time/attendance")).checkOut(bob,{sessionId:openSession,operationKey:randomUUID()});at("2030-01-21T12:00:00Z");await expect(approve(staleRequest)).rejects.toMatchObject({code:"STALE"});expect((await db.attendanceCorrection.findUniqueOrThrow({where:{id:staleRequest}})).status).toBe("PENDING");
 await c.decideCorrection(hr,{id:staleRequest,decision:"REJECTED",comment:"Session closed since request"});
 });
 it("identifies ended scheduled work without attendance and excuses holidays and approved leave",async()=>{
 expect((await d.attendanceDay(hr,aliceId,"2030-01-15")).days[0].absenceCount).toBe(1);
 const leave=await a.requestLeave(alice,{startAt:"2030-01-15T03:00:00Z",endAt:"2030-01-15T07:00:00Z",type:"PAID",reason:"Approved personal absence"});await a.decideLeave(hr,{id:leave,revision:1,decision:"APPROVED",comment:"Approved"});
 expect((await d.attendanceDay(hr,aliceId,"2030-01-15")).days[0]).toMatchObject({requiredSeconds:0,absenceCount:0,actualSeconds:0});
 await a.saveHoliday(admin,{date:"2030-01-14",name:"Company holiday",reason:"Published calendar"});expect((await d.attendanceDay(hr,aliceId,"2030-01-14")).days[0]).toMatchObject({scheduledSeconds:14400,requiredSeconds:0,absenceCount:0});
 expect((await d.attendanceDay(hr,aliceId,"2030-01-16")).days[0]).toMatchObject({scheduledSeconds:0,absenceCount:0});
 });
 it("blocks self check-in for excused periods while checkout remains available",async()=>{
 at("2030-01-14T03:00:00Z");const slot=await db.scheduleSlot.findFirstOrThrow({where:{weekday:1,workSchedule:{employeeId:aliceId}}});await expect((await import("@/features/time/attendance")).checkIn(alice,{slotId:slot.id,workDate:"2030-01-14",operationKey:randomUUID()})).rejects.toMatchObject({code:"EXCUSED"});
 const own=await (await import("@/features/time/data")).ownSchedule(alice);expect(own?.periods[0].canCheckin).toBe(false);at("2030-01-21T12:00:00Z");
 });
 it("HR cannot decide its own correction, leave or overtime; admin can",async()=>{
 const id=await c.submitCorrection(hr,add("2030-01-07","2030-01-07T03:00:00Z","2030-01-07T09:00:00Z"));await expect(c.decideCorrection(hr,{id,decision:"APPROVED",comment:"Self"})).rejects.toMatchObject({code:"SELF_REVIEW"});await c.decideCorrection(admin,{id,decision:"APPROVED",comment:"Admin verified"});
 const row=await o.calculateOvertime(hr,{employeeId:hrId,week:"2030-01-07"});await expect(o.decideOvertime(hr,{id:row.id,revision:row.revision,decision:"APPROVED",approvedSeconds:3600,comment:"Self"})).rejects.toMatchObject({code:"SELF_REVIEW"});await o.decideOvertime(admin,{id:row.id,revision:row.revision,decision:"APPROVED",approvedSeconds:3600,comment:"Admin verified"});
 const leave=await a.requestLeave(hr,{startAt:"2030-02-01T00:00:00Z",endAt:"2030-02-01T01:00:00Z",type:"UNPAID",reason:"Personal leave"});await expect(a.decideLeave(hr,{id:leave,revision:1,decision:"APPROVED",comment:"Self"})).rejects.toMatchObject({code:"SELF_REVIEW"});
 });
 it("appends future thresholds and preserves historical rules, prohibiting historical/employee/week-start edits",async()=>{
 await o.updateOvertimePolicy(admin,{effectiveFrom:"2030-01-28",thresholdSeconds:7200,weekStartDay:1,reason:"Future company threshold"});expect((await o.overtimeData(alice,aliceId,"2030-01-07",true)).current.thresholdSeconds).toBe(18000);
 await expect(o.updateOvertimePolicy(alice,{effectiveFrom:"2030-02-04",thresholdSeconds:7200,weekStartDay:1,reason:"Unauthorized"})).rejects.toMatchObject({status:403});
 await expect(o.updateOvertimePolicy(admin,{effectiveFrom:"2030-01-07",thresholdSeconds:7200,weekStartDay:1,reason:"Retroactive"})).rejects.toMatchObject({status:400});
 await expect(o.updateOvertimePolicy(admin,{effectiveFrom:"2030-02-03",thresholdSeconds:7200,weekStartDay:7,reason:"Change boundary"})).rejects.toMatchObject({code:"WEEK_FROZEN"});
 });
 it("authorizes recipient notifications and guards correction decision/proposal history",async()=>{
 const n=await import("@/features/review/notifications"),items=await n.notificationList(alice);expect(items.length).toBeGreaterThan(0);await expect(n.readNotification(bob,items[0].id)).rejects.toMatchObject({status:404});await n.readNotification(alice,items[0].id);
 await expect(db.attendanceCorrection.update({where:{id:firstRequest},data:{reason:"Rewrite evidence"}})).rejects.toBeDefined();await expect(db.auditLog.deleteMany({where:{entityId:firstRequest}})).rejects.toBeDefined();
 });
 it("filters review exceptions and provides all day sessions without exposing account secrets",async()=>{
 const view=await d.attendanceManagement(hr,{employeeId:aliceId,from:"2030-01-07",until:"2030-01-10",status:"LATE"});expect(view.records.length).toBeGreaterThan(0);expect(JSON.stringify(view)).not.toMatch(/passwordHash|operationKey|userId/);
 await expect(d.attendanceManagement(alice,{})).rejects.toMatchObject({status:403});await expect(d.attendanceManagement(hr,{from:"2030-01-01",until:"2030-03-01"})).rejects.toMatchObject({code:"DATE_RANGE"});
 });
 it("approvals revalidate conflicting facts and roll back status, audit and notification together",async()=>{
  const proposal=add("2030-01-08","2030-01-08T03:00:00Z","2030-01-08T05:00:00Z");const one=await c.submitCorrection(alice,proposal),two=await c.submitCorrection(alice,{...proposal,operationKey:randomUUID()});
  await approve(one);await expect(approve(two)).rejects.toMatchObject({code:"ATTENDANCE_OVERLAP"});
  expect((await db.attendanceCorrection.findUniqueOrThrow({where:{id:two}})).status).toBe("PENDING");expect(await db.auditLog.count({where:{entityId:two,action:"CORRECTION_APPROVED"}})).toBe(0);expect(await db.notification.count({where:{sourceId:two,eventType:"CORRECTION_DECIDED"}})).toBe(0);await c.withdrawCorrection(alice,{id:two});
 });
 it("concurrent decisions commit exactly one correction and preserve original schedule snapshots",async()=>{
  const target=await db.attendanceSession.findUniqueOrThrow({where:{id:secondSession}}),id=await c.submitCorrection(alice,{...add("2030-01-07","2030-01-07T06:00:00Z","2030-01-07T12:00:00Z"),type:"REPLACE",sessionId:secondSession});
  const results=await Promise.allSettled([approve(id),approve(id)]);expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect(await db.auditLog.count({where:{entityId:id,action:"CORRECTION_APPROVED"}})).toBe(1);
  const next=await db.attendanceSession.findUniqueOrThrow({where:{id:secondSession}});expect(next.scheduledStartAt).toEqual(target.scheduledStartAt);expect(next.scheduledEndAt).toEqual(target.scheduledEndAt);
 });
 it("rejects future facts, foreign occurrence links and incomplete-week reviews",async()=>{
  await expect(c.submitCorrection(alice,add("2030-01-21","2030-01-21T11:00:00Z","2030-01-21T13:00:00Z"))).rejects.toMatchObject({code:"FUTURE_FACT"});
  const foreign=await db.scheduleSlot.findFirstOrThrow({where:{workSchedule:{employeeId:bobId}}});await expect(c.submitCorrection(alice,{...add("2030-01-14","2030-01-14T03:00:00Z","2030-01-14T04:00:00Z"),scheduleSlotId:foreign.id})).rejects.toMatchObject({status:404});
  await expect(o.calculateOvertime(hr,{employeeId:aliceId,week:"2030-01-21"})).rejects.toMatchObject({code:"WEEK_OPEN"});
 });
 it("requires a bounded holiday-work assignment and leaves normal holiday periods excused",async()=>{
  const schedules=await import("@/features/time/schedules"),base=await db.workSchedule.findFirstOrThrow({where:{employeeId:aliceId,supersededAt:null},include:{slots:true}}),slots=base.slots.map(({weekday,startMinute,endMinute,endDayOffset})=>({weekday,startMinute,endMinute,endDayOffset}));
  await expect(schedules.publishSchedule(admin,{employeeId:aliceId,employmentPeriodId:alicePeriod,effectiveFrom:"2030-01-28",effectiveUntil:"",label:"Unbounded special work",reason:"Not bounded",baseScheduleId:base.id,baseRevision:base.revision,slots,holidayWorkRequired:true})).rejects.toMatchObject({status:400});
  await schedules.publishSchedule(admin,{employeeId:aliceId,employmentPeriodId:alicePeriod,effectiveFrom:"2030-01-28",effectiveUntil:"2030-01-29",label:"Required holiday work",reason:"Staff approved special work",baseScheduleId:base.id,baseRevision:base.revision,slots,restoreSlots:slots,holidayWorkRequired:true});
  await a.saveHoliday(admin,{date:"2030-01-28",name:"Company holiday",reason:"Calendar publication"});at("2030-01-28T03:00:00Z");
  const attendance=await import("@/features/time/attendance"),slot=await db.scheduleSlot.findFirstOrThrow({where:{weekday:1,workSchedule:{employeeId:aliceId,effectiveFrom:new Date("2030-01-28")}}});
  const opened=await attendance.checkIn(alice,{slotId:slot.id,workDate:"2030-01-28",operationKey:randomUUID()});at("2030-01-28T03:01:00Z");await attendance.checkOut(alice,{sessionId:opened.id,operationKey:randomUUID()});at("2030-01-21T12:00:00Z");
 });
 it("anchors early arrival to the remaining required portion of partial approved leave",async()=>{
  const leave=await a.requestLeave(alice,{startAt:"2030-01-29T03:00:00Z",endAt:"2030-01-29T04:00:00Z",type:"UNPAID",reason:"Partial leave"});await a.decideLeave(hr,{id:leave,revision:1,decision:"APPROVED",comment:"Approved partial leave"});
  const overlap=await a.requestLeave(alice,{startAt:"2030-01-29T03:30:00Z",endAt:"2030-01-29T04:30:00Z",type:"PAID",reason:"Overlap test"});await expect(a.decideLeave(hr,{id:overlap,revision:1,decision:"APPROVED",comment:"Overlap"})).rejects.toMatchObject({code:"LEAVE_OVERLAP"});await a.withdrawLeave(alice,{id:overlap});
  const attendance=await import("@/features/time/attendance"),slot=await db.scheduleSlot.findFirstOrThrow({where:{weekday:2,workSchedule:{employeeId:aliceId,effectiveFrom:new Date("2030-01-29")}}});
  at("2030-01-29T03:49:59Z");await expect(attendance.checkIn(alice,{slotId:slot.id,workDate:"2030-01-29",operationKey:randomUUID()})).rejects.toMatchObject({code:"CHECKIN_EARLY"});at("2030-01-29T03:50:00Z");const opened=await attendance.checkIn(alice,{slotId:slot.id,workDate:"2030-01-29",operationKey:randomUUID()});at("2030-01-29T04:30:00Z");await attendance.checkOut(alice,{sessionId:opened.id,operationKey:randomUUID()});
  expect((await o.overtimeData(alice,aliceId,"2030-01-28",true)).current.blockers).toContain("Work overlaps approved leave");
  await a.decideLeave(hr,{id:leave,revision:2,decision:"CANCELLED",comment:"Resolve actual work during leave"});expect((await o.overtimeData(alice,aliceId,"2030-01-28",true)).current.blockers).not.toContain("Work overlaps approved leave");at("2030-01-21T12:00:00Z");
 });
 it("freezes reviewed overtime snapshots and rejects review-row deletion at the database boundary",async()=>{
  const row=await o.calculateOvertime(hr,{employeeId:hrId,week:"2030-01-07"});expect(row.status).toBe("APPROVED");await expect(db.overtimeReview.update({where:{id:row.id},data:{approvedSeconds:1,revision:{increment:1}}})).rejects.toBeDefined();await expect(db.overtimeReview.delete({where:{id:row.id}})).rejects.toBeDefined();
 });
 it("materializes an empty legacy policy baseline before appending a future threshold",async()=>{
  await db.organizationSettings.update({where:{id:1},data:{overtimePolicyVersions:[]}});await o.updateOvertimePolicy(admin,{effectiveFrom:"2030-02-04",thresholdSeconds:7200,weekStartDay:1,reason:"Initialize future threshold"});expect((await o.overtimeData(alice,aliceId,"2030-01-07",true)).current.thresholdSeconds).toBe(144000);
 });

 it("waits for the full overnight occurrence to end before absence review and resolves next-day coverage",async()=>{
  const schedules=await import("@/features/time/schedules"),base=await db.workSchedule.findFirstOrThrow({where:{employeeId:bobId,supersededAt:null},include:{slots:true}}),restoreSlots=base.slots.map(({weekday,startMinute,endMinute,endDayOffset})=>({weekday,startMinute,endMinute,endDayOffset}));
  const id=await schedules.publishSchedule(admin,{employeeId:bobId,employmentPeriodId:bobPeriod,effectiveFrom:"2030-02-03",effectiveUntil:"2030-02-04",label:"Overnight review",reason:"Night work evidence",baseScheduleId:base.id,baseRevision:base.revision,slots:[{weekday:7,startMinute:1320,endMinute:120,endDayOffset:1}],restoreSlots});
  at("2030-02-03T19:00:00Z");expect((await d.attendanceDay(hr,bobId,"2030-02-03")).days[0].absenceCount).toBe(0);
  at("2030-02-03T21:00:00Z");expect((await d.attendanceDay(hr,bobId,"2030-02-03")).days[0].absenceCount).toBe(1);
  const slot=await db.scheduleSlot.findFirstOrThrow({where:{workScheduleId:id}}),request=await c.submitCorrection(bob,{...add("2030-02-03","2030-02-03T19:30:00Z","2030-02-03T20:00:00Z"),scheduleSlotId:slot.id});await approve(request);
  const previous=await d.attendanceDay(hr,bobId,"2030-02-03");expect(previous.days[0]).toMatchObject({absenceCount:0,actualSeconds:0,lateSeconds:7200,missingEndedSeconds:7200});at("2030-01-21T12:00:00Z");
 });

 it("applies a successful correction to SELF attendance without changing its original schedule snapshot",async()=>{
  const before=await db.attendanceSession.findUniqueOrThrow({where:{id:openSession}});
  const request=await c.submitCorrection(bob,{...add("2030-01-08","2030-01-08T03:00:00Z","2030-01-08T07:30:00Z"),type:"REPLACE",sessionId:openSession});await approve(request);
  const after=await db.attendanceSession.findUniqueOrThrow({where:{id:openSession}});expect(after.source).toBe("CORRECTION");expect(after.checkoutAt?.toISOString()).toBe("2030-01-08T07:30:00.000Z");expect(after.scheduledStartAt).toEqual(before.scheduledStartAt);expect(after.scheduledEndAt).toEqual(before.scheduledEndAt);expect(after.checkinOperationKey).toBe(before.checkinOperationKey);
  expect((await db.attendanceCorrection.findUniqueOrThrow({where:{id:request}})).originalValues).toMatchObject({source:"SELF"});
 });

 it("links notifications to the authorized historical week and scopes exact leave details",async()=>{
  const n=await import("@/features/review/notifications"),own=await n.notificationList(alice),staff=await n.notificationList(hr);
  const notice=own.find(row=>row.sourceType==="overtime_reviews" && row.sourceId===reviewId);expect(notice?.href).toBe("/me/overtime?week=2030-01-07");
  expect(staff.find(row=>row.sourceType==="overtime_reviews" && row.sourceId===reviewId)?.href).toBe(`/manage/overtime?employeeId=${aliceId}&week=2030-01-07`);
  const leave=await a.requestLeave(alice,{startAt:"2030-02-05T03:00:00Z",endAt:"2030-02-05T04:00:00Z",type:"UNPAID",reason:"Exact detail test"});
  expect((await a.absenceData(alice,false,1,leave)).records).toHaveLength(1);await expect(a.absenceData(bob,false,1,leave)).rejects.toMatchObject({status:404});
  expect((await n.notificationList(hr)).find(row=>row.sourceId===leave)?.href).toBe(`/manage/leave?id=${leave}`);
  expect(JSON.stringify(own)).not.toMatch(/recipientUserId|eventKey|employeeId|passwordHash/);
 });

});
