import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { ownAttendanceDetail } from "@/features/time/data";
import { organizationSummary } from "@/features/settings/service";
import { correctionList } from "@/features/review/corrections";
import { CorrectionForm, CorrectionRequests } from "@/components/review/forms";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { dateKey } from "@/features/time/dates";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const identity = await getIdentity(), q = await searchParams, settings = await pageResult(organizationSummary(identity)), data = await pageResult(correctionList(identity, { page: q.page ?? 1, status: q.status ?? "" }, false, q.id));
  const target = typeof q.sessionId === "string" ? await pageResult(ownAttendanceDetail(identity, q.sessionId)) : null;
  return <>
    <PageHeader title="Attendance corrections" description="Ask HR to add a missing session, fix times or remove a session recorded in error. You cannot edit official attendance directly." actions={<CorrectionForm dialog sessionId={target?.id} workDate={target ? dateKey(target.workDate) : ""} />} />
    <CorrectionRequests data={data} staff={false} timezone={settings.timezone} />
    <Pagination page={data.page} hasNext={data.hasNext} query={{}} />
  </>;
}
