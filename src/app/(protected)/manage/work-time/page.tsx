import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { workTimeReport } from "@/features/work-time/service";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar } from "@/components/ui/filter-bar";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { SelectField } from "@/components/ui/field";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { TabNav } from "@/components/ui/tabs";
import { ReviewNav } from "@/components/review/review-nav";
import { WorkTimeTotals, WorkTimeDays, WorkTimeEmpty } from "@/components/work-time/work-time";
import { strings, type Query } from "@/lib/utils/query";
const keys = ["employeeId", "departmentId", "range", "date", "from", "to", "until", "status", "page"];
export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams, q = Object.fromEntries(Object.entries(strings(query)).filter(([k]) => keys.includes(k))) as Record<string, string>;
  const data = await pageResult(workTimeReport(await getIdentity(), { range: "month", ...q }));
  return <>
    <PageHeader title="Work time" description="Scheduled payable time against verified work, from the schedule and attendance records. Breaks are never expected work; approved leave and holidays are credited, not missing. Confirmed shortfalls are unpaid exactly once; anything awaiting review is not deducted." />
    <ReviewNav />
    <TabNav label="Work-time views" items={[{ label: "Summary", href: "/manage/work-time", exact: true }, { label: "Missing-time records", href: "/manage/work-time/records" }]} />
    <FilterBar resetHref="/manage/work-time">
      <DateRangeFilter mode={data.mode} from={data.from} to={data.to} timezone={data.timezone} />
      <SelectField name="employeeId" label="Employee" defaultValue={q.employeeId ?? ""}><option value="">All employees</option>{data.employees.map(e => <option key={e.id} value={e.id}>{e.legalName} · {e.employeeNumber}</option>)}</SelectField>
      <SelectField name="departmentId" label="Department" defaultValue={q.departmentId ?? ""}><option value="">All departments</option>{data.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</SelectField>
      <SelectField name="status" label="Days shown" defaultValue={q.status ?? ""}><option value="">Scheduled or worked days</option><option value="SHORTFALL">Days with missing time</option><option value="PENDING">Days awaiting review</option><option value="ALL">Every date</option></SelectField>
    </FilterBar>
    <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">{data.label}</span> · {data.timezone} · 10 employees per page</p>
    {data.rows.length === 0 ? <WorkTimeEmpty /> : data.rows.map(row => <Card key={row.employee.id}>
      <CardHeader><CardTitle>{row.employee.legalName}</CardTitle><CardDescription>{row.employee.employeeNumber}</CardDescription></CardHeader>
      <CardContent className="space-y-4"><WorkTimeTotals totals={row.totals} /><WorkTimeDays days={row.days} employeeId={row.employee.id} staff /></CardContent>
    </Card>)}
    <Pagination page={data.page} hasNext={data.hasNext} query={q} noun="employees" />
  </>;
}
