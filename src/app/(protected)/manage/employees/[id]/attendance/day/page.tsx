import Link from "next/link";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { attendanceDay } from "@/features/review/data";
import { displayInstant,durationLabel,dateKey } from "@/features/time/dates";
import { CorrectionForm,Quantity } from "@/components/review/forms";
import { Card,CardHeader,CardTitle,CardContent } from "@/components/ui/card";
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const {id}=await params,q=await searchParams,data=await pageResult(attendanceDay(await getIdentity(),id,q.date));
 return <><h1 className="text-3xl font-semibold">{data.employee.legalName} · {data.from}</h1><Link className="text-blue-700" href={`/manage/attendance?employeeId=${id}&from=${data.from}&until=${data.until}`}>Attendance review</Link>
 <div className="grid gap-3 sm:grid-cols-3"><Quantity label="Scheduled time" seconds={data.scheduledSeconds}/><Quantity label="Required time" seconds={data.requiredSeconds}/><Quantity label="Completed actual time" seconds={data.actualSeconds}/></div>
 {data.sessions.map(s=><Card key={s.id}><CardHeader><CardTitle>{s.voidedAt?"Voided":s.checkoutAt?"Completed":"Incomplete / currently working"}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p>{s.source} · revision {s.revision}</p><p>Work date: {dateKey(s.workDate)}. Original scheduled context: {s.scheduledStartAt?displayInstant(s.scheduledStartAt,data.timezone):"Unscheduled"} – {s.scheduledEndAt?displayInstant(s.scheduledEndAt,data.timezone):"—"}</p><p>Actual: {displayInstant(s.checkinAt,data.timezone)} – {s.checkoutAt?displayInstant(s.checkoutAt,data.timezone):"Missing checkout"}</p>{s.checkoutAt && <p>Full session elapsed: {durationLabel((s.checkoutAt.getTime()-s.checkinAt.getTime())/1000)} (daily totals clip at local midnight).</p>}<Link className="text-blue-700" href={`/manage/corrections?employeeId=${id}&sessionId=${s.id}&workDate=${dateKey(s.workDate)}`}>Propose a reviewed correction</Link></CardContent></Card>)}{!data.sessions.length && <p>No sessions recorded on this day. Ended required periods need review; leave, holidays and rest days excuse attendance.</p>}
 <Card><CardHeader><CardTitle>Related correction requests</CardTitle></CardHeader><CardContent>{data.corrections.map(c=><p key={c.id} className="mb-3 text-sm"><Link className="text-blue-700" href={`/manage/corrections?id=${c.id}`}>{c.type} · {c.status}</Link> · {c.reason} {c.reviewComment}</p>)}{!data.corrections.length && <p>No correction requests.</p>}</CardContent></Card><CorrectionForm timezone={data.timezone} employeeId={id} workDate={data.from}/></>;
}
