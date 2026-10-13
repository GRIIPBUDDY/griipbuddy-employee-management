import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { attendanceDay } from "@/features/review/data";
import { correctionList } from "@/features/review/corrections";
import { organizationSummary } from "@/features/settings/service";
import { CorrectionForm, CorrectionRequests } from "@/components/review/forms";
import { ReviewNav } from "@/components/review/review-nav";
import { PageHeader } from "@/components/ui/page-header";
import { TabNav } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/pagination";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const identity = await getIdentity(), q = await searchParams, status = typeof q.status === "string" ? q.status : "";
  const data = await pageResult(correctionList(identity, { page: q.page ?? 1, status }, true, q.id)), settings = await pageResult(organizationSummary(identity));
  const subject = typeof q.employeeId === "string" && q.employeeId ? await pageResult(attendanceDay(identity, q.employeeId, q.workDate)) : null;
  return <>
    <PageHeader title="Attendance corrections" description="Requests to add, change or remove attendance sessions. Official times change only when a request is approved." />
    <ReviewNav />
    {subject && <CorrectionForm employeeId={subject.employee.id} sessionId={typeof q.sessionId === "string" ? q.sessionId : ""} workDate={subject.from} />}
    <TabNav label="Correction status" items={[{ label: "Pending", href: "/manage/corrections?status=PENDING" }, { label: "Approved", href: "/manage/corrections?status=APPROVED" }, { label: "Rejected", href: "/manage/corrections?status=REJECTED" }, { label: "All requests", href: "/manage/corrections" }]} />
    <CorrectionRequests data={data} staff timezone={settings.timezone} />
    <Pagination page={data.page} hasNext={data.hasNext} query={{ status }} />
  </>;
}
