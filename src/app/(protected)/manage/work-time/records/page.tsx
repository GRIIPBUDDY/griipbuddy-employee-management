import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { missingTimeList } from "@/features/work-time/service";
import { missingTimeStatuses } from "@/features/work-time/options";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar } from "@/components/ui/filter-bar";
import { Field, SelectField } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { TabNav } from "@/components/ui/tabs";
import { ReviewNav } from "@/components/review/review-nav";
import { RecordMissingTime, MissingTimeTable } from "@/components/work-time/work-time";
import { strings, type Query } from "@/lib/utils/query";
const keys = ["employeeId", "departmentId", "status", "from", "to", "page"];
export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const q = Object.fromEntries(Object.entries(strings(await searchParams)).filter(([k]) => keys.includes(k))) as Record<string, string>;
  const data = await pageResult(missingTimeList(await getIdentity(), q));
  return <>
    <PageHeader title="Work time" description="Time an employee was away while still checked in. A record is pending until reviewed; only a confirmed record makes the time unpaid, and the employee can see and respond to every record about them." actions={<RecordMissingTime employees={data.employees} today={data.today} timezone={data.timezone} />} />
    <ReviewNav />
    <TabNav label="Work-time views" items={[{ label: "Summary", href: "/manage/work-time", exact: true }, { label: "Missing-time records", href: "/manage/work-time/records" }]} />
    <FilterBar resetHref="/manage/work-time/records" columns={5}>
      <SelectField name="employeeId" label="Employee" defaultValue={q.employeeId ?? ""}><option value="">All employees</option>{data.employees.map(e => <option key={e.id} value={e.id}>{e.legalName} · {e.employeeNumber}</option>)}</SelectField>
      <SelectField name="departmentId" label="Department" defaultValue={q.departmentId ?? ""}><option value="">All departments</option>{data.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</SelectField>
      <SelectField name="status" label="Status" defaultValue={q.status ?? ""}><option value="">Any status</option>{Object.entries(missingTimeStatuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectField>
      <Field name="from" label="From" type="date" defaultValue={q.from} /><Field name="to" label="To" type="date" defaultValue={q.to} />
    </FilterBar>
    <MissingTimeTable records={data.records} timezone={data.timezone} staff />
    <Pagination page={data.page} hasNext={data.hasNext} query={q} />
  </>;
}
