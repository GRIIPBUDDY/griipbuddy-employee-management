import Link from "next/link";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { attendanceDay } from "@/features/review/data";
import { correctionList } from "@/features/review/corrections";
import { organizationSummary } from "@/features/settings/service";
import { CorrectionForm,CorrectionRequests } from "@/components/review/forms";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const identity=await getIdentity(),q=await searchParams,data=await pageResult(correctionList(identity,{page:q.page??1,status:q.status??""},true,q.id)),settings=await pageResult(organizationSummary(identity));
 const subject=q.employeeId?await pageResult(attendanceDay(identity,q.employeeId,q.workDate)):null;
 return <><h1 className="text-3xl font-semibold">Attendance correction review</h1><nav className="flex flex-wrap gap-5 text-sm text-blue-700"><Link href="/manage/attendance">Attendance</Link><Link href="?status=PENDING">Pending requests</Link><Link href="/manage/corrections">All requests</Link></nav>
 {subject && <CorrectionForm timezone={settings.timezone} employeeId={subject.employee.id} sessionId={typeof q.sessionId==="string"?q.sessionId:""} workDate={subject.from} scheduleSlotId={subject.sessions.find(s=>s.id===q.sessionId)?.scheduleSlotId??""}/>}
 <CorrectionRequests data={data} staff timezone={settings.timezone}/><nav className="flex gap-5 text-sm"><span>Page {data.page}</span>{data.page>1 && <Link href={`?page=${data.page-1}`}>Previous</Link>}{data.hasNext && <Link href={`?page=${data.page+1}`}>Next</Link>}</nav></>;
}
