import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db/client";
import { securityBoundary } from "@/lib/authorization/actor";
import { assertRole,assertManageCommissions } from "@/lib/authorization/policy";
import { validated } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import type { Identity } from "@/types/auth";
import { databaseNow } from "@/features/time/clock";
import { addDays,dateValue,dayStart,localDate } from "@/features/time/dates";
import { summary,weekCalculation } from "@/features/review/summary";
import { localWeek } from "@/features/review/calculation";
import { canCommissionStaff } from "@/features/pay/access";
import { employeeCte } from "./employees";
import { reportKind,reportQuery,reportStatuses,type ReportKind } from "./validation";
import { resolveRange } from "@/lib/utils/date-range";
import type { ReportCell,ReportColumn } from "./csv";
const pair=(key:string,label:string):ReportColumn=>({key,label});
const who=[pair("employee_number","Employee ID"),pair("employee_name","Employee")];
export const columns:Record<ReportKind,ReportColumn[]>={
 employees:[...who,pair("department","Department"),pair("position","Position"),pair("status","Employment status"),pair("join_date","Join date")],
 attendance:[...who,pair("date","Date"),pair("scheduled_seconds","Scheduled seconds"),pair("required_seconds","Required seconds"),pair("actual_seconds","Worked seconds (completed)"),pair("status","Attendance status"),pair("incomplete_count","Incomplete sessions"),pair("late_seconds","Late seconds")],
 lateness:[...who,pair("department","Department"),pair("scheduled_count","Scheduled days"),pair("late_count","Late arrivals"),pair("late_seconds","Total late seconds"),pair("absence_count","Absences"),pair("early_count","Early departures"),pair("missing_seconds","Missed scheduled seconds"),pair("actual_seconds","Worked seconds (completed)"),pair("status","Summary")],
 overtime:[...who,pair("week","Workweek starts"),pair("actual_seconds","Eligible worked seconds"),pair("threshold_seconds","Threshold seconds"),pair("potential_seconds","Potential overtime seconds"),pair("approved_seconds","Active approved seconds"),pair("status","Review status")],
 leave:[...who,pair("type","Pay type"),pair("category","Leave type"),pair("start_date","Start date"),pair("end_date","End date (inclusive)"),pair("status","Status"),pair("reviewer","Reviewer")],
 salary:[...who,pair("from","Period starts"),pair("until","Period ends (exclusive)"),pair("currency","Currency"),pair("base_amount","Base compensation"),pair("overtime_amount","Approved overtime pay"),pair("commission_amount","Approved commission"),pair("bonus_amount","Bonuses"),pair("other_amount","Other adjustments"),pair("deduction_amount","Deductions"),pair("final_amount","Final / estimated amount"),pair("status","Salary status"),pair("projection","Detail access")],
 commissions:[...who,pair("reference","Pre-order reference"),pair("order_date","Order date"),pair("commission_amount","Commission amount"),pair("currency","Currency"),pair("status","Status"),pair("salary_period","Salary period starts")],
 tasks:[...who,pair("title","Task"),pair("assigned_date","Assigned date"),pair("due_date","Due date"),pair("completed_date","Completed date"),pair("priority","Priority"),pair("status","Status")],
 documents:[...who,pair("type","Document type"),pair("expires_on","Expiry date"),pair("status","Expiry status")]
};
type Row=Record<string,ReportCell>;
const limit=5000;
export async function reportData(identity:Identity|null,kindInput:unknown,input:unknown={},exporting=false) {
 return securityBoundary(identity,async actor=>{
  assertRole(actor,["ADMIN","HR_MANAGER"]);const kind=validated(reportKind,kindInput),v=validated(reportQuery,input);
  if(kind==="commissions" || exporting&&kind==="salary")assertManageCommissions(actor);
  if(v.status&&!reportStatuses[kind].includes(v.status))throw new AppError(400,"STATUS","Choose a status supported by this report.");
  return db.$transaction(async tx=>{
   const settings=await tx.organizationSettings.findUniqueOrThrow({where:{id:1},select:{timezone:true,weekStartDay:true}}),now=await databaseNow(tx),today=localDate(now,settings.timezone);
   // Inclusive UI dates (`to`, presets) and legacy exclusive `until` resolve to one organization-local range.
   // Document expiry, like directory/leave/salary reports, is unfiltered by date unless dates are chosen.
   const calculated=kind==="attendance"||kind==="overtime"||kind==="lateness",dated=calculated||kind==="tasks";
   const rangeInput=Object.fromEntries(Object.entries({from:v.from,until:v.until,to:v.to,date:v.date,range:v.range}).filter((e):e is [string,string]=>!!e[1]));
   const resolved=resolveRange(rangeInput,today,{weekStartDay:settings.weekStartDay,defaultMode:kind==="overtime"?"week":kind==="lateness"?"month":dated?"today":"all",allowAll:!dated,...(calculated?{maxDays:31}:{})});
   if(resolved.error)throw new AppError(400,"RANGE",calculated&&resolved.error.startsWith("Choose a range")?"Attendance, lateness and overtime reports allow at most 31 days.":resolved.error);
   const filtered=resolved.mode!=="all",from=resolved.from??today,until=resolved.until??addDays(today,1);
   const empFilter=Prisma.sql`true ${v.employeeId?Prisma.sql`AND e.employee_id=${v.employeeId}::uuid`:Prisma.empty} ${v.departmentId?Prisma.sql`AND e.department_id=${v.departmentId}::uuid`:Prisma.empty}`;
   const cte=employeeCte(today),status=v.status?Prisma.sql`AND r.status=${v.status}`:Prisma.empty;
   let records:Row[],total:number;
   if(kind==="attendance"||kind==="overtime"||kind==="lateness") {
    const employees=await tx.$queryRaw<{employee_id:string;employee_number:string;employee_name:string;department:string}[]>(Prisma.sql`WITH ${cte} SELECT e.employee_id,e.employee_number,e.employee_name,e.department FROM employee_info e WHERE ${empFilter} ORDER BY e.employee_number,e.employee_id LIMIT 51`);
    if(employees.length>50)throw new AppError(400,"REPORT_LIMIT","Select an employee or department covering at most 50 employees for calculated reports.");
    const computed:Row[]=[];
    for(const employee of employees) {
     if(kind==="lateness") {
      // One row per employee: late arrivals (beyond the grace period), absences and early departures in the range.
      const facts=await summary(tx,employee.employee_id,from,until,now),d=facts.days,count=(f:(day:typeof d[number])=>boolean)=>d.filter(f).length;
      const row={...employee,scheduled_count:count(x=>x.scheduledSeconds>0),late_count:count(x=>x.lateSeconds>0),late_seconds:d.reduce((n,x)=>n+x.lateSeconds,0),absence_count:d.reduce((n,x)=>n+x.absenceCount,0),early_count:count(x=>x.earlySeconds>0),missing_seconds:d.reduce((n,x)=>n+x.missingEndedSeconds,0),actual_seconds:d.reduce((n,x)=>n+x.actualSeconds,0)};
      const flags=[...(row.late_count?["LATE"]:[]),...(row.absence_count?["ABSENT"]:[]),...(row.early_count?["EARLY"]:[])];if(!flags.length)flags.push("CLEAR");
      if(v.status&&!flags.includes(v.status))continue;
      if(v.days==="ACTIVE"&&!row.scheduled_count&&!row.actual_seconds)continue;
      computed.push({...row,status:flags.join(" · ")});
     } else if(kind==="attendance") {
      const facts=await summary(tx,employee.employee_id,from,until,now);
      for(const day of facts.days){
       const flags=[...(day.pendingCorrections?["PENDING_CORRECTION"]:[]),...(day.incompleteCount?["INCOMPLETE"]:[]),...(day.absenceCount?["ABSENT"]:[]),...(day.lateSeconds?["LATE"]:[]),...(day.earlySeconds?["EARLY"]:[])];
       if(!flags.length)flags.push(day.excusedSeconds&&day.requiredSeconds===0?"EXCUSED":day.actualSeconds?"WORKED":day.scheduledSeconds?"SCHEDULED":"NO_SCHEDULE");
       if(v.status&&!flags.includes(v.status))continue;
       // ACTIVE omits dates that have neither a scheduled occurrence nor attendance or review activity.
       if(v.days==="ACTIVE"&&flags.length===1&&flags[0]==="NO_SCHEDULE")continue;
       computed.push({...employee,date:day.date,scheduled_seconds:day.scheduledSeconds,required_seconds:day.requiredSeconds,actual_seconds:day.actualSeconds,status:flags.join(" · "),incomplete_count:day.incompleteCount,late_seconds:day.lateSeconds});
      }
     } else for(let week=localWeek(from,settings.weekStartDay);week<until;week=addDays(week,7)) {
      const facts=await weekCalculation(tx,employee.employee_id,week,now),review=await tx.overtimeReview.findUnique({where:{employeeId_weekStartDate:{employeeId:employee.employee_id,weekStartDate:dateValue(week)}}});
      const stale=!!review&&(review.status==="STALE"||review.actualSecondsSnapshot!==facts.actualSeconds||review.thresholdSeconds!==facts.thresholdSeconds||review.policyVersion!==facts.policyVersion||facts.blockers.length>0);
      const currentStatus=stale?"STALE":review?.status??"UNREVIEWED";
      if(v.status&&v.status!==currentStatus)continue;
      computed.push({...employee,week,actual_seconds:facts.actualSeconds,threshold_seconds:facts.thresholdSeconds,potential_seconds:facts.potentialSeconds,approved_seconds:review?.status==="APPROVED"&&!stale?review.approvedSeconds:0,status:currentStatus});
     }
    }
    total=computed.length;records=exporting?computed:computed.slice((v.page-1)*25,v.page*25);
   } else {
    const dateFilter=(column:Prisma.Sql)=>filtered?Prisma.sql`AND ${column}>=${from}::date AND ${column}<${until}::date`:Prisma.empty;
    const accessible=canCommissionStaff(actor);
    const salaryPart=(column:Prisma.Sql)=>Prisma.sql`CASE WHEN ${accessible} OR c.calculation_snapshot->>'commissionRelated'='false' THEN ${column}::text ELSE NULL END`;
    let source:Prisma.Sql;
    switch(kind){
     case "tasks":{const dateColumn=v.dateBy==="DUE"?Prisma.sql`t.due_date`:v.dateBy==="COMPLETED"?Prisma.sql`(t.completed_at AT TIME ZONE ${settings.timezone})::date`:Prisma.sql`t.assigned_date`;source=Prisma.sql`SELECT e.employee_number,e.employee_name,t.title,t.assigned_date::text,t.due_date::text,(t.completed_at AT TIME ZONE ${settings.timezone})::date::text AS completed_date,t.priority,t.status FROM task_assignments t JOIN employee_info e ON e.employee_id=t.employee_id WHERE ${empFilter} AND ${dateColumn}>=${from}::date AND ${dateColumn}<${until}::date`;break;}
     case "employees":source=Prisma.sql`SELECT e.*,e.employment_status AS status,e.join_date::text AS date_label FROM employee_info e WHERE ${empFilter} ${dateFilter(Prisma.sql`e.join_date`)}`;break;
     case "leave":source=Prisma.sql`SELECT e.employee_number,e.employee_name,l.type,l.category,(l.start_at AT TIME ZONE ${settings.timezone})::date::text AS start_date,((l.end_at-interval '1 second') AT TIME ZONE ${settings.timezone})::date::text AS end_date,l.status,COALESCE(u.display_name,'—') AS reviewer FROM leave_requests l JOIN employee_info e ON e.employee_id=l.employee_id LEFT JOIN users u ON u.id=l.reviewed_by WHERE ${empFilter} ${filtered?Prisma.sql`AND l.end_at>${dayStart(from,settings.timezone)} AND l.start_at<${dayStart(until,settings.timezone)}`:Prisma.empty}`;break;
     case "salary":source=Prisma.sql`SELECT e.employee_number,e.employee_name,p.start_date::text AS "from",p.end_date::text AS until,p.currency,p.status,${salaryPart(Prisma.sql`c.base_amount`)} AS base_amount,${salaryPart(Prisma.sql`c.overtime_amount`)} AS overtime_amount,${salaryPart(Prisma.sql`c.commission_amount`)} AS commission_amount,${salaryPart(Prisma.sql`c.bonus_amount`)} AS bonus_amount,${salaryPart(Prisma.sql`c.other_amount`)} AS other_amount,${salaryPart(Prisma.sql`c.deduction_amount`)} AS deduction_amount,c.final_amount::text AS final_amount,CASE WHEN ${accessible} OR c.calculation_snapshot->>'commissionRelated'='false' THEN 'Components permitted' ELSE 'Aggregate only' END AS projection FROM salary_calculations c JOIN salary_periods p ON p.id=c.salary_period_id JOIN employee_info e ON e.employee_id=c.employee_id WHERE ${empFilter} ${filtered?Prisma.sql`AND p.end_date>${from}::date AND p.start_date<${until}::date`:Prisma.empty}`;break;
     case "commissions":source=Prisma.sql`SELECT e.employee_number,e.employee_name,c.reference,(c.order_at AT TIME ZONE ${settings.timezone})::date::text AS order_date,c.commission_amount::text AS commission_amount,c.currency,c.status,p.start_date::text AS salary_period FROM preorders c JOIN employee_info e ON e.employee_id=c.employee_id LEFT JOIN salary_periods p ON p.id=c.salary_period_id WHERE ${empFilter} ${dateFilter(Prisma.sql`(c.order_at AT TIME ZONE ${settings.timezone})::date`)}`;break;
     case "documents":source=Prisma.sql`SELECT e.employee_number,e.employee_name,d.type::text,d.expires_on::text,CASE WHEN d.expires_on<=${today}::date THEN 'EXPIRED' WHEN d.expires_on<=${addDays(today,30)}::date THEN 'APPROACHING' ELSE 'VALID' END AS status FROM employee_documents d JOIN employee_info e ON e.employee_id=d.employee_id WHERE ${empFilter} AND d.deleted_at IS NULL AND d.expires_on IS NOT NULL ${dateFilter(Prisma.sql`d.expires_on`)}`;break;
    }
    const base=Prisma.sql`WITH ${cte},r AS (${source})`;
    const counts=await tx.$queryRaw<{count:bigint}[]>(Prisma.sql`${base} SELECT count(*) FROM r WHERE true ${status}`);total=Number(counts[0].count);
    if(exporting&&total>limit)throw new AppError(400,"EXPORT_LIMIT","Refine filters to export at most 5,000 rows.");
    const rows=await tx.$queryRaw<Row[]>(Prisma.sql`${base} SELECT * FROM r WHERE true ${status} ORDER BY employee_number,employee_name,to_jsonb(r)::text LIMIT ${exporting?limit:25} OFFSET ${exporting?0:(v.page-1)*25}`);
    // Explicit report columns are the only fields returned or exported.
    records=rows.map(row=>Object.fromEntries(columns[kind].map(c=>[c.key,c.key==="join_date"?row.date_label:row[c.key]??null])));
   }
   records=records.map(row=>Object.fromEntries(columns[kind].map(c=>[c.key,row[c.key]??null])));
   return {kind,columns:columns[kind],records,total,page:v.page,pages:Math.max(1,Math.ceil(total/25)),timezone:settings.timezone,from:filtered?from:undefined,until:filtered?until:undefined,to:resolved.to,label:resolved.label,mode:resolved.mode,canExport:kind!=="salary"||canCommissionStaff(actor)};
  },{isolationLevel:"RepeatableRead",timeout:30000});
 });
}
