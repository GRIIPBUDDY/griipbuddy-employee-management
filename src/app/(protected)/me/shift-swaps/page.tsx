import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { swapData,swapOptions } from "@/features/time/swaps";
import { Swaps } from "@/components/time/swaps";
export default async function Page(){const i=await getIdentity();return <><h1 className="text-2xl font-semibold">My shift swaps</h1><Swaps data={await pageResult(swapData(i))} options={await pageResult(swapOptions(i))}/></>;}
