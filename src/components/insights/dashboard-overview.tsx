import Link from "next/link";
import { UsersRound, Clock3, Palmtree, AlertTriangle, ChevronRight, CheckCircle2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat";
import { TableContainer } from "@/components/ui/table";
import { displayInstant } from "@/features/time/dates";
import type { managementDashboard } from "@/features/insights/dashboard";
type Data = Awaited<ReturnType<typeof managementDashboard>>;
const queues = ["Pending leave requests", "Pending attendance corrections", "Overtime awaiting review", "Salary periods awaiting closeout", "Documents approaching expiry", "Draft performance reviews"];
export function DashboardOverview({ data }: { data: Data }) {
  const card = (label: string) => data.cards.find(c => c.label === label), value = (label: string) => card(label)?.value ?? 0;
  const attention = queues.map(card).filter((c): c is Data["cards"][number] => !!c), pending = attention.reduce((sum, c) => sum + c.value, 0);
  return <>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Active employees" value={value("Active employees")} hint={`${value("Total employees")} in the directory`} icon={UsersRound} tone="primary" href={card("Active employees")?.href} />
      <StatCard label="Working today" value={value("Employees with sessions today")} hint={`${data.attendance.completed} completed · ${data.attendance.open} open sessions`} icon={Clock3} tone="success" href={card("Employees with sessions today")?.href} />
      <StatCard label="On approved leave today" value={value("Approved leave today")} hint="Excused from scheduled work" icon={Palmtree} href={card("Approved leave today")?.href} />
      <StatCard label="Missing checkouts" value={value("Incomplete sessions touching today")} hint="Sessions past their scheduled end" icon={AlertTriangle} tone={value("Incomplete sessions touching today") ? "warning" : "neutral"} href={card("Incomplete sessions touching today")?.href} />
    </div>
    <div className="grid gap-5 xl:grid-cols-5">
      <Card className="xl:col-span-2"><CardHeader><CardTitle>Needs attention</CardTitle><CardDescription>{pending ? `${pending} items across ${attention.filter(c => c.value).length} queues · all dates` : "No pending approvals."}</CardDescription></CardHeader>
        <CardContent className="pt-0"><ul className="divide-y">{attention.map(c => <li key={c.label}><Link href={c.href} className="group -mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-sm hover:bg-subtle"><span className="flex items-center gap-2.5">{c.value ? <span aria-hidden="true" className="h-2 w-2 rounded-full bg-warning" /> : <CheckCircle2 size={15} aria-hidden="true" className="text-success" />}{c.label}</span><span className="flex items-center gap-1"><span className={c.value ? "rounded-full bg-warning-soft px-2 text-xs font-semibold text-warning tabular-nums" : "text-xs text-muted-foreground"}>{c.value}</span><ChevronRight size={15} aria-hidden="true" className="text-slate-400 group-hover:text-foreground" /></span></Link></li>)}</ul></CardContent></Card>
      <Card className="xl:col-span-3"><CardHeader actions={<Link className="link text-sm" href="/manage/audit">Audit log</Link>}><CardTitle>Recent activity</CardTitle><CardDescription>Latest audited changes you are permitted to see.</CardDescription></CardHeader>
        <CardContent>{data.recent.length ? <TableContainer label="Recent activity" flush className="rounded-lg border"><table className="data-table"><thead><tr><th>Action</th><th>By</th><th>When</th></tr></thead><tbody>{data.recent.map(r => <tr key={r.id}><td><Link className="link" href={`/manage/audit/${r.id}`}>{r.action.replaceAll("_", " ").toLowerCase().replace(/^./, c => c.toUpperCase())}</Link></td><td className="whitespace-nowrap">{r.actorName}</td><td className="whitespace-nowrap text-muted-foreground">{displayInstant(r.eventTime, data.timezone)}</td></tr>)}</tbody></table></TableContainer> : <p className="text-sm text-muted-foreground">No activity yet.</p>}</CardContent></Card>
    </div>
  </>;
}
