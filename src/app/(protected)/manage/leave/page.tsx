import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { absenceData } from "@/features/review/absence";
import { recordOptions } from "@/features/people-operations/records";
import { organizationSummary } from "@/features/settings/service";
import { Absence, LeaveBalances, typeLabels } from "@/components/review/absence";
import { balanceData, leaveTypes } from "@/features/review/leave-balance";
import { ReviewNav } from "@/components/review/review-nav";
import { SelectField } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar } from "@/components/ui/filter-bar";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { Pagination } from "@/components/ui/pagination";
import { Alert } from "@/components/ui/alert";
import { resolveRange } from "@/lib/utils/date-range";
import { localDate } from "@/features/time/dates";
import { strings, type Query } from "@/lib/utils/query";
export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const q = strings(await searchParams), identity = await getIdentity(), settings = await pageResult(organizationSummary(identity));
  const range = resolveRange(q, localDate(new Date(), settings.timezone), { defaultMode: "all", allowAll: true, weekStartDay: settings.weekStartDay });
  const filters = { ...(q.employeeId ? { employeeId: q.employeeId } : {}), ...(q.status ? { status: q.status } : {}), ...(q.category ? { category: q.category } : {}), ...(range.mode !== "all" && !range.error ? { from: range.from, until: range.until } : {}) };
  const [data, options, types] = await Promise.all([pageResult(absenceData(identity, true, Number(q.page ?? 1), undefined, filters)), pageResult(recordOptions(identity)), pageResult(leaveTypes(identity))]);
  const balance = q.employeeId && options.employees.some(e => e.id === q.employeeId) ? await pageResult(balanceData(identity, { employeeId: q.employeeId }, true)) : null;
  return <>
    <PageHeader title="Leave & holidays" description="Review leave requests and manage company holidays. Dates are inclusive and use the organization timezone." />
    <ReviewNav />
    <FilterBar resetHref="/manage/leave"><DateRangeFilter mode={range.mode} from={range.from} to={range.to} modes={["all", "today", "week", "month", "custom"]} label="Leave dates" timezone={settings.timezone} />
      <SelectField label="Employee" name="employeeId" defaultValue={q.employeeId ?? ""}><option value="">All employees</option>{options.employees.map(e => <option key={e.id} value={e.id}>{e.legalName}</option>)}</SelectField>
      <SelectField label="Status" name="status" defaultValue={q.status ?? ""}><option value="">All statuses</option>{["PENDING", "APPROVED", "REJECTED", "WITHDRAWN", "CANCELLED"].map(s => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}</SelectField>
      <SelectField label="Leave type" name="category" defaultValue={q.category ?? ""}><option value="">All types</option>{types.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}</SelectField></FilterBar>
    {range.error && <Alert tone="warning" role="alert">{range.error} Showing all dates.</Alert>}
    {balance ? <LeaveBalances data={balance} staff types={types} /> : <p className="text-sm text-muted-foreground">Choose an employee to see and adjust their leave balances.</p>}
    <Absence data={data} staff labels={typeLabels(types)} />
    <Pagination page={data.page} hasNext={data.hasNext} query={q} />
  </>;
}
