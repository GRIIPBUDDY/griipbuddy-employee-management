import Link from "next/link";
import { ClipboardCheck, Clock3, Flame, CircleCheck, Hourglass } from "lucide-react";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { incidentOverview } from "@/features/people-operations/incidents";
import { employeeOptions } from "@/features/people/data";
import { organizationSummary } from "@/features/settings/service";
import { NewIncidentButton, IncidentTable, IncidentFilters } from "@/components/people-operations/incidents";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { strings, type Query } from "@/lib/utils/query";
const keys = ["page", "search", "employeeId", "kind", "category", "severity", "status", "state", "from", "to", "reportedBy"];
export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const q = Object.fromEntries(Object.entries(strings(await searchParams)).filter(([k, v]) => keys.includes(k) && typeof v === "string")) as Record<string, string>, identity = await getIdentity();
  const [data, employees, settings] = await Promise.all([pageResult(incidentOverview(identity, q)), pageResult(employeeOptions(identity)), pageResult(organizationSummary(identity))]);
  const { page: _page, ...filters } = q; void _page;
  return <>
    <PageHeader title="Incident & performance records" description="Factual records of mistakes, incidents, corrective actions and positive contributions. A record awaiting review is not a confirmed fault, and no pay or status change follows automatically." actions={<NewIncidentButton employees={employees} timezone={settings.timezone} today={data.today} />} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <StatCard label="Open records" value={data.counts.open} icon={ClipboardCheck} href="/manage/incidents?state=OPEN" />
      <StatCard label="Awaiting review" value={data.counts.awaiting} icon={Hourglass} href="/manage/incidents?status=UNDER_REVIEW" />
      <StatCard label="High or critical, open" value={data.counts.high} icon={Flame} tone={data.counts.high ? "warning" : "neutral"} href="/manage/incidents?state=OPEN&severity=HIGH" />
      <StatCard label="Follow-ups overdue" value={data.counts.overdue} icon={Clock3} tone={data.counts.overdue ? "danger" : "neutral"} href="/manage/incidents?state=OPEN" />
      <StatCard label="Resolved in 30 days" value={data.counts.resolved} icon={CircleCheck} href="/manage/incidents?state=RESOLVED" />
    </div>
    {data.repeated.length > 0 && <Card><CardHeader><CardTitle>Repeated concerns to review</CardTitle><CardDescription>Three or more concerns in the last 90 days (excluding drafts and unsubstantiated records). A count is a prompt for a conversation, not a judgement.</CardDescription></CardHeader><CardContent><ul className="flex flex-wrap gap-2">{data.repeated.map(r => <li key={r.employee.id}><Link className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-subtle" href={`/manage/employees/${r.employee.id}/incidents`}>{r.employee.legalName}<span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{r.count}</span></Link></li>)}</ul></CardContent></Card>}
    <IncidentFilters query={q} resetHref="/manage/incidents" reporters={data.reporters} />
    <IncidentTable records={data.records} />
    <Pagination page={data.page} pages={data.pages} total={data.total} query={filters} />
  </>;
}
