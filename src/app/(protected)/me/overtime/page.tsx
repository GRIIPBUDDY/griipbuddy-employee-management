import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { securityBoundary } from "@/lib/authorization/actor";
import { organizationSummary } from "@/features/settings/service";
import { overtimeData } from "@/features/review/overtime";
import { WeeklyOvertime } from "@/components/review/overtime";
import { Field } from "@/components/ui/field";
import { localDate } from "@/features/time/dates";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const identity=await getIdentity(),actor=await pageResult(securityBoundary(identity,async a=>a)),settings=await pageResult(organizationSummary(identity)),q=await searchParams;
 const week=typeof q.week==="string"?q.week:localDate(new Date(),settings.timezone);
 const data=actor.employeeId?await pageResult(overtimeData(identity,actor.employeeId,week,true)):null;
 return <><h1 className="text-3xl font-semibold">My weekly overtime</h1><form className="flex flex-wrap items-end gap-3"><Field type="date" label="Date within week" name="week" defaultValue={week}/><button className="rounded bg-blue-600 px-4 py-2 text-white">View week</button></form>{data?<WeeklyOvertime data={data} own/>:<p>No linked employee profile.</p>}</>;
}
