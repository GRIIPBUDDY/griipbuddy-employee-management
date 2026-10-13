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
  if (!data.legacy && data.monthly) return <MonthlyEarnings data={data} />;
  return <Card><CardHeader actions={<StatusBadge status={data.paymentStatus} label={data.paymentStatus === "PAID" ? "Month paid" : "Month-end payment not yet recorded"} />}><CardTitle>{monthName(data.month)} earnings to date</CardTitle><CardDescription>Weekly statements are finalized after review. Payment is recorded separately at month end.</CardDescription></CardHeader>
    <CardContent className="space-y-4">{data.legacy ? <Alert tone="neutral">This month uses the earlier monthly calculation method. See your salary statements for details.</Alert> : <>
      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg border bg-primary-soft/60 px-4 py-3"><p className="text-xs font-medium text-muted-foreground">Accumulated this month</p><p className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(data.total!, data.currency)}</p></div><div className="rounded-lg border px-4 py-3"><p className="text-xs font-medium text-muted-foreground">Finalized</p><p className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(data.finalized, data.currency)}</p></div><div className="rounded-lg border px-4 py-3"><p className="text-xs font-medium text-muted-foreground">Estimate pending review</p><p className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(data.awaitingReview, data.currency)}</p></div></div>
      <div className="grid gap-3 lg:grid-cols-2">{data.finalizedBreakdown && <Breakdown title="Finalized" part={data.finalizedBreakdown as Record<string, string>} currency={data.currency} tone="final" />}{data.awaitingReviewBreakdown && <Breakdown title="Awaiting weekly review" part={data.awaitingReviewBreakdown as Record<string, string>} currency={data.currency} tone="pending" />}</div>
      <p className="text-xs text-muted-foreground">Only approved overtime is included. Pending overtime and estimates may change after attendance and earnings review.</p></>}
    </CardContent></Card>;
}
type Monthly = Extract<NonNullable<Awaited<ReturnType<typeof monthToDate>>>, { monthly: boolean }>;
/** Monthly pay: one running estimate from attendance, approved overtime and approved adjustments, until HR finalizes the month. */
export function MonthlyEarnings({ data }: { data: Monthly }) {
  const final = data.finalStatement;
  return <Card><CardHeader actions={<StatusBadge status={final ? (data.paymentStatus === "PAID" ? "PAID" : "FINALIZED") : "ESTIMATE"} label={final ? (data.paymentStatus === "PAID" ? "Paid" : "Finalized · payment pending") : "Estimate"} />}><CardTitle>{monthName(data.month)} salary</CardTitle><CardDescription>{final ? "This month’s salary is finalized." : "A running estimate. HR reviews attendance and overtime, then finalizes the month."}</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      <div className="rounded-lg border bg-primary-soft/60 px-4 py-3"><p className="text-xs font-medium text-muted-foreground">{final ? "Finalized salary" : "Estimated so far this month"}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(final ? final.finalAmount : data.total!, data.currency)}</p></div>
      {!final && data.awaitingReviewBreakdown && <dl className="space-y-1.5 rounded-lg border p-4 text-sm">{Object.entries(data.awaitingReviewBreakdown as Record<string, string>).map(([key, value]) => <div key={key} className={key === "total" ? "flex justify-between border-t pt-2 font-semibold" : "flex justify-between text-[#344054]"}><dt>{names[key] ?? key}</dt><dd className="tabular-nums">{key === "deductions" && value !== "0.00" ? "−" : ""}{formatMoney(value, data.currency)}</dd></div>)}</dl>}
      {data.expectedPayment && data.paymentStatus !== "PAID" && <p className="text-sm">Expected payment: <span className="font-medium">{new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${data.expectedPayment}T00:00:00Z`))}</span></p>}
      <p className="text-xs text-muted-foreground">Only approved overtime and approved adjustments are included. The estimate can change until the month is finalized.</p>
    </CardContent></Card>;
}
