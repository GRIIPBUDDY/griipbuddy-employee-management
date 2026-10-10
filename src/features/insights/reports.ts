import "server-only";
import { Temporal } from "@js-temporal/polyfill";
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
import type { ReportCell,ReportColumn } from "./csv";
const pair=(key:string,label:string):ReportColumn=>({key,label});
const who=[pair("employee_number","Employee ID"),pair("employee_name","Employee")];
export const columns:Record<ReportKind,ReportColumn[]>={
 employees:[...who,pair("department","Department"),pair("position","Position"),pair("status","Employment status"),pair("join_date","Join date")],
 attendance:[...who,pair("date","Date"),pair("scheduled_seconds","Scheduled seconds"),pair("required_seconds","Required seconds"),pair("actual_seconds","Worked seconds (completed)"),pair("status","Attendance status"),pair("incomplete_count","Incomplete sessions"),pair("late_seconds","Late seconds")],
 overtime:[...who,pair("week","Workweek starts"),pair("actual_seconds","Eligible worked seconds"),pair("threshold_seconds","Threshold seconds"),pair("potential_seconds","Potential overtime seconds"),pair("approved_seconds","Active approved seconds"),pair("status","Review status")],
 leave:[...who,pair("type","Pay type"),pair("category","Leave type"),pair("start_date","Start date"),pair("end_date","End date (inclusive)"),pair("status","Status"),pair("reviewer","Reviewer")],
 salary:[...who,pair("from","Period starts"),pair("until","Period ends (exclusive)"),pair("currency","Currency"),pair("base_amount","Base compensation"),pair("overtime_amount","Approved overtime pay"),pair("commission_amount","Approved commission"),pair("bonus_amount","Bonuses"),pair("other_amount","Other adjustments"),pair("deduction_amount","Deductions"),pair("final_amount","Final / estimated amount"),pair("status","Salary status"),pair("projection","Detail access")],
 commissions:[...who,pair("reference","Pre-order reference"),pair("order_date","Order date"),pair("commission_amount","Commission amount"),pair("currency","Currency"),pair("status","Status"),pair("salary_period","Salary period starts")],
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
   const from=v.from??(kind==="documents"?today:localWeek(today,settings.weekStartDay)),until=v.until??(kind==="documents"?addDays(today,31):addDays(from,7));
   if(until<=from)throw new AppError(400,"RANGE","End date is exclusive and must follow start date.");
   const boundedDays=Temporal.PlainDate.from(from).until(Temporal.PlainDate.from(until)).days;
   if((kind==="attendance"||kind==="overtime")&&boundedDays>31)throw new AppError(400,"RANGE","Attendance and overtime reports allow at most 31 days.");
   const empFilter=Prisma.sql`true ${v.employeeId?Prisma.sql`AND e.employee_id=${v.employeeId}::uuid`:Prisma.empty} ${v.departmentId?Prisma.sql`AND e.department_id=${v.departmentId}::uuid`:Prisma.empty}`;
   const cte=employeeCte(today),status=v.status?Prisma.sql`AND r.status=${v.status}`:Prisma.empty;
   let records:Row[],total:number;
   if(kind==="attendance"||kind==="overtime") {
    const employees=await tx.$queryRaw<{employee_id:string;employee_number:string;employee_name:string}[]>(Prisma.sql`WITH ${cte} SELECT e.employee_id,e.employee_number,e.employee_name FROM employee_info e WHERE ${empFilter} ORDER BY e.employee_number,e.employee_id LIMIT 51`);
    if(employees.length>50)throw new AppError(400,"REPORT_LIMIT","Select an employee or department covering at most 50 employees for calculated reports.");
    const computed:Row[]=[];
    for(const employee of employees) {
     if(kind==="attendance") {
      const facts=await summary(tx,employee.employee_id,from,until,now);
      for(const day of facts.days){
       const flags=[...(day.pendingCorrections?["PENDING_CORRECTION"]:[]),...(day.incompleteCount?["INCOMPLETE"]:[]),...(day.absenceCount?["ABSENT"]:[]),...(day.lateSeconds?["LATE"]:[]),...(day.earlySeconds?["EARLY"]:[])];
       if(!flags.length)flags.push(day.excusedSeconds&&day.requiredSeconds===0?"EXCUSED":day.actualSeconds?"WORKED":day.scheduledSeconds?"SCHEDULED":"NO_SCHEDULE");
       if(v.status&&!flags.includes(v.status))continue;
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
    const dateFilter=(column:Prisma.Sql)=>Prisma.sql`${v.from?Prisma.sql`AND ${column}>=${from}::date`:Prisma.empty} ${v.until?Prisma.sql`AND ${column}<${until}::date`:Prisma.empty}`;
    const accessible=canCommissionStaff(actor);
    const salaryPart=(column:Prisma.Sql)=>Prisma.sql`CASE WHEN ${accessible} OR c.calculation_snapshot->>'commissionRelated'='false' THEN ${column}::text ELSE NULL END`;
    let source:Prisma.Sql;
    switch(kind){
     case "employees":source=Prisma.sql`SELECT e.*,e.employment_status AS status,e.join_date::text AS date_label FROM employee_info e WHERE ${empFilter} ${dateFilter(Prisma.sql`e.join_date`)}`;break;
     case "leave":source=Prisma.sql`SELECT e.employee_number,e.employee_name,l.type,l.category,(l.start_at AT TIME ZONE ${settings.timezone})::date::text AS start_date,((l.end_at-interval '1 second') AT TIME ZONE ${settings.timezone})::date::text AS end_date,l.status,COALESCE(u.display_name,'—') AS reviewer FROM leave_requests l JOIN employee_info e ON e.employee_id=l.employee_id LEFT JOIN users u ON u.id=l.reviewed_by WHERE ${empFilter} ${v.from?Prisma.sql`AND l.end_at>${dayStart(from,settings.timezone)}`:Prisma.empty} ${v.until?Prisma.sql`AND l.start_at<${dayStart(until,settings.timezone)}`:Prisma.empty}`;break;
     case "salary":source=Prisma.sql`SELECT e.employee_number,e.employee_name,p.start_date::text AS "from",p.end_date::text AS until,p.currency,p.status,${salaryPart(Prisma.sql`c.base_amount`)} AS base_amount,${salaryPart(Prisma.sql`c.overtime_amount`)} AS overtime_amount,${salaryPart(Prisma.sql`c.commission_amount`)} AS commission_amount,${salaryPart(Prisma.sql`c.bonus_amount`)} AS bonus_amount,${salaryPart(Prisma.sql`c.other_amount`)} AS other_amount,${salaryPart(Prisma.sql`c.deduction_amount`)} AS deduction_amount,c.final_amount::text AS final_amount,CASE WHEN ${accessible} OR c.calculation_snapshot->>'commissionRelated'='false' THEN 'Components permitted' ELSE 'Aggregate only' END AS projection FROM salary_calculations c JOIN salary_periods p ON p.id=c.salary_period_id JOIN employee_info e ON e.employee_id=c.employee_id WHERE ${empFilter} ${v.from?Prisma.sql`AND p.end_date>${from}::date`:Prisma.empty} ${v.until?Prisma.sql`AND p.start_date<${until}::date`:Prisma.empty}`;break;
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
   return {kind,columns:columns[kind],records,total,page:v.page,pages:Math.max(1,Math.ceil(total/25)),timezone:settings.timezone,from,until,canExport:kind!=="salary"||canCommissionStaff(actor)};
  },{isolationLevel:"RepeatableRead",timeout:30000});
 });
}
