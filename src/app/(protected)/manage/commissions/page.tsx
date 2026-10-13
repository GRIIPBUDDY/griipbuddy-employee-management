import { Rechecks } from "@/components/pay/rechecks";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { commissionData, commissionOptions } from "@/features/pay/commissions";
import { Preorders, RecordPreorderButton, CommissionRuleButton } from "@/components/pay/preorders";
import { PayNav } from "@/components/pay/common";
import { PageHeader } from "@/components/ui/page-header";
import { formatMoney } from "@/features/pay/currency";
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string; id?: string }> }) {
  const q = await searchParams, identity = await getIdentity(), data = await pageResult(commissionData(identity, q.id ? { id: q.id } : { page: q.page ?? 1 }, true)), options = await pageResult(commissionOptions(identity));
  const references = Object.fromEntries(data.records.map(r => [r.id, r.reference])), names = Object.fromEntries(data.records.map(r => [r.employeeId, r.employee?.legalName ?? ""]));
  return <>
    <PageHeader title="Pre-order commissions" description={`Confidential. Only eligible employees see their own records. Current rule: ${data.rule.type === "FIXED" ? `${formatMoney(data.rule.value, data.rule.currency)} per verified pre-order` : `${data.rule.value}% of order value`}.`} actions={<>{options.isAdmin && <CommissionRuleButton data={data} />}<RecordPreorderButton data={data} options={options} /></>} />
    <PayNav />
    <Preorders data={data} options={options} />
    <Rechecks identity={identity} staff timezone={data.timezone} references={references} names={names} />
  </>;
}
