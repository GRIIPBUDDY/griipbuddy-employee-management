import Link from "next/link";
import { DashboardOverview } from "@/components/insights/dashboard-overview";
import { pageActor,getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { managementDashboard,personalDashboard } from "@/features/insights/dashboard";
import { PersonalDashboard } from "@/components/insights/personal-dashboard";
import { Card,CardHeader,CardTitle,CardContent } from "@/components/ui/card";
import { displayInstant } from "@/features/time/dates";
export default async function Dashboard() {
 const actor=await pageActor(),identity=await getIdentity();
 const management=actor.role!=="EMPLOYEE"?await pageResult(managementDashboard(identity)):null;
 const personal=actor.employeeId?await pageResult(personalDashboard(identity)):null;
 return <><div><p className="text-sm text-muted-foreground">{management?"Company operations":"My workspace"}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Hello, {actor.name}</h1><p className="mt-2 text-muted-foreground">{management?"Pending actions and activity from official company records.":"Your schedule, attendance and recent updates."}</p></div>{management&&<><p className="text-sm text-muted-foreground">{management.today} · {management.timezone}. Today includes sessions intersecting the local day; open sessions carry forward until checkout. {management.attendance.completed} completed sessions · {management.attendance.open} open sessions. Other pending counts cover all dates.</p><DashboardOverview cards={management.cards} completed={management.attendance.completed} open={management.attendance.open}/><Card><CardHeader><CardTitle>Recent permitted activity</CardTitle></CardHeader><CardContent className="space-y-4 text-sm">{management.recent.map(r=><p key={r.id}><Link href={`/manage/audit/${r.id}`} className="font-medium text-blue-700">{r.action.replaceAll("_"," ")}</Link><span className="block text-muted-foreground">{r.actorName} · {displayInstant(r.eventTime,management.timezone)}</span></p>)}{!management.recent.length&&<p>No permitted activities yet.</p>}<Link className="inline-block text-blue-700" href="/manage/audit">Audit review</Link></CardContent></Card></>}{personal&&<>{management&&<h2 className="text-2xl font-semibold">My employee workspace</h2>}<PersonalDashboard data={personal}/></>}{!management&&!personal&&<p>No employee profile is linked to this account.</p>}</>;
}
