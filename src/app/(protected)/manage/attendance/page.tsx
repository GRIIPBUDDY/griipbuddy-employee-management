import Link from "next/link";
import { Clock3, Timer } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { attendanceManagement } from "@/features/review/data";
import { overtimeQueue } from "@/features/review/overtime";
import { liveWorkforce } from "@/features/time/live";
import { dateKey, addDays } from "@/features/time/dates";
import { rangeLabel } from "@/lib/utils/date-range";
import { LiveWorkforcePanel } from "@/components/time/live-workforce";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { SelectField } from "@/components/ui/field";
import { PageHeader, SectionHeading } from "@/components/ui/page-header";
import { FilterBar } from "@/components/ui/filter-bar";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { TableContainer, Cell2 } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { Alert } from "@/components/ui/alert";
import { ReviewNav } from "@/components/review/review-nav";
import { hm } from "@/components/time/attendance";
import { AppError } from "@/lib/utils/errors";
type Query = Record<string, string | string[] | undefined>;
export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams, text = (key: string) => typeof query[key] === "string" ? query[key] as string : "";
  const input = Object.fromEntries(Object.entries({ ...query, days: text("days") || "ACTIVE" }).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""));
  const identity = await getIdentity();
  const result = await pageResult(attendanceManagement(identity, input).then(data => ({ data, error: null as string | null })).catch(async error => { if (error instanceof AppError && error.status === 400) return { data: await attendanceManagement(identity, { days: input.days, ...(input.employeeId ? { employeeId: input.employeeId } : {}) }), error: error.message }; throw error; }));
  const data = result.data;
  // Live sessions and the overtime queue are independent of the selected dates. A failure shows an error state in that
  // section only (never zero people working); access was already enforced by the report above.
  const [live, overtime] = await Promise.all([liveWorkforce(identity).catch(() => null), overtimeQueue(identity, { status: "PENDING" }).catch(() => null)]);
  return <>
    <PageHeader title="Attendance" description="Who is working right now, followed by scheduled, required and actual time per employee and organization-local date." />
    <ReviewNav />
    <LiveWorkforcePanel initial={live} attention />
    <SectionHeading className="pt-2" title="Attendance history" description="For the selected dates and filters. Only completed sessions count as actual time; sessions still open are shown in Currently working above." />
    <FilterBar resetHref="/manage/attendance">
      <DateRangeFilter mode={data.mode} from={data.from} to={data.to} timezone={data.timezone} />
      <SelectField name="employeeId" label="Employee" defaultValue={text("employeeId")}><option value="">All employees</option>{data.employees.map(e => <option key={e.id} value={e.id}>{e.legalName} · {e.employeeNumber}</option>)}</SelectField>
      <SelectField name="departmentId" label="Department" defaultValue={text("departmentId")}><option value="">All departments</option>{data.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</SelectField>
      <SelectField name="status" label="Exception" defaultValue={text("status")}><option value="">Any</option>{[["LATE", "Late arrival"], ["EARLY", "Early departure"], ["MISSING", "Missing required time"], ["INCOMPLETE", "Missing checkout"], ["PENDING_CORRECTION", "Pending correction"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectField>
      <SelectField name="overtimeStatus" label="Weekly overtime" defaultValue={text("overtimeStatus")}><option value="">Any</option>{["PENDING", "APPROVED", "REJECTED", "NOT_REQUIRED", "STALE", "UNREVIEWED"].map(s => <option key={s} value={s}>{s.replaceAll("_", " ").toLowerCase().replace(/^./, c => c.toUpperCase())}</option>)}</SelectField>
      <SelectField name="days" label="Dates shown" defaultValue={input.days}><option value="ACTIVE">Scheduled or worked days</option><option value="ALL">Every date in range</option></SelectField>
    </FilterBar>
    {result.error && <Alert tone="warning" role="alert" title="Showing today instead">{result.error}</Alert>}
    <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">{data.label}</span> · {data.timezone} · {data.records.length} rows on this page (10 employees per page)</p>
    {data.records.length === 0 ? <EmptyState icon={Clock3} title="No attendance for these filters" description={input.days === "ACTIVE" ? "No scheduled occurrences or attendance on these dates. Choose “Every date in range” to include rest days." : "Change the dates or filters."} /> :
    <TableContainer label="Attendance by employee and date"><table className="data-table min-w-[980px]"><thead><tr><th>Employee</th><th>Date</th><th className="num">Scheduled</th><th className="num">Required</th><th className="num">Actual</th><th className="num">Late</th><th className="num">Early</th><th className="num" title="Required time from ended periods without attendance">Missed</th><th>Flags</th><th>Weekly overtime</th></tr></thead><tbody>{data.records.map(r => <tr key={`${r.employee.id}:${r.date}`}>
      <td><Cell2 primary={r.employee.legalName} secondary={r.employee.employeeNumber} /></td>
      <td className="whitespace-nowrap"><Link className="link tabular-nums" href={`/manage/employees/${r.employee.id}/attendance/day?date=${r.date}`}>{r.date}</Link></td>
      <td className="num">{hm(r.scheduledSeconds)}</td><td className="num">{hm(r.requiredSeconds)}</td><td className="num font-medium">{hm(r.actualSeconds)}{r.provisional ? "*" : ""}</td>
      <td className="num">{r.lateSeconds ? <span className="text-warning">{hm(r.lateSeconds)}</span> : "—"}</td><td className="num">{r.earlySeconds ? <span className="text-warning">{hm(r.earlySeconds)}</span> : "—"}</td><td className="num">{r.missingEndedSeconds ? <span className="text-danger">{hm(r.missingEndedSeconds)}</span> : "—"}</td>
      <td><div className="flex flex-wrap gap-1">{r.absenceCount > 0 && <StatusBadge status="ABSENT" label={`${r.absenceCount} absent`} />}{r.incompleteCount > 0 && <StatusBadge status="INCOMPLETE" label="Missing checkout" />}{r.openCount > r.incompleteCount && <StatusBadge status="CURRENTLY_WORKING" label="Session open" />}{r.pendingCorrections > 0 && <StatusBadge status="PENDING" label="Correction pending" />}{!r.scheduledSeconds && r.actualSeconds > 0 && <StatusBadge status="UNSCHEDULED" tone="info" label="Unscheduled work" />}{!r.absenceCount && !r.incompleteCount && !r.pendingCorrections && !r.openCount && (r.scheduledSeconds > 0 || !r.actualSeconds) && <span className="text-xs text-muted-foreground">{r.scheduledSeconds ? "—" : "Rest day"}</span>}</div></td>
      <td><Link href={`/manage/overtime?employeeId=${r.employee.id}&week=${r.date}`} className="inline-flex items-center gap-2"><StatusBadge status={r.overtime.status} /><span className="text-xs text-muted-foreground tabular-nums">{hm(r.overtime.potentialSeconds)}</span></Link></td>
    </tr>)}</tbody></table></TableContainer>}
    {data.records.some(r => r.provisional) && <p className="text-xs text-muted-foreground">* Includes a session still in progress (provisional).</p>}
    <Pagination page={data.page} hasNext={data.hasNext} query={query} />
    <Card>
      <CardHeader actions={<Link className="link text-sm" href="/manage/overtime?status=PENDING">Open overtime review</Link>}><CardTitle>Potential overtime awaiting review</CardTitle><CardDescription>Calculated after checkout from completed sessions. Nothing here is payable until a reviewer approves it.</CardDescription></CardHeader>
      <CardContent>{!overtime ? <Alert tone="warning" role="alert">The overtime queue could not be loaded. Open overtime review to try again.</Alert> : overtime.records.length === 0 ? <EmptyState icon={Timer} title="No overtime awaiting review" /> :
        <TableContainer label="Potential overtime awaiting review" flush className="rounded-lg border"><table className="data-table min-w-[640px]"><thead><tr><th>Employee</th><th>Week</th><th className="num">Actual</th><th className="num">Potential</th><th className="text-right">Action</th></tr></thead><tbody>{overtime.records.slice(0, 10).map(r => <tr key={r.id}>
          <td>{r.employee.legalName}</td><td className="whitespace-nowrap tabular-nums">{rangeLabel(dateKey(r.weekStartDate), addDays(dateKey(r.weekStartDate), 6))}</td><td className="num">{hm(r.actualSecondsSnapshot)}</td><td className="num font-medium">{hm(r.potentialSecondsSnapshot)}</td>
          <td className="text-right"><Link className="link" href={`/manage/overtime?employeeId=${r.employeeId}&week=${dateKey(r.weekStartDate)}`}>Review<span className="sr-only"> for {r.employee.legalName}</span></Link></td>
        </tr>)}</tbody></table></TableContainer>}
        {overtime && (overtime.records.length > 10 || overtime.hasNext) && <p className="mt-2 text-xs text-muted-foreground">Showing the 10 most recent weeks; open overtime review for the full queue.</p>}</CardContent>
    </Card>
  </>;
}
