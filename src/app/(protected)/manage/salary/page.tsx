import Link from "next/link";
import { CalendarPlus, Wallet, Check, FileDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/features/pay/currency";
import { summarizeBlockers } from "@/features/pay/blockers";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { periodData } from "@/features/pay/periods";
import { organizationSummary } from "@/features/settings/service";
import { addDays, dateKey, displayInstant } from "@/features/time/dates";
import { ActionForm, Field, Hidden, payAction, PayNav, label } from "@/components/pay/common";
import { monthName } from "@/components/pay/statement";
import { PageHeader } from "@/components/ui/page-header";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { TableContainer, Cell2 } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { Alert } from "@/components/ui/alert";
import { rangeLabel } from "@/lib/utils/date-range";
import { cn } from "@/lib/utils/cn";
const steps = ["DRAFT", "CALCULATED", "REVIEWED", "APPROVED", "FINALIZED", "PAID"];
function Stepper({ status, paid }: { status: string; paid: boolean }) {
  const index = paid ? 5 : steps.indexOf(status);
  return <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs font-medium">{steps.map((step, i) => <li key={step} className="flex items-center gap-2"><span className={cn("flex h-6 items-center gap-1.5 rounded-full px-2.5 ring-1 ring-inset", i < index ? "bg-success-soft text-success ring-[#abefc6]" : i === index ? "bg-primary text-white ring-primary" : "bg-subtle text-muted-foreground ring-border")}>{i < index && <Check size={12} aria-hidden="true" />}{step === "PAID" ? "Paid" : label(step)}</span>{i < steps.length - 1 && <span aria-hidden="true" className="h-px w-4 bg-border" />}</li>)}</ol>;
}
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams, identity = await getIdentity(), data = await pageResult(periodData(identity, q.id ? { id: q.id } : { page: q.page ?? 1 })), selected = q.id ? data.records[0] : undefined, settings = await pageResult(organizationSummary(identity));
  if (!selected) return <>
    <PageHeader title="Salary & payments" description="Monthly salary is calculated from reviewed attendance, approved overtime, leave, adjustments and commissions. Finalizing does not transfer money — payment is recorded separately." actions={<Dialog variant="default" trigger={<><CalendarPlus size={16} aria-hidden="true" />New salary month</>} title="Create salary month" description={`Calendar month in ${settings.timezone}, currency ${settings.currency}.`} size="sm"><ActionForm action={payAction} submitLabel="Create month"><Hidden values={{ kind: "period" }} /><Field type="month" name="month" label="Salary month" required /></ActionForm></Dialog>} />
    <PayNav />
    {!data.records.length ? <EmptyState icon={Wallet} title="No salary months yet" description="Create a month to calculate, review and finalize employee salaries." /> :
    <TableContainer label="Salary months"><table className="data-table min-w-[720px]"><thead><tr><th>Month</th><th>Status</th><th>Payment</th><th>Currency</th><th>Created</th><th className="text-right">Action</th></tr></thead><tbody>{data.records.map(p => <tr key={p.id}>
      <td><Cell2 primary={<Link className="hover:text-primary hover:underline" href={`?id=${p.id}`}>{monthName(dateKey(p.startDate))}</Link>} secondary={rangeLabel(dateKey(p.startDate), addDays(dateKey(p.endDate), -1))} /></td>
      <td><StatusBadge status={p.status} label={label(p.status)} /></td><td><StatusBadge status={p.paymentStatus} label={p.paymentStatus === "PAID" ? "Paid" : "Unpaid"} /></td><td>{p.currency}</td><td className="text-muted-foreground">{p.createdAt.toISOString().slice(0, 10)}</td>
      <td className="text-right"><Link className="link text-sm" href={`?id=${p.id}`}>Open</Link></td></tr>)}</tbody></table></TableContainer>}
    <Pagination page={data.page} hasNext={data.hasNext} query={{}} />
  </>;
  const p = selected, month = monthName(dateKey(p.startDate)), canTransition = p.status !== "FINALIZED";
  const total = data.calculations.reduce((sum, r) => sum + Number(r.finalAmount), 0);
  return <>
    <PageHeader breadcrumbs={[{ label: "Salary & payments", href: "/manage/salary" }, { label: month }]} title={month} description={`${rangeLabel(dateKey(p.startDate), addDays(dateKey(p.endDate), -1))} · ${p.currency} · input revision ${p.inputRevision}`}
      actions={<div className="flex flex-wrap items-center gap-2"><Link className="link mr-2 text-sm" href={`/manage/adjustments?periodId=${p.id}`}>Monthly adjustments</Link>{data.calculations.length > 0 && <Button asChild variant="outline" size="sm"><a href={`/api/manage/salary/${p.id}/register`}><FileDown size={15} aria-hidden="true" />Payment register PDF</a></Button>}{p.status === "FINALIZED" && <Button asChild variant="outline" size="sm"><a href={`/api/manage/salary/${p.id}/payments`}><Download size={15} aria-hidden="true" />Bank / mobile payment CSV</a></Button>}</div>} />
    <Card><CardHeader><CardTitle>Progress</CardTitle><CardDescription>Calculate the whole roster, review, approve and finalize. Review opens once the month and its last overtime week have ended. Each step is audited.</CardDescription></CardHeader><CardContent className="space-y-4"><Stepper status={p.status} paid={p.paymentStatus === "PAID"} />
      {canTransition && <div className="flex flex-wrap items-center gap-2">
        <ActionForm compact action={payAction} submitVariant="outline" submitLabel={p.status === "DRAFT" ? "Calculate all employees" : "Recalculate all employees"}><Hidden values={{ kind: "calculate", periodId: p.id, revision: p.inputRevision }} /></ActionForm>
        {p.status === "CALCULATED" && <ActionForm compact action={payAction} submitLabel="Complete review" confirmation={{ title: "Complete the salary review?", description: "Confirms that the employee calculations and their sources have been checked.", label: "Complete review" }}><Hidden values={{ kind: "transition", periodId: p.id, revision: p.inputRevision, status: "REVIEWED" }} /></ActionForm>}
        {p.status === "REVIEWED" && <ActionForm compact action={payAction} submitLabel="Approve salary month" confirmation={{ title: `Approve ${month}?`, description: "Confirm that employee calculations and review evidence are complete.", label: "Approve" }}><Hidden values={{ kind: "transition", periodId: p.id, revision: p.inputRevision, status: "APPROVED" }} /></ActionForm>}
        {p.status === "APPROVED" && <ActionForm compact action={payAction} submitLabel="Finalize salary month" confirmation={{ title: `Finalize ${month}?`, description: `Finalized statements cannot be edited; later changes need a reviewed correction in a later month. Total for ${data.calculations.length} employees: ${formatMoney(total.toFixed(2), p.currency)}. This does not transfer money.`, label: "Finalize salary", destructive: true }}><Hidden values={{ kind: "transition", periodId: p.id, revision: p.inputRevision, status: "FINALIZED" }} /></ActionForm>}
      </div>}
      {p.status === "FINALIZED" && (p.paymentStatus === "PAID" ? <Alert tone="success" title="Payment recorded">Paid {p.paidAt ? displayInstant(p.paidAt, settings.timezone) : ""}. Payment evidence cannot be rewritten.</Alert>
        : <div className="flex flex-wrap items-center gap-3"><Alert tone="info" className="flex-1">Salary is finalized but not marked paid. Record the payment after the transfer has actually been made.</Alert><Dialog variant="default" trigger="Record payment" title={`Record payment for ${month}`} description={`Enter when payment was actually made (${settings.timezone}). Employees are notified. This does not move money.`} size="sm"><ActionForm action={payAction} submitLabel="Record payment" confirmation={{ title: "Mark this month as paid?", description: "Payment evidence is permanent. Make sure the transfer has been completed.", label: "Mark paid", destructive: true }}><Hidden values={{ kind: "payment", periodId: p.id }} /><Field name="paidAt" label="Payment date and time" type="datetime-local" required hint={`After the month ends and not in the future · ${settings.timezone}`} /><Field name="reference" label="Payment reference" maxLength={150} hint="Optional, e.g. bank batch ID." /><Field name="note" label="Note" maxLength={500} /></ActionForm></Dialog></div>)}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Employee calculations</CardTitle><CardDescription>{data.calculations.length} employees · total {formatMoney(total.toFixed(2), p.currency)}{p.status === "FINALIZED" ? "" : " (estimate)"}</CardDescription></CardHeader><CardContent>{!data.calculations.length ? <EmptyState icon={Wallet} title="Not calculated yet" description="Calculate the complete monthly roster to review employee totals." /> :
      <TableContainer label="Employee calculations" flush className="rounded-lg border"><table className="data-table"><thead><tr><th>Employee</th><th>Status</th><th>To resolve</th><th className="num">Amount</th><th className="text-right">Action</th></tr></thead><tbody>{data.calculations.map(r => { const blockers = "snapshot" in r && r.snapshot ? r.snapshot.blockers : []; return <tr key={r.id}><td className="font-medium">{r.employee.legalName}</td><td><StatusBadge status={r.period.status === "FINALIZED" ? "FINAL" : "ESTIMATE"} label={r.period.status === "FINALIZED" ? "Final" : "Estimate"} /></td><td className="max-w-80 text-[13px] text-warning">{blockers.length ? summarizeBlockers(blockers).join(" · ") : <span className="text-muted-foreground">—</span>}</td><td className="num font-semibold">{formatMoney(r.finalAmount, r.period.currency)}</td><td className="text-right"><Link className="link text-sm" href={`/manage/salary/${r.id}`}>Statement</Link></td></tr>; })}</tbody></table></TableContainer>}</CardContent></Card>
  </>;
}
