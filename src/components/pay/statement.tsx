import Link from "next/link";
import { formatMoney } from "@/features/pay/currency";
import { summarizeBlockers } from "@/features/pay/blockers";
import type { salaryData } from "@/features/pay/periods";
import { addDays, displayInstant } from "@/features/time/dates";
import { decimal } from "@/features/pay/money";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableContainer } from "@/components/ui/table";
import { Alert } from "@/components/ui/alert";
import { rangeLabel } from "@/lib/utils/date-range";
import { hm } from "@/components/time/attendance";
import { label } from "./common";
type Statement = Awaited<ReturnType<typeof salaryData>>["records"][number];
export function monthName(from: string) { return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${from.slice(0, 7)}-01T00:00:00Z`)); }
export function SalaryStatement({ row, own = false }: { row: Statement; own?: boolean }) {
  const snapshot = "snapshot" in row ? row.snapshot : undefined, final = row.period.status === "FINALIZED", currency = row.period.currency;
  const lines: [string, string | undefined, boolean?][] = "baseAmount" in row ? [["Basic / regular earnings", row.baseAmount], ["Approved overtime", row.overtimeAmount], ...("commissionAmount" in row ? [["Approved pre-order commission", row.commissionAmount] as [string, string]] : []), ["Bonuses & allowances", row.bonusAmount], ["Other adjustments & corrections", row.otherAmount], ["Deductions", row.deductionAmount, true]] : [];
  return <div className="space-y-5">
    <Card><CardHeader actions={<div className="flex flex-wrap gap-1.5"><StatusBadge status={row.period.status} label={label(row.period.status)} /><StatusBadge status={row.period.paymentStatus} label={row.period.paymentStatus === "PAID" ? "Paid" : "Payment not recorded"} /></div>}>
      <CardTitle>{monthName(row.period.from)}</CardTitle><CardDescription>{rangeLabel(row.period.from, addDays(row.period.until, -1))}{row.period.paidAt ? ` · paid ${displayInstant(row.period.paidAt, snapshot?.period.timezone ?? "UTC")}` : ""}</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className={final ? "rounded-lg border border-[#abefc6] bg-success-soft px-4 py-3" : "rounded-lg border border-[#fedf89] bg-warning-soft px-4 py-3"}><p className="text-xs font-medium text-muted-foreground">{final ? "Finalized salary" : "Estimate — sources may still change"}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(row.finalAmount, currency)}</p></div>
        {lines.length > 0 && <dl className="divide-y rounded-lg border text-sm">{lines.map(([name, amount, minus]) => <div key={name} className="flex justify-between gap-4 px-4 py-2.5"><dt className="text-[#344054]">{name}</dt><dd className="tabular-nums">{amount ? `${minus && amount !== "0.00" ? "−" : ""}${formatMoney(amount, currency)}` : "—"}</dd></div>)}<div className="flex justify-between gap-4 bg-subtle px-4 py-2.5 font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatMoney(row.finalAmount, currency)}</dd></div></dl>}
        {snapshot && snapshot.blockers.length > 0 && <Alert tone="warning" title="Resolve before closeout">{summarizeBlockers(snapshot.blockers).join(" · ")}</Alert>}
        {snapshot && <p className="text-xs leading-5 text-muted-foreground">{snapshot.rounding}. Method: {snapshot.formulaVersion}. Amounts use the organization currency ({currency}) and precise decimal arithmetic.</p>}
      </CardContent></Card>
    {snapshot && snapshot.segments.length > 0 && <Card><CardHeader><CardTitle>Daily calculation inputs</CardTitle><CardDescription>Monthly terms prorate by calendar day and scheduled coverage.</CardDescription></CardHeader><CardContent><TableContainer label="Daily calculation inputs" flush className="rounded-lg border"><table className="data-table min-w-[720px]"><thead><tr><th>Date</th><th>Pay type</th><th className="num">Regular</th><th className="num">Paid absence</th><th className="num">Approved overtime</th><th className="num">Units</th><th className="num">Base (4 dp)</th></tr></thead><tbody>{snapshot.segments.map(d => <tr key={d.date}><td><Link className="link tabular-nums" href={own ? `/me/attendance?range=date&date=${d.date}` : `/manage/employees/${snapshot.employeeId}/attendance/day?date=${d.date}`}>{d.date}</Link></td><td>{d.payType ? label(d.payType) : <span className="text-danger">Missing rate</span>}</td><td className="num">{hm(d.regularSeconds)}</td><td className="num">{hm(d.paidAbsenceSeconds)}</td><td className="num">{hm(d.approvedOvertimeSeconds)}</td><td className="num">{decimal(d.dailyUnits).toFixed(4)}</td><td className="num">{formatMoney(d.baseUnrounded, currency, 4)}</td></tr>)}</tbody></table></TableContainer></CardContent></Card>}
    {snapshot && <Card><CardHeader><CardTitle>Sources</CardTitle><CardDescription>Records included in this statement.</CardDescription></CardHeader><CardContent className="space-y-2 text-sm">
      <Link className="link block" href={own ? "/me/compensation" : `/manage/employees/${snapshot.employeeId}/compensation`}>Effective compensation history</Link>
      {((snapshot.sources.overtime ?? []) as { week: string; reviewId: string | null; approvedSeconds: number }[]).map(w => <p key={w.week}><Link className="link" href={`${own ? "/me" : "/manage"}/overtime?${own ? "" : `employeeId=${snapshot.employeeId}&`}week=${w.week}`}>Overtime · week of {w.week}</Link> <span className="text-muted-foreground">· approved {hm(w.approvedSeconds)}</span></p>)}
      {(snapshot.commissions ?? []).map(c => <p key={c.id}><Link className="link" href={`${own ? "/me" : "/manage"}/commissions?id=${c.id}`}>{c.reference}</Link> <span className="text-muted-foreground">· {formatMoney(c.amount, currency)} · revision {c.revision}</span></p>)}
      {snapshot.adjustments.map(a => <p key={a.id}>{own ? label(a.type) : <Link className="link" href={`/manage/adjustments?id=${a.id}`}>{label(a.type)}</Link>} <span className="text-muted-foreground">· {formatMoney(a.amount, currency)} · {a.reason}</span></p>)}
    </CardContent></Card>}
  </div>;
}
