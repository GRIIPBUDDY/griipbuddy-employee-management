import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { swapData } from "@/features/time/swaps";
import { Swaps } from "@/components/time/swaps";
export default async function Page(){return <><h1 className="text-2xl font-semibold">Shift swap approvals</h1><Swaps staff data={await pageResult(swapData(await getIdentity(),true))}/></>;}
