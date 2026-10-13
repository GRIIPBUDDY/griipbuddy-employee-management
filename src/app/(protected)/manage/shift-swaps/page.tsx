import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { swapData } from "@/features/time/swaps";
import { Swaps } from "@/components/time/swaps";
import { PageHeader } from "@/components/ui/page-header";
export default async function Page() { return <><PageHeader title="Shift swaps" description="Employee-to-employee swaps of future periods. Both employees must agree before HR approves." /><Swaps staff data={await pageResult(swapData(await getIdentity(), true))} /></>; }
