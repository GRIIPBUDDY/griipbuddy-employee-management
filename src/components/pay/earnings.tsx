import { formatMoney } from "@/features/pay/currency";
import type { monthToDate } from "@/features/pay/weekly";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Alert } from "@/components/ui/alert";
// Keys come from the server projection; commission keys are only present for permitted employees.
const names: Record<string, string> = { base: "Basic / regular", approvedOvertime: "Approved overtime", commissions: "Approved pre-order commission", bonuses: "Bonuses & allowances", other: "Other adjustments", deductions: "Deductions", total: "Total" };
const monthName = (month: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
function Breakdown({ title, part, currency, tone }: { title: string; part: Record<string, string>; currency: string; tone: "final" | "pending" }) {
  return <div className="rounded-lg border p-4"><div className="mb-3 flex items-center justify-between gap-2"><p className="text-sm font-semibold">{title}</p><StatusBadge status={tone === "final" ? "FINALIZED" : "PENDING"} label={tone === "final" ? "Finalized weeks" : "Pending review"} /></div>
    <dl className="space-y-1.5 text-sm">{Object.entries(part).map(([key, value]) => <div key={key} className={key === "total" ? "flex justify-between border-t pt-2 font-semibold" : "flex justify-between text-[#344054]"}><dt>{names[key] ?? key}</dt><dd className="tabular-nums">{key === "deductions" && value !== "0.00" ? "−" : ""}{formatMoney(value, currency)}</dd></div>)}</dl></div>;
}
export function Earnings({ data }: { data: Awaited<ReturnType<typeof monthToDate>> }) {
  if (!data) return null;
  return <Card><CardHeader actions={<StatusBadge status={data.paymentStatus} label={data.paymentStatus === "PAID" ? "Month paid" : "Month-end payment not yet recorded"} />}><CardTitle>{monthName(data.month)} earnings to date</CardTitle><CardDescription>Weekly statements are finalized after review. Payment is recorded separately at month end.</CardDescription></CardHeader>
    <CardContent className="space-y-4">{data.legacy ? <Alert tone="neutral">This month uses the earlier monthly calculation method. See your salary statements for details.</Alert> : <>
      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg border bg-primary-soft/60 px-4 py-3"><p className="text-xs font-medium text-muted-foreground">Accumulated this month</p><p className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(data.total!, data.currency)}</p></div><div className="rounded-lg border px-4 py-3"><p className="text-xs font-medium text-muted-foreground">Finalized</p><p className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(data.finalized, data.currency)}</p></div><div className="rounded-lg border px-4 py-3"><p className="text-xs font-medium text-muted-foreground">Estimate pending review</p><p className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(data.awaitingReview, data.currency)}</p></div></div>
      <div className="grid gap-3 lg:grid-cols-2">{data.finalizedBreakdown && <Breakdown title="Finalized" part={data.finalizedBreakdown as Record<string, string>} currency={data.currency} tone="final" />}{data.awaitingReviewBreakdown && <Breakdown title="Awaiting weekly review" part={data.awaitingReviewBreakdown as Record<string, string>} currency={data.currency} tone="pending" />}</div>
      <p className="text-xs text-muted-foreground">Only approved overtime is included. Pending overtime and estimates may change after attendance and earnings review.</p></>}
    </CardContent></Card>;
}
