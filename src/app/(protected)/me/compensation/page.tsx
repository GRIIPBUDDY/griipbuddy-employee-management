import { getIdentity,pageActor } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { rateHistory } from "@/features/pay/rates";
import { dateKey } from "@/features/time/dates";
import { label } from "@/components/pay/common";
export default async function Page(){const actor=await pageActor(),data=actor.employeeId?await pageResult(rateHistory(await getIdentity(),actor.employeeId,true)):null;return <><h1 className="text-3xl font-semibold">My compensation history</h1>{data?.rates.map(r=><article key={r.id} className="rounded border bg-white p-5"><h2 className="font-semibold">{label(r.payType)} · {r.currency} {r.baseAmount}</h2><p>{dateKey(r.effectiveFrom)} → {r.effectiveUntil?dateKey(r.effectiveUntil):"Ongoing"} · {r.supersededAt?"Previous version":"Current effective version"}</p><p className="text-sm">Overtime hourly equivalent: {r.payType==="HOURLY"?r.baseAmount:r.overtimeHourlyEquivalent??"Not agreed"} · multiplier {r.overtimeMultiplier}</p></article>)}{!data?.rates.length && <p>No compensation records yet.</p>}</>;}
