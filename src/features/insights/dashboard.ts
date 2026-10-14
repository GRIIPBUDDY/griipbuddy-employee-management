import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db/client";
import { securityBoundary } from "@/lib/authorization/actor";
import { assertRole } from "@/lib/authorization/policy";
import type { Identity } from "@/types/auth";
import { databaseNow } from "@/features/time/clock";
import { localDate,dateValue,addDays,dayStart } from "@/features/time/dates";
import { ownSchedule } from "@/features/time/data";
import { ownOvertime } from "@/features/review/overtime";
import { absenceData } from "@/features/review/absence";
import { salaryData } from "@/features/pay/periods";
import { monthToDate } from "@/features/pay/weekly";
import { commissionData } from "@/features/pay/commissions";
import { notificationPage } from "@/features/review/notifications";
import { auditData } from "./audit";
import { employeeCte } from "./employees";
import { taskData } from "@/features/tasks/service";
import { enabledModules } from "@/features/settings/config";
import { incidentsAwaitingReview } from "@/features/people-operations/incidents";
export async function managementDashboard(identity:Identity|null) {
 return securityBoundary(identity,async actor=>{
  assertRole(actor,["ADMIN","HR_MANAGER"]);const on=await enabledModules();
  const data=await db.$transaction(async tx=>{
   const settings=await tx.organizationSettings.findUniqueOrThrow({where:{id:1},select:{timezone:true}}),now=await databaseNow(tx),today=localDate(now,settings.timezone),from=dayStart(today,settings.timezone),until=dayStart(addDays(today,1),settings.timezone);
   const [employeeCounts,todayAttendance,leave,corrections,overtime,salary,documents,performance]=await Promise.all([
    tx.$queryRaw<{total:bigint;active:bigint}[]>(Prisma.sql`WITH ${employeeCte(today)} SELECT count(*) AS total,count(*) FILTER(WHERE employment_status='ACTIVE') AS active FROM employee_info`),
    tx.$queryRaw<{present:bigint;completed:bigint;open:bigint;incomplete:bigint}[]>(Prisma.sql`SELECT count(DISTINCT employee_id) AS present,count(*) FILTER(WHERE checkout_at IS NOT NULL) AS completed,count(*) FILTER(WHERE checkout_at IS NULL) AS open,count(*) FILTER(WHERE checkout_at IS NULL AND (scheduled_end_at IS NULL OR scheduled_end_at<${now})) AS incomplete FROM attendance_sessions WHERE voided_at IS NULL AND checkin_at<${until} AND (checkout_at>${from} OR checkout_at IS NULL)`),
    tx.$queryRaw<{pending:bigint;onleave:bigint}[]>(Prisma.sql`SELECT count(*) FILTER(WHERE status='PENDING') AS pending,count(DISTINCT employee_id) FILTER(WHERE status='APPROVED' AND start_at<${until} AND end_at>${from}) AS onleave FROM leave_requests`),
    tx.attendanceCorrection.count({where:{status:"PENDING"}}),tx.overtimeReview.count({where:{status:{in:["PENDING","STALE"]}}}),
    actor.role==="ADMIN"?tx.salaryPeriod.count({where:{status:{in:["CALCULATED","REVIEWED","APPROVED"]}}}):Promise.resolve(null),
    tx.employeeDocument.count({where:{deletedAt:null,expiresOn:{gt:dateValue(today),lte:dateValue(addDays(today,30))}}}),
    tx.performanceReview.count({where:{publishedAt:null}})
   ]);
   const dayQuery="range=today";
   const cards=[
    {label:"Total employees",value:Number(employeeCounts[0].total),href:"/manage/employees"},
    {label:"Active employees",value:Number(employeeCounts[0].active),href:"/manage/employees?status=ACTIVE"},
    {label:"Approved leave today",value:Number(leave[0].onleave),href:`/manage/reports/leave?status=APPROVED&${dayQuery}`},
    {label:"Employees with sessions today",value:Number(todayAttendance[0].present),href:`/manage/attendance?${dayQuery}`},
    {label:"Incomplete sessions touching today",value:Number(todayAttendance[0].incomplete),href:`/manage/reports/attendance?status=INCOMPLETE&${dayQuery}`},
    {label:"Pending leave requests",value:Number(leave[0].pending),href:"/manage/leave?status=PENDING"},
    {label:"Pending attendance corrections",value:corrections,href:"/manage/corrections?status=PENDING"},
    {label:"Overtime awaiting review",value:overtime,href:"/manage/overtime"},
    {label:"Documents approaching expiry",value:documents,href:"/manage/reports/documents?status=APPROACHING"},
    ...(on.performance?[{label:"Draft performance reviews",value:performance,href:"/manage/performance?status=DRAFT"}]:[]),
    ...(on.incidents?[{label:"Incidents awaiting review",value:await incidentsAwaitingReview(actor),href:"/manage/incidents?status=UNDER_REVIEW"}]:[]),
    ...(salary===null?[]:[{label:"Salary periods awaiting closeout",value:salary,href:"/manage/salary"}])
   ];
   return {today,timezone:settings.timezone,cards,attendance:{completed:Number(todayAttendance[0].completed),open:Number(todayAttendance[0].open)}};
  },{isolationLevel:"RepeatableRead"});
  return {...data,recent:(await auditData(identity)).records.slice(0,5)};
 });
}
export async function personalDashboard(identity:Identity|null) {
 return securityBoundary(identity,async actor=>{
  if(!actor.employeeId)return null;
  const on=await enabledModules(),showCommissions=on.commissions && actor.preorderCommissionEnabled;
  const [schedule,overtime,leave,notifications,salary,commissions]=await Promise.all([ownSchedule(identity),ownOvertime(identity),absenceData(identity),notificationPage(identity),salaryData(identity,{},true),showCommissions?commissionData(identity):Promise.resolve(null)]);
  const start=schedule?dayStart(schedule.today,schedule.timezone):null,end=schedule?dayStart(addDays(schedule.today,1),schedule.timezone):null;
  const todaySessions=schedule&&start&&end?schedule.recent.filter(s=>s.checkinAt<end&&(!s.checkoutAt||s.checkoutAt>start)):[];
  const taskLists=schedule && on.tasks?await Promise.all(["ASSIGNED","IN_PROGRESS"].map(status=>taskData(identity,{from:"1900-01-01",until:addDays(schedule.today,1),status},true))):[];
  const tasks=taskLists.flatMap(list=>list.records).sort((a,b)=>(a.dueDate?.getTime()??Infinity)-(b.dueDate?.getTime()??Infinity)).slice(0,5);
  return {earnings:await monthToDate(identity),schedule,todaySessions,tasks,overtime,leave:leave.records.slice(0,5),notifications:{...notifications,records:notifications.records.slice(0,5)},salary:salary.records.slice(0,1),commissions:showCommissions?commissions?.records.slice(0,3)??[]:undefined};
 });
}
