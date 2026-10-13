import Link from "next/link";
import { ScrollText } from "lucide-react";
import { getIdentity, pageActor } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { auditData } from "@/features/insights/audit";
import { employeeOptions } from "@/features/people/data";
import { organizationSummary } from "@/features/settings/service";
import { db } from "@/lib/db/client";
import { Field, SelectField } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar } from "@/components/ui/filter-bar";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { TableContainer, Cell2 } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { displayInstant, localDate } from "@/features/time/dates";
import { resolveRange } from "@/lib/utils/date-range";
import { strings, type Query } from "@/lib/utils/query";
const words = (v: string) => v.replaceAll("_", " ").toLowerCase().replace(/^./, c => c.toUpperCase());
export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const actor = await pageActor(), identity = await getIdentity(), q = strings(await searchParams), settings = await pageResult(organizationSummary(identity));
  const range = resolveRange(q, localDate(new Date(), settings.timezone), { defaultMode: "all", allowAll: true, weekStartDay: settings.weekStartDay });
  const rest = Object.fromEntries(Object.entries(q).filter(([key]) => !["range", "date", "to", "from", "until"].includes(key)));
  const data = await pageResult(auditData(identity, { ...rest, ...(range.mode !== "all" && !range.error ? { from: range.from, until: range.until } : {}) }));
  const [employees, actors] = await Promise.all([pageResult(employeeOptions(identity)), db.user.findMany({ orderBy: { email: "asc" }, take: 300, select: { id: true, displayName: true, email: true, employee: { select: { legalName: true } } } })]);
  return <>
    <PageHeader title="Audit log" description={`${actor.role === "ADMIN" ? "Company-wide audit history." : "History for your permitted operational areas."} Read-only; sensitive values are masked.`} />
    <FilterBar resetHref="/manage/audit" columns={4}>
      <DateRangeFilter mode={range.mode} from={range.from} to={range.to} modes={["all", "today", "week", "month", "custom"]} timezone={settings.timezone} />
      <SelectField label="Performed by" name="actorId" defaultValue={q.actorId ?? ""}><option value="">Anyone</option>{actors.map(u => <option key={u.id} value={u.id}>{u.employee?.legalName ?? u.displayName ?? u.email}</option>)}</SelectField>
      <SelectField label="Affected employee" name="employeeId" defaultValue={q.employeeId ?? ""}><option value="">Any employee</option>{employees.map(e => <option key={e.id} value={e.id}>{e.legalName}</option>)}</SelectField>
      <Field label="Search" name="search" type="search" placeholder="Action, record type or ID" defaultValue={q.search ?? ""} maxLength={150} />
      <Field label="Exact action" name="action" placeholder="e.g. OVERTIME_REJECTED" defaultValue={q.action ?? ""} maxLength={80} />
      <Field label="Record type" name="entity" placeholder="e.g. overtime_reviews" defaultValue={q.entity ?? ""} maxLength={80} />
      <Field label="Record ID" name="recordId" defaultValue={q.recordId ?? ""} maxLength={100} />
    </FilterBar>
    {range.error && <Alert tone="warning" role="alert">{range.error} Showing all dates.</Alert>}
    {!data.records.length ? <EmptyState icon={ScrollText} title="No audit events match" description="Widen the dates or clear a filter." /> :
    <TableContainer label="Audit events"><table className="data-table min-w-[880px]"><thead><tr><th>When</th><th>Action</th><th>Record</th><th>Performed by</th><th>Employee</th></tr></thead><tbody>{data.records.map(row => <tr key={row.id}>
      <td className="whitespace-nowrap text-[13px] text-muted-foreground">{displayInstant(row.eventTime, data.timezone)}</td>
      <td><Link className="link" href={`/manage/audit/${row.id}`}>{words(row.action)}</Link></td>
      <td><Cell2 primary={row.entity.replaceAll("_", " ")} secondary={<span className="font-mono text-[11px]">{row.entityId ?? "—"}</span>} /></td>
      <td className="whitespace-nowrap">{row.actorName}</td><td className="whitespace-nowrap text-[13px]">{row.employeeName ?? <span className="text-muted-foreground">—</span>}</td>
    </tr>)}</tbody></table></TableContainer>}
    <Pagination page={data.page} pages={data.pages} total={data.total} noun="events" query={q} path="/manage/audit" />
  </>;
}
