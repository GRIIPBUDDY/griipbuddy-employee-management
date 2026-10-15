import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { assessmentRoster } from "@/features/performance/service";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar } from "@/components/ui/filter-bar";
import { Field, SelectField } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { RatingsNav, RosterTable, monthLabel } from "@/components/performance/performance";
import { strings, type Query } from "@/lib/utils/query";
const keys = ["month", "search", "departmentId", "page"];
export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const q = Object.fromEntries(Object.entries(strings(await searchParams)).filter(([k]) => keys.includes(k))) as Record<string, string>;
  const data = await pageResult(assessmentRoster(await getIdentity(), q));
  return <>
    <PageHeader title="Performance ratings" description="Every employee's monthly rating out of 10: an HR/Admin assessment out of 5 plus an automated score out of 5 from work time, assigned tasks and targets, less any confirmed warning deductions. A month can be finalized once it has ended and every input is complete." meta={<span>{monthLabel(data.month)}</span>} />
    <RatingsNav />
    <FilterBar resetHref="/manage/ratings" columns={3}>
      <Field name="month" label="Month" type="month" defaultValue={data.month.slice(0, 7)} />
      <Field name="search" label="Search" type="search" placeholder="Name or employee ID" defaultValue={q.search} maxLength={150} />
      <SelectField name="departmentId" label="Department" defaultValue={q.departmentId ?? ""}><option value="">All departments</option>{data.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</SelectField>
    </FilterBar>
    <RosterTable records={data.records} month={data.month} />
    <Pagination page={data.page} hasNext={data.hasNext} query={q} noun="employees" />
  </>;
}
