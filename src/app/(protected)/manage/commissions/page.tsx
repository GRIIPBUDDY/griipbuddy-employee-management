import { Rechecks } from "@/components/pay/rechecks";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { commissionData,commissionOptions } from "@/features/pay/commissions";
import { Preorders } from "@/components/pay/preorders";
import { PayNav } from "@/components/pay/common";
export default async function Page({searchParams}:{searchParams:Promise<{page?:string;id?:string}>}) {const q=await searchParams,identity=await getIdentity(),data=await pageResult(commissionData(identity,q.id?{id:q.id}:{page:q.page??1},true)),options=await pageResult(commissionOptions(identity));return <><h1 className="text-3xl font-semibold">Commission management</h1><PayNav/><Preorders data={data} options={options} selectedId={q.id}/><Rechecks identity={identity} staff/></>;}
