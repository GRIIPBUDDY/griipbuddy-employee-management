import Link from "next/link";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { ownWorkTime } from "@/features/work-time/service";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { WorkTimeTotals, WorkTimeDays, MissingTimeTable, RespondToMissingTime } from "@/components/work-time/work-time";
import { strings, type Query } from "@/lib/utils/query";
export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const q = strings(await searchParams), data = await pageResult(ownWorkTime(await getIdentity(), q.month ? { month: q.month } : {}));
  if (!data) return <EmptyState title="No employee profile linked" description="This account is not linked to an employee profile." />;
  return <>
    <PageHeader title="Work time" description="Your scheduled payable time, verified work and any missing time for the month. Missing time is unpaid only once it is confirmed. To correct a check-in or checkout, request a correction." meta={<span>{data.timezone}</span>}
      actions={<><form className="flex items-end gap-2"><label className="grid gap-1 text-sm"><span className="font-medium">Month</span><input className="h-10 rounded-lg border border-input bg-surface px-3 text-sm" type="month" name="month" defaultValue={data.month} /></label><Button type="submit" variant="outline">Show</Button></form><Button asChild variant="outline"><Link href="/me/corrections">Corrections</Link></Button></>} />
    <WorkTimeTotals totals={data.totals} />
    <Card><CardHeader><CardTitle>Days with missing or pending time</CardTitle><CardDescription>Late arrival, early departure, absence and confirmed time away reduce payable time. Approved leave and holidays never count as missing.</CardDescription></CardHeader>
      <CardContent><WorkTimeDays days={data.days} staff={false} /></CardContent></Card>
    <Card><CardHeader><CardTitle>Recorded time away</CardTitle><CardDescription>Staff records of time you were away while checked in. Each starts as pending; you can respond once to explain or dispute it.</CardDescription></CardHeader>
      <CardContent className="space-y-3"><MissingTimeTable records={data.records} timezone={data.timezone} staff={false} />
        {data.records.filter(r => !r.employeeResponse && r.status !== "REJECTED").map(r => <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"><span>{r.workDate.toISOString().slice(0, 10)} · {r.effectiveMinutes} min · {r.status === "PENDING" ? "awaiting review" : "confirmed"}</span><RespondToMissingTime id={r.id} revision={r.revision} /></div>)}
      </CardContent></Card>
  </>;
}
