import Link from "next/link";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { ownAttendanceDetail } from "@/features/time/data";
import { organizationSummary } from "@/features/settings/service";
import { correctionList } from "@/features/review/corrections";
import { CorrectionForm,CorrectionRequests } from "@/components/review/forms";
import { dateKey } from "@/features/time/dates";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const identity=await getIdentity(),q=await searchParams,settings=await pageResult(organizationSummary(identity)),data=await pageResult(correctionList(identity,{page:q.page??1,status:q.status??""},false,q.id));
 const target=q.sessionId?await pageResult(ownAttendanceDetail(identity,q.sessionId)):null;
 return <><h1 className="text-3xl font-semibold">My attendance corrections</h1><Link className="text-blue-700" href="/me/attendance">My attendance</Link><CorrectionForm timezone={settings.timezone} sessionId={target?.id} scheduleSlotId={target?.scheduleSlotId??""} workDate={target?dateKey(target.workDate):""}/><CorrectionRequests data={data} staff={false} timezone={settings.timezone}/><nav className="flex gap-5 text-sm"><span>Page {data.page}</span>{data.page>1 && <Link href={`?page=${data.page-1}`}>Previous</Link>}{data.hasNext && <Link href={`?page=${data.page+1}`}>Next</Link>}</nav></>;
}
