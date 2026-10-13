import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { attendanceDay } from "@/features/review/data";
import { addDays, displayInstant, dateKey } from "@/features/time/dates";
import { CorrectionForm } from "@/components/review/forms";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Metric } from "@/components/ui/stat";
import { TableContainer } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { rangeLabel } from "@/lib/utils/date-range";
import { hm } from "@/components/time/attendance";
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params, q = await searchParams, data = await pageResult(attendanceDay(await getIdentity(), id, q.date));
  const nav = buttonVariants({ variant: "outline", size: "sm" }), base = `/manage/employees/${id}/attendance/day?date=`;
  return <>
    <PageHeader breadcrumbs={[{ label: "Attendance", href: `/manage/attendance?employeeId=${id}&range=date&date=${data.from}` }, { label: data.employee.legalName, href: `/manage/employees/${id}/attendance` }, { label: data.from }]} title={rangeLabel(data.from, data.from)} description={`${data.employee.legalName} · ${data.employee.employeeNumber} · ${data.timezone}`}
      actions={<><Link className={nav} href={`${base}${addDays(data.from, -1)}`}><ChevronLeft size={15} aria-hidden="true" />Previous day</Link><Link className={nav} href={`${base}${addDays(data.from, 1)}`}>Next day<ChevronRight size={15} aria-hidden="true" /></Link></>} />
    <div className="grid gap-3 sm:grid-cols-3"><Metric label="Scheduled" value={hm(data.scheduledSeconds)} /><Metric label="Required" value={hm(data.requiredSeconds)} hint="After leave and holidays" /><Metric label="Completed actual" value={hm(data.actualSeconds)} hint="Daily totals clip at local midnight" /></div>
    <Card><CardHeader><CardTitle>Sessions touching this date</CardTitle><CardDescription>Official timestamps change only through a reviewed correction.</CardDescription></CardHeader><CardContent>{data.sessions.length ? <TableContainer label="Sessions" flush className="rounded-lg border"><table className="data-table min-w-[760px]"><thead><tr><th>Status</th><th>Scheduled context</th><th>Actual</th><th className="num">Full duration</th><th>Source</th><th className="text-right">Action</th></tr></thead><tbody>{data.sessions.map(s => <tr key={s.id}>
      <td><StatusBadge status={s.voidedAt ? "VOIDED" : s.checkoutAt ? "COMPLETED" : "INCOMPLETE"} label={s.voidedAt ? "Voided" : s.checkoutAt ? "Completed" : "Open / incomplete"} /></td>
      <td className="text-[13px]">{s.scheduledStartAt ? `${displayInstant(s.scheduledStartAt, data.timezone)} – ${s.scheduledEndAt ? displayInstant(s.scheduledEndAt, data.timezone) : "—"}` : "Unscheduled"}<span className="block text-xs text-muted-foreground">Work date {dateKey(s.workDate)}</span></td>
      <td className="text-[13px]">{displayInstant(s.checkinAt, data.timezone)} – {s.checkoutAt ? displayInstant(s.checkoutAt, data.timezone) : <span className="text-warning">missing checkout</span>}</td>
      <td className="num">{s.checkoutAt ? hm((s.checkoutAt.getTime() - s.checkinAt.getTime()) / 1000) : "—"}</td><td className="text-xs text-muted-foreground">{s.source.toLowerCase()} · rev {s.revision}</td>
      <td className="text-right"><Link className="link text-[13px]" href={`/manage/corrections?employeeId=${id}&sessionId=${s.id}&workDate=${dateKey(s.workDate)}`}>Propose correction</Link></td></tr>)}</tbody></table></TableContainer>
      : <EmptyState title="No sessions on this date" description="Ended required periods without attendance appear as absences in review. Leave, holidays and rest days excuse attendance." />}</CardContent></Card>
    <Card><CardHeader><CardTitle>Related correction requests</CardTitle></CardHeader><CardContent>{data.corrections.length ? <ul className="divide-y rounded-lg border">{data.corrections.map(c => <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"><span><Link className="link" href={`/manage/corrections?id=${c.id}`}>{c.type.toLowerCase()} request</Link> · {c.reason}{c.reviewComment ? ` · ${c.reviewComment}` : ""}</span><StatusBadge status={c.status} /></li>)}</ul> : <p className="text-sm text-muted-foreground">No correction requests for this date.</p>}</CardContent></Card>
    <CorrectionForm timezone={data.timezone} employeeId={id} workDate={data.from} />
  </>;
}
