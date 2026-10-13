import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { swapData, swapOptions } from "@/features/time/swaps";
import { organizationSummary } from "@/features/settings/service";
import { Swaps, RequestSwapButton } from "@/components/time/swaps";
import { PageHeader } from "@/components/ui/page-header";
export default async function Page() {
  const i = await getIdentity(), [data, options, settings] = await Promise.all([pageResult(swapData(i)), pageResult(swapOptions(i)), pageResult(organizationSummary(i))]);
  return <><PageHeader title="Shift swaps" description="Swap a future period with a colleague. They accept first, then HR approves." actions={data.operational && <RequestSwapButton options={options} timezone={settings.timezone} />} /><Swaps data={data} /></>;
}
