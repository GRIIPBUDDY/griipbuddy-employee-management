import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { salaryData } from "@/features/pay/periods";
import { SalaryStatement, monthName } from "@/components/pay/statement";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const data = await pageResult(salaryData(await getIdentity(), { id: (await params).id }, true)), row = data.records[0];
  return <><PageHeader breadcrumbs={[{ label: "Salary & payslips", href: "/me/salary" }, { label: monthName(row.period.from) }]} title={`Salary · ${monthName(row.period.from)}`} actions={<Button asChild variant="outline"><a href={`/api/me/salary/${row.id}/payslip`}><FileDown size={16} aria-hidden="true" />Download payslip</a></Button>} /><SalaryStatement row={row} own /></>;
}
