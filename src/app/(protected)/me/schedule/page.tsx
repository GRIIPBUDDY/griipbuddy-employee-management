import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { ownSchedule } from "@/features/time/data";
import { ScheduleView } from "@/components/time/schedule";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const data = await pageResult(ownSchedule(await getIdentity(), { week: typeof query.week === "string" ? query.week : undefined }));
  return <><PageHeader title="My schedule" description="Your assigned work periods, check-in and this week’s hours." />{data ? <ScheduleView data={data} own path="/me/schedule" /> : <EmptyState title="No employee profile" description="This account is not linked to an employee profile." />}</>;
}
