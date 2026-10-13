import { Rechecks } from "@/components/pay/rechecks";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { commissionData } from "@/features/pay/commissions";
import { OwnPreorders } from "@/components/pay/preorders";
import { PageHeader } from "@/components/ui/page-header";
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string; id?: string }> }) {
  // Ineligible employees receive a generic not-found from the service before anything renders.
  const q = await searchParams, identity = await getIdentity(), data = await pageResult(commissionData(identity, q.id ? { id: q.id } : { page: q.page ?? 1 }));
  return <><PageHeader title="Pre-order commission" description="Your verified pre-orders and their commission. Approved amounts are included in your weekly earnings." /><OwnPreorders data={data} /><Rechecks identity={identity} timezone={data.timezone} references={Object.fromEntries(data.records.map(r => [r.id, r.reference]))} /></>;
}
