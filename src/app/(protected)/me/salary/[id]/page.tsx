import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { salaryData } from "@/features/pay/periods";
import { SalaryStatement, monthName } from "@/components/pay/statement";
import { PageHeader } from "@/components/ui/page-header";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const data = await pageResult(salaryData(await getIdentity(), { id: (await params).id }, true)), row = data.records[0];
  return <><PageHeader breadcrumbs={[{ label: "Salary statements", href: "/me/salary" }, { label: monthName(row.period.from) }]} title={`Salary · ${monthName(row.period.from)}`} /><SalaryStatement row={row} own /></>;
}
