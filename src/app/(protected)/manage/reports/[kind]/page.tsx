import Link from "next/link";
import { FileDown, Download } from "lucide-react";
import { pageActor, getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { reportData } from "@/features/insights/reports";
import { reportKind } from "@/features/insights/validation";
import { validated, uuidSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import { employeeOptions } from "@/features/people/data";
import { organizationSummary } from "@/features/settings/service";
import { db } from "@/lib/db/client";
import { ReportNav, ReportFilters, ReportTable, reportNames, reportDescriptions } from "@/components/insights/common";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
export default async function Page({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await pageActor(), identity = await getIdentity(), kindParam = (await params).kind, kind = await pageResult(Promise.resolve().then(() => validated(reportKind, kindParam))), q = await searchParams;
  const input = { ...q, ...(kind === "attendance" && q.days === undefined ? { days: "ACTIVE" } : {}) };
  const result = await pageResult(reportData(identity, kind, input).then(data => ({ data, error: null })).catch(error => { if (error instanceof AppError && error.status === 400) return { data: null, error: error.message }; throw error; }));
  const [employees, departments, settings] = await Promise.all([employeeOptions(identity), db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }), pageResult(organizationSummary(identity))]);
  if (uuidSchema.safeParse(q.employeeId).success && !employees.some(e => e.id === q.employeeId)) { const selected = await db.employee.findUnique({ where: { id: q.employeeId as string }, select: { id: true, legalName: true, employeeNumber: true } }); if (selected) employees.push(selected); }
  const data = result.data, exportQuery = new URLSearchParams(Object.entries(input).filter(([key, v]) => key !== "page" && typeof v === "string") as [string, string][]);
  return <>
    <PageHeader breadcrumbs={[{ label: "Reports", href: "/manage/reports" }, { label: reportNames[kind] }]} title={`${reportNames[kind]} report`} description={reportDescriptions[kind]}
      actions={data && (data.canExport ? <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><a href={`/api/manage/reports/${kind}/pdf?${exportQuery}`}><FileDown size={16} aria-hidden="true" />Download PDF</a></Button><Button asChild variant="outline"><Link href={`/api/manage/reports/${kind}/csv?${exportQuery}`}><Download size={16} aria-hidden="true" />Export CSV</Link></Button></div> : <span className="text-sm text-muted-foreground">CSV export requires the commission-management grant.</span>)} />
    <ReportNav commission={actor.role === "ADMIN" || actor.canManageCommissions} />
    <ReportFilters kind={kind} query={input} employees={employees} departments={departments} range={data ? { mode: data.mode, from: data.from, to: data.to } : undefined} timezone={settings.timezone} />
    {result.error && <Alert tone="warning" role="alert" title="These filters can’t be applied">{result.error}</Alert>}
    {data && <><p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">{data.label}</span> · {data.timezone}{(kind === "attendance" || kind === "overtime" || kind === "lateness") ? " · up to 31 days and 50 employees per calculation; open sessions are excluded from worked time" : ""}{kind === "salary" ? " · finalized rows use stored amounts; others are estimates" : ""}{kind === "leave" || kind === "salary" ? " · includes periods intersecting the dates" : ""}.</p>
      <ReportTable data={data} /><Pagination page={data.page} pages={data.pages} total={data.total} query={input} path={`/manage/reports/${kind}`} /></>}
  </>;
}
