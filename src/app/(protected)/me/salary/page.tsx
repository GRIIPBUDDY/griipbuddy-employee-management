import Link from "next/link";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { salaryData } from "@/features/pay/periods";
import { Pager } from "@/components/pay/common";
export default async function Page({searchParams}:{searchParams:Promise<{page?:string}>}) {const q=await searchParams,data=await pageResult(salaryData(await getIdentity(),{page:q.page??1},true));return <><h1 className="text-3xl font-semibold">My Salary</h1><Link className="text-sm text-blue-700" href="/me/compensation">My compensation history</Link><p className="text-sm">These are your finalized salary statements.</p>{data.records.map(r=><article key={r.id} className="rounded-lg border bg-white p-5"><Link className="font-semibold text-blue-700" href={`/me/salary/${r.id}`}>{r.period.from.slice(0,7)} · Finalized</Link><p>{r.period.currency} {r.finalAmount}</p></article>)}{!data.records.length && <p>No finalized salary statements yet.</p>}<Pager {...data}/></>;}
