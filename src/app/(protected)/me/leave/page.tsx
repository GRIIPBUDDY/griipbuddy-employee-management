import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { absenceData } from "@/features/review/absence";
import { Absence, RequestLeaveButton, leaveCategories } from "@/components/review/absence";
import { SelectField } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar } from "@/components/ui/filter-bar";
import { Pagination } from "@/components/ui/pagination";
import { strings, type Query } from "@/lib/utils/query";
export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const q = strings(await searchParams), { page, ...rest } = q;
  const filters = Object.fromEntries(Object.entries(rest).filter(([key]) => ["status", "category", "id", "from", "until"].includes(key)));
  const data = await pageResult(absenceData(await getIdentity(), false, Number(page ?? 1), undefined, filters));
  return <>
    <PageHeader title="My leave" description="Request leave and follow its review. No leave balance is calculated by this system." actions={<RequestLeaveButton timezone={data.timezone} />} />
    <FilterBar resetHref="/me/leave" columns={3}><SelectField label="Status" name="status" defaultValue={q.status ?? ""}><option value="">All statuses</option>{["PENDING", "APPROVED", "REJECTED", "WITHDRAWN", "CANCELLED"].map(s => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}</SelectField><SelectField label="Leave type" name="category" defaultValue={q.category ?? ""}><option value="">All types</option>{leaveCategories.map(s => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}</SelectField></FilterBar>
    <Absence data={data} staff={false} />
    <Pagination page={data.page} hasNext={data.hasNext} query={q} />
  </>;
}
