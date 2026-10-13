import Link from "next/link";
import { Wallet } from "lucide-react";
import { formatMoney } from "@/features/pay/currency";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { salaryData } from "@/features/pay/periods";
import { monthToDate } from "@/features/pay/weekly";
import { Earnings } from "@/components/pay/earnings";
import { monthName } from "@/components/pay/statement";
import { PageHeader } from "@/components/ui/page-header";
import { TableContainer } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const q = await searchParams, identity = await getIdentity(), [data, month] = await Promise.all([pageResult(salaryData(identity, { page: q.page ?? 1 }, true)), pageResult(monthToDate(identity))]);
  return <><PageHeader title="Salary & payslips" description="This month’s running estimate, your finalized monthly statements, payslips and payment status." actions={<Link className="link text-sm" href="/me/compensation">Compensation history</Link>} />
    {month && !month.legacy && month.monthly && !month.finalStatement && <Earnings data={month} />}
    {!data.records.length ? <EmptyState icon={Wallet} title="No finalized statements yet" description="Statements appear here after HR finalizes a salary month." /> :
    <TableContainer label="Salary statements"><table className="data-table"><thead><tr><th>Month</th><th>Payment</th><th className="num">Amount</th><th className="text-right">Documents</th></tr></thead><tbody>{data.records.map(r => <tr key={r.id}><td className="font-medium">{monthName(r.period.from)}</td><td><StatusBadge status={r.period.paymentStatus} label={r.period.paymentStatus === "PAID" ? "Paid" : "Payment pending"} /></td><td className="num font-semibold">{formatMoney(r.finalAmount, r.period.currency)}</td><td className="text-right"><span className="inline-flex flex-col items-end gap-1 sm:flex-row sm:gap-3"><Link className="link text-sm" href={`/me/salary/${r.id}`}>View</Link><a className="link text-sm" href={`/api/me/salary/${r.id}/payslip`}>Payslip PDF</a></span></td></tr>)}</tbody></table></TableContainer>}
    <Pagination page={data.page} hasNext={data.hasNext} query={{}} /></>;
}
