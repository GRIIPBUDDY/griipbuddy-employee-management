import Link from "next/link";
import { ownSummary } from "@/features/review/data";
import { Quantity } from "@/components/review/forms";
import { Card,CardHeader,CardTitle,CardContent } from "@/components/ui/card";
import { durationLabel } from "@/features/time/dates";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { ownAttendance } from "@/features/time/data";
import { AttendanceHistory } from "@/components/time/attendance";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const identity=await getIdentity(),data = await pageResult(ownAttendance(identity, { page: query.page ?? 1 })), summary=await pageResult(ownSummary(identity));
  return <><h1 className="text-3xl font-semibold tracking-tight">My attendance</h1>{summary && <Card><CardHeader><CardTitle>Current workweek · {summary.from}</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><Quantity label="Scheduled time" seconds={summary.scheduledSeconds}/><Quantity label="Required time" seconds={summary.requiredSeconds}/><Quantity label="Completed actual time" seconds={summary.actualSeconds}/></div>{summary.days.map(d=><p key={d.date} className="text-sm">{d.date}: actual {durationLabel(d.actualSeconds)} · scheduled {durationLabel(d.scheduledSeconds)}{d.incompleteCount?" · missing checkout":""}</p>)}<Link className="text-sm text-blue-700" href="/me/overtime">View weekly potential and approved overtime</Link></CardContent></Card>}{data ? <AttendanceHistory data={data} own path="/me/attendance" /> : <p className="text-muted-foreground">No linked employee profile is available.</p>}</>;
}
