import Link from "next/link";
import { Wallet } from "lucide-react";
import { formatMoney } from "@/features/pay/currency";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { salaryData } from "@/features/pay/periods";
import { monthName } from "@/components/pay/statement";
import { PageHeader } from "@/components/ui/page-header";
import { TableContainer } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const q = await searchParams, data = await pageResult(salaryData(await getIdentity(), { page: q.page ?? 1 }, true));
  return <><PageHeader title="Salary statements" description="Your finalized monthly salary statements and payment status." actions={<Link className="link text-sm" href="/me/compensation">Compensation history</Link>} />
    {!data.records.length ? <EmptyState icon={Wallet} title="No finalized statements yet" description="Statements appear here after HR finalizes a salary month." /> :
    <TableContainer label="Salary statements"><table className="data-table"><thead><tr><th>Month</th><th>Payment</th><th className="num">Amount</th><th className="text-right">Statement</th></tr></thead><tbody>{data.records.map(r => <tr key={r.id}><td className="font-medium">{monthName(r.period.from)}</td><td><StatusBadge status={r.period.paymentStatus} label={r.period.paymentStatus === "PAID" ? "Paid" : "Payment pending"} /></td><td className="num font-semibold">{formatMoney(r.finalAmount, r.period.currency)}</td><td className="text-right"><Link className="link text-sm" href={`/me/salary/${r.id}`}>View</Link></td></tr>)}</tbody></table></TableContainer>}
    <Pagination page={data.page} hasNext={data.hasNext} query={{}} /></>;
}
