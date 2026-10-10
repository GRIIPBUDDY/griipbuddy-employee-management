import Link from "next/link";
import { assertRole } from "@/lib/authorization/policy";
import { pageResult } from "@/lib/auth/page-result";
import { pageActor } from "@/lib/auth/request";
import { reportKinds } from "@/features/insights/validation";
import { reportNames } from "@/components/insights/common";
export default async function Page(){const actor=await pageActor();await pageResult(Promise.resolve().then(()=>assertRole(actor,["ADMIN","HR_MANAGER"])));return <><h1 className="text-3xl font-semibold">Reports</h1><p className="text-muted-foreground">Filtered operational reports and CSV exports from official records.</p><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{reportKinds.filter(k=>k!=="commissions"||actor.role==="ADMIN"||actor.canManageCommissions).map(k=><Link key={k} href={`/manage/reports/${k}`} className="rounded-xl border bg-white p-6 font-semibold text-blue-700">{reportNames[k]}</Link>)}</div></>;}
