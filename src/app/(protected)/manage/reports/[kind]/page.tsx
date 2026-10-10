import Link from "next/link";
import { pageActor,getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { reportData } from "@/features/insights/reports";
import { reportKind } from "@/features/insights/validation";
import { validated,uuidSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import { employeeOptions } from "@/features/people/data";
import { db } from "@/lib/db/client";
import { ReportNav,ReportFilters,ReportTable,Pagination,reportNames } from "@/components/insights/common";
export default async function Page({params,searchParams}:{params:Promise<{kind:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const actor=await pageActor(),identity=await getIdentity(),kindParam=(await params).kind,kind=await pageResult(Promise.resolve().then(()=>validated(reportKind,kindParam))),q=await searchParams;
 const result=await pageResult(reportData(identity,kind,q).then(data=>({data,error:null})).catch(error=>{if(error instanceof AppError&&error.status===400)return {data:null,error:error.message};throw error;}));
 const [employees,departments]=await Promise.all([employeeOptions(identity),db.department.findMany({orderBy:{name:"asc"},select:{id:true,name:true}})]);
 if(uuidSchema.safeParse(q.employeeId).success&&!employees.some(e=>e.id===q.employeeId)){const selected=await db.employee.findUnique({where:{id:q.employeeId as string},select:{id:true,legalName:true,employeeNumber:true}});if(selected)employees.push(selected);}
 const data=result.data,exportQuery=new URLSearchParams(Object.entries(q).filter(([key,v])=>key!=="page"&&typeof v==="string") as [string,string][]);
 return <><h1 className="text-3xl font-semibold">{reportNames[kind]} report</h1><ReportNav commission={actor.role==="ADMIN"||actor.canManageCommissions}/><p className="text-sm text-muted-foreground">Dates use the organization timezone{data?` (${data.timezone})`:""}. Until dates are exclusive; leave and salary filters include intersecting periods. Department uses the current or most recent employment record. Archived employees remain reportable.</p>{(kind==="attendance"||kind==="overtime")&&<p className="text-sm">{data&&`Calculated range: ${data.from} → ${data.until}. `}Limit: 31 days and 50 employees; select an employee or department to refine larger lists. Open sessions are excluded from worked time. Overtime includes full workweeks intersecting the range.</p>}{kind==="salary"&&<p className="text-sm">Finalized rows use immutable stored amounts. Other statuses show estimates. Commission components require a separate grant; restricted rows show an aggregate only.</p>}<ReportFilters kind={kind} query={q} employees={employees} departments={departments}/>{result.error&&<p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{result.error}</p>}{data&&<>{data.canExport?<Link className="inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white" href={`/api/manage/reports/${kind}/csv?${exportQuery}`}>Export filtered CSV</Link>:<p className="text-sm">Salary CSV requires the commission-management grant.</p>}<ReportTable data={data}/><Pagination {...data} path={`/manage/reports/${kind}`} query={q}/></>}</>;
}
