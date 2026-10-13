import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Metric } from "@/components/ui/stat";
import { Alert } from "@/components/ui/alert";
import { dateKey, displayInstant, localDate, addDays } from "@/features/time/dates";
import { formatMoney } from "@/features/pay/currency";
import { rangeLabel } from "@/lib/utils/date-range";
import { TodayPanel } from "@/components/time/schedule";
import { hm } from "@/components/time/attendance";
import { monthName } from "@/components/pay/statement";
import type { personalDashboard } from "@/features/insights/dashboard";
type Data = NonNullable<Awaited<ReturnType<typeof personalDashboard>>>;
const words = (v: string) => v[0] + v.slice(1).toLowerCase().replaceAll("_", " ");
function ListCard({ title, href, linkLabel, children, empty }: { title: string; href: string; linkLabel: string; children: React.ReactNode; empty?: string | false }) {
  return <Card><CardHeader actions={<Link href={href} className="link text-sm">{linkLabel}</Link>}><CardTitle>{title}</CardTitle></CardHeader><CardContent>{empty ? <p className="text-sm text-muted-foreground">{empty}</p> : children}</CardContent></Card>;
}
export function PersonalDashboard({ data }: { data: Data }) {
  const { schedule, overtime, earnings } = data, today = schedule?.today ?? "";
  return <div className="space-y-5">
    <div className="grid gap-5 xl:grid-cols-3">
      <div className="xl:col-span-2">{schedule ? <TodayPanel data={schedule} own /> : <Alert tone="neutral">No schedule information is available.</Alert>}</div>
      <div className="grid content-start gap-5">
        {overtime && <Card><CardHeader actions={<StatusBadge status={overtime.row?.status ?? (overtime.current.ended ? "UNREVIEWED" : "IN_PROGRESS")} label={overtime.row ? undefined : overtime.current.ended ? "Awaiting review" : "In progress"} />}><CardTitle>This week</CardTitle><CardDescription>{rangeLabel(overtime.current.week, addDays(overtime.current.weekEnd, -1))}</CardDescription></CardHeader><CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2"><Metric label="Worked" value={hm(overtime.current.actualSeconds)} /><Metric label="Scheduled" value={hm(overtime.current.scheduledSeconds)} /><Metric label="Potential overtime" value={hm(overtime.current.potentialSeconds)} /><Metric label="Approved overtime" value={hm(overtime.activeApprovedSeconds)} /></div>
          {overtime.current.blockers.length > 0 && <p className="text-xs text-warning">{overtime.current.blockers.join(" · ")}</p>}<Link href="/me/overtime" className="link text-sm">Overtime details</Link></CardContent></Card>}
        {earnings && !earnings.legacy && <Card><CardHeader actions={<StatusBadge status={earnings.paymentStatus} label={earnings.paymentStatus === "PAID" ? "Paid" : "Payment at month end"} />}><CardTitle>{monthName(`${earnings.month}-01`)} earnings</CardTitle></CardHeader><CardContent className="space-y-2"><p className="text-2xl font-semibold tabular-nums">{formatMoney(earnings.total!, earnings.currency)}</p><p className="text-sm text-muted-foreground">{formatMoney(earnings.finalized, earnings.currency)} finalized · {formatMoney(earnings.awaitingReview, earnings.currency)} pending review</p><Link href="/me/weekly-earnings" className="link text-sm">Earnings breakdown</Link></CardContent></Card>}
      </div>
    </div>
    <div className="grid gap-5 lg:grid-cols-2">
      <ListCard title="My open tasks" href="/me/tasks" linkLabel="All tasks" empty={!data.tasks.length && "No open tasks. You’re all caught up."}><ul className="divide-y">{data.tasks.map(t => { const late = !!t.dueDate && dateKey(t.dueDate) < today; return <li key={t.id} className="flex items-center justify-between gap-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-medium">{t.title}</p><p className="text-xs text-muted-foreground">{t.dueDate ? `Due ${dateKey(t.dueDate)}` : "No due date"} · {words(t.priority)} priority</p></div><div className="flex shrink-0 gap-1.5">{late && <StatusBadge status="OVERDUE" />}<StatusBadge status={t.status} label={t.status === "ASSIGNED" ? "Not started" : undefined} /></div></li>; })}</ul></ListCard>
      <ListCard title="Notifications" href="/notifications" linkLabel={`View all${data.notifications.unread ? ` (${data.notifications.unread} unread)` : ""}`} empty={!data.notifications.records.length && "No notifications yet."}><ul className="divide-y">{data.notifications.records.map(n => <li key={n.id} className="py-2.5"><Link className="block text-sm hover:text-primary" href={n.href}><span className="flex items-center gap-2 font-medium">{!n.readAt && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />}{n.title}</span><span className="line-clamp-1 text-muted-foreground">{n.text}</span></Link></li>)}</ul></ListCard>
      <ListCard title="My leave" href="/me/leave" linkLabel="Request or review leave" empty={!data.leave.length && "No leave requests yet."}><ul className="divide-y">{data.leave.map(r => <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm"><Link className="hover:text-primary" href={`/me/leave?id=${r.id}`}><span className="font-medium">{words(r.category)}</span><span className="block text-xs text-muted-foreground">{rangeLabel(localDate(r.startAt, schedule?.timezone ?? "UTC"), localDate(new Date(r.endAt.getTime() - 1000), schedule?.timezone ?? "UTC"))}</span></Link><StatusBadge status={r.status} /></li>)}</ul></ListCard>
      <ListCard title="Latest salary statement" href="/me/salary" linkLabel="Salary history" empty={!data.salary.length && "No finalized salary statements yet."}>{data.salary.map(r => <Link key={r.id} href={`/me/salary/${r.id}`} className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3 hover:bg-subtle"><span><span className="block text-sm font-medium">{monthName(r.period.from)}</span><span className="text-xs text-muted-foreground">Finalized</span></span><span className="text-right"><span className="block font-semibold tabular-nums">{formatMoney(r.finalAmount, r.period.currency)}</span><StatusBadge status={r.period.paymentStatus} label={r.period.paymentStatus === "PAID" ? "Paid" : "Payment pending"} /></span></Link>)}</ListCard>
      {data.commissions !== undefined && <ListCard title="Pre-order commission" href="/me/commissions" linkLabel="My pre-orders" empty={!data.commissions.length && "No pre-orders recorded yet."}><ul className="divide-y">{data.commissions.map(r => <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span className="font-medium">{r.reference}</span><span className="flex items-center gap-2"><span className="tabular-nums">{formatMoney(r.commissionAmount, r.currency)}</span><StatusBadge status={r.status} /></span></li>)}</ul></ListCard>}
    </div>
    {schedule && data.todaySessions.length > 0 && <p className="text-xs text-muted-foreground">Today’s sessions: {data.todaySessions.map(s => `${displayInstant(s.checkinAt, s.timezoneSnapshot)} → ${s.checkoutAt ? displayInstant(s.checkoutAt, s.timezoneSnapshot) : "open"}`).join(" · ")}</p>}
  </div>;
}
