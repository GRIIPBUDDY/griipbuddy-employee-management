import { Rechecks } from "@/components/pay/rechecks";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { commissionData } from "@/features/pay/commissions";
import { Preorders } from "@/components/pay/preorders";
export default async function Page({searchParams}:{searchParams:Promise<{page?:string;id?:string}>}) {const q=await searchParams,identity=await getIdentity(),data=await pageResult(commissionData(identity,q.id?{id:q.id}:{page:q.page??1}));return <><h1 className="text-3xl font-semibold">Pre-order commission</h1><Preorders data={data}/><Rechecks identity={identity}/></>;}
