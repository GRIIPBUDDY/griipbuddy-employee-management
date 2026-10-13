import Link from "next/link";
import { ownSummary } from "@/features/review/data";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { ownAttendance } from "@/features/time/data";
import { AttendanceHistory, hm } from "@/components/time/attendance";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar } from "@/components/ui/filter-bar";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Metric } from "@/components/ui/stat";
import { TableContainer } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { AppError } from "@/lib/utils/errors";
type Query = Record<string, string | string[] | undefined>;
export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams, identity = await getIdentity();
  const dates = Object.fromEntries(["range", "date", "from", "to", "until"].flatMap(key => typeof query[key] === "string" && query[key] ? [[key, query[key]]] : []));
  const load = async (input: Record<string, string>, error: string | null = null) => ({ data: await ownAttendance(identity, { ...input, page: typeof query.page === "string" ? query.page : 1 }), summary: await ownSummary(identity, input), error });
  const { data, summary, error } = await pageResult(load(dates).catch(async e => { if (e instanceof AppError && e.status === 400) return load({}, e.message); throw e; }));
  // Only dates with a scheduled occurrence or attendance are listed; recurring definitions never add empty dates.
  const days = summary?.days.filter(d => d.scheduledSeconds || d.actualSeconds || d.openCount) ?? [];
  return <>
    <PageHeader title="My attendance" description="Your check-ins, checkouts and daily totals. Actual time counts completed sessions only." actions={<Link href="/me/corrections" className="link text-sm">Request a correction</Link>} />
    {summary && <FilterBar resetHref="/me/attendance"><DateRangeFilter mode={summary.mode} from={summary.from} to={summary.to} timezone={summary.timezone} /></FilterBar>}
    {error && <Alert tone="warning" role="alert" title="Showing today instead">{error}</Alert>}
    {summary && <Card><CardHeader><CardTitle>{summary.label}</CardTitle><CardDescription>{summary.timezone} · weekly overtime is reviewed separately on the <Link className="link" href="/me/overtime">overtime page</Link>.</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3"><Metric label="Scheduled" value={hm(summary.scheduledSeconds)} /><Metric label="Required" value={hm(summary.requiredSeconds)} hint="After approved leave and holidays" /><Metric label="Completed actual" value={hm(summary.actualSeconds)} /></div>
      {days.length ? <TableContainer label="Daily totals" flush className="rounded-lg border"><table className="data-table"><thead><tr><th>Date</th><th className="num">Scheduled</th><th className="num">Actual</th><th>Status</th></tr></thead><tbody>{days.map(d => <tr key={d.date}><td className="tabular-nums">{d.date}</td><td className="num">{hm(d.scheduledSeconds)}</td><td className="num">{hm(d.actualSeconds)}</td><td>{d.incompleteCount ? <StatusBadge status="INCOMPLETE" label="Missing checkout" /> : d.openCount ? <StatusBadge status="CURRENTLY_WORKING" label="In progress" /> : d.lateSeconds ? <StatusBadge status="LATE" /> : d.actualSeconds ? <StatusBadge status="WORKED" /> : <StatusBadge status="SCHEDULED" />}</td></tr>)}</tbody></table></TableContainer> : <EmptyState title="No scheduled or worked dates" description="Nothing was scheduled or recorded on these dates." />}
    </CardContent></Card>}
    {data ? <AttendanceHistory data={data} own path="/me/attendance" query={dates} /> : <EmptyState title="No employee profile" description="This account is not linked to an employee profile." />}
  </>;
}
