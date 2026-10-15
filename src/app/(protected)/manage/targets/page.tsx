import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { targetList } from "@/features/performance/service";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar } from "@/components/ui/filter-bar";
import { Field, SelectField } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { RatingsNav, NewTargetButton, TargetTable } from "@/components/performance/performance";
import { strings, type Query } from "@/lib/utils/query";
const keys = ["employeeId", "periodType", "state", "month", "page"];
export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const q = Object.fromEntries(Object.entries(strings(await searchParams)).filter(([k]) => keys.includes(k))) as Record<string, string>;
  const data = await pageResult(targetList(await getIdentity(), q));
  return <>
    <PageHeader title="Targets" description="Measurable weekly and monthly results, separate from tasks. Results are recorded by staff; a target awaiting its result keeps that month's rating incomplete instead of scoring zero. Achievement counts up to 100 % per target." actions={<NewTargetButton employees={data.employees} today={data.today} />} />
    <RatingsNav />
    <FilterBar resetHref="/manage/targets">
      <SelectField name="employeeId" label="Employee" defaultValue={q.employeeId ?? ""}><option value="">All employees</option>{data.employees.map(e => <option key={e.id} value={e.id}>{e.legalName} · {e.employeeNumber}</option>)}</SelectField>
      <SelectField name="periodType" label="Period" defaultValue={q.periodType ?? ""}><option value="">Weekly and monthly</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option></SelectField>
      <SelectField name="state" label="Status" defaultValue={q.state ?? ""}><option value="">Any status</option><option value="AWAITING">Awaiting result</option><option value="RECORDED">Result recorded</option><option value="CANCELLED">Cancelled</option></SelectField>
      <Field name="month" label="Ending in month" type="month" defaultValue={q.month} />
    </FilterBar>
    <TargetTable records={data.records} today={data.today} staff />
    <Pagination page={data.page} hasNext={data.hasNext} query={q} />
  </>;
}
