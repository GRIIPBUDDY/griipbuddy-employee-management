import Link from "next/link";
import { Timer } from "lucide-react";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { organizationSummary } from "@/features/settings/service";
import { overtimeData, overtimeQueue } from "@/features/review/overtime";
import { employeeOptions } from "@/features/people/data";
import { WeeklyOvertime } from "@/components/review/overtime";
import { ReviewNav } from "@/components/review/review-nav";
import { Field, SelectField } from "@/components/ui/field";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar } from "@/components/ui/filter-bar";
import { TableContainer, Cell2 } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { localDate, dateKey, addDays } from "@/features/time/dates";
import { rangeLabel } from "@/lib/utils/date-range";
import { hm } from "@/components/time/attendance";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const identity = await getIdentity(), q = await searchParams, status = typeof q.status === "string" ? q.status : "", search = typeof q.search === "string" ? q.search : "";
  const queue = await pageResult(overtimeQueue(identity, { page: q.page ?? 1, status, search })), settings = await pageResult(organizationSummary(identity)), employees = await pageResult(employeeOptions(identity));
  const week = typeof q.week === "string" ? q.week : localDate(new Date(), settings.timezone), data = typeof q.employeeId === "string" && q.employeeId ? await pageResult(overtimeData(identity, q.employeeId, week)) : null;
  return <>
    <PageHeader title="Overtime review" description="Potential overtime appears here after the employee checks out. Approve or reject it; only approved time is payable. Rejected overtime stays in history with zero payable time, and attendance records are never changed by a decision." />
    <ReviewNav />
    <Card><CardHeader><CardTitle>Open an employee’s week</CardTitle><CardDescription>Choose any date inside the workweek to calculate or review it.</CardDescription></CardHeader><CardContent><form key={`${q.employeeId ?? ""}:${week}`} className="grid items-end gap-3 sm:grid-cols-[1fr_12rem_auto]"><SelectField label="Employee" name="employeeId" required defaultValue={typeof q.employeeId === "string" ? q.employeeId : ""}><option value="">Select employee</option>{employees.map(e => <option key={e.id} value={e.id}>{e.legalName} · {e.employeeNumber}</option>)}</SelectField><Field type="date" label="Date in week" name="week" defaultValue={week} /><Button type="submit">Open week</Button></form></CardContent></Card>
    {data && <WeeklyOvertime key={`${data.employee.id}:${data.current.week}`} data={data} own={false} />}
    <FilterBar resetHref="/manage/overtime" columns={3}><Field name="search" label="Search" type="search" placeholder="Employee name or ID" defaultValue={search} maxLength={150} /><SelectField name="status" label="Review status" defaultValue={status}><option value="">All statuses</option>{["PENDING", "APPROVED", "REJECTED", "STALE", "NOT_REQUIRED"].map(s => <option key={s} value={s}>{s.replaceAll("_", " ").toLowerCase().replace(/^./, c => c.toUpperCase())}</option>)}</SelectField></FilterBar>
    {queue.records.length ? <TableContainer label="Overtime review queue"><table className="data-table min-w-[760px]"><thead><tr><th>Employee</th><th>Week</th><th>Status</th><th className="num">Actual</th><th className="num">Potential</th><th className="num">Approved</th><th className="text-right">Action</th></tr></thead><tbody>{queue.records.map(r => <tr key={r.id}>
      <td><Cell2 primary={r.employee.legalName} /></td><td className="whitespace-nowrap tabular-nums">{rangeLabel(dateKey(r.weekStartDate), addDays(dateKey(r.weekStartDate), 6))}</td><td><StatusBadge status={r.status} /></td>
      <td className="num">{hm(r.actualSecondsSnapshot)}</td><td className="num">{hm(r.potentialSecondsSnapshot)}</td><td className="num">{r.status === "APPROVED" ? hm(r.approvedSeconds) : "—"}</td>
      <td className="text-right"><Button asChild variant={r.status === "PENDING" ? "default" : "outline"} size="sm"><Link href={`?employeeId=${r.employeeId}&week=${dateKey(r.weekStartDate)}`}>{r.status === "PENDING" ? "Review" : "Details"}<span className="sr-only"> for {r.employee.legalName}</span></Link></Button></td>
    </tr>)}</tbody></table></TableContainer> : <EmptyState icon={Timer} title="No overtime reviews match" description="Change the filters, or open an employee’s completed week above to calculate it." />}
    <Pagination page={queue.page} hasNext={queue.hasNext} query={{ status, search }} />
  </>;
}
