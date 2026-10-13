import { getIdentity, pageActor } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { rateHistory } from "@/features/pay/rates";
import { RateHistory } from "@/components/pay/compensation";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
export default async function Page() {
  const actor = await pageActor(), data = actor.employeeId ? await pageResult(rateHistory(await getIdentity(), actor.employeeId, true)) : null;
  return <><PageHeader title="My compensation" description="Your recorded basic pay and overtime hourly rate by effective date. Contact HR if anything looks incorrect." />{data ? <RateHistory data={data} staff={false} /> : <EmptyState title="No employee profile" />}</>;
}
