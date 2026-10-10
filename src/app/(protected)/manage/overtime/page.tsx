import Link from "next/link";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { organizationSummary } from "@/features/settings/service";
import { overtimeData,overtimeQueue } from "@/features/review/overtime";
import { employeeOptions } from "@/features/people/data";
import { WeeklyOvertime } from "@/components/review/overtime";
import { Field,SelectField } from "@/components/ui/field";
import { localDate,dateKey,durationLabel } from "@/features/time/dates";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const identity=await getIdentity(),q=await searchParams,queue=await pageResult(overtimeQueue(identity,{page:q.page??1,status:q.status??""})),settings=await pageResult(organizationSummary(identity)),employees=await pageResult(employeeOptions(identity));
 const week=typeof q.week==="string"?q.week:localDate(new Date(),settings.timezone),data=q.employeeId?await pageResult(overtimeData(identity,q.employeeId,week)):null;
 return <><h1 className="text-3xl font-semibold">Weekly overtime review</h1><nav className="flex flex-wrap gap-5 text-sm text-blue-700"><Link href="/manage/attendance">Attendance</Link><Link href="?status=PENDING">Pending reviews</Link><Link href="?status=STALE">Needs review again</Link></nav><form className="grid gap-3 sm:grid-cols-3"><SelectField label="Employee" name="employeeId" required defaultValue={typeof q.employeeId==="string"?q.employeeId:""}><option value="">Select employee</option>{employees.map(e=><option key={e.id} value={e.id}>{e.legalName}</option>)}</SelectField><Field type="date" label="Date within week" name="week" defaultValue={week}/><button className="self-end rounded bg-blue-600 px-4 py-2 text-white">View calculation</button></form>{data && <WeeklyOvertime data={data} own={false}/>}
 {queue.records.map(r=><article key={r.id} className="rounded-lg border bg-white p-4 text-sm"><Link className="font-semibold text-blue-700" href={`?employeeId=${r.employeeId}&week=${dateKey(r.weekStartDate)}`}>{r.employee.legalName} · {dateKey(r.weekStartDate)} · {r.status}</Link><p>Snapshot actual {durationLabel(r.actualSecondsSnapshot)} · potential {durationLabel(r.potentialSecondsSnapshot)} · retained approval {durationLabel(r.approvedSeconds)}</p></article>)}{!queue.records.length && <p>No weekly reviews match this view. Select an employee and a completed week to calculate.</p>}
 <nav className="flex gap-5 text-sm"><span>Page {queue.page}</span>{queue.page>1 && <Link href={`?page=${queue.page-1}`}>Previous</Link>}{queue.hasNext && <Link href={`?page=${queue.page+1}`}>Next</Link>}</nav></>;
}
