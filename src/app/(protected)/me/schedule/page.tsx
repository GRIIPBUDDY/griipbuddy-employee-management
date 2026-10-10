import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { ownSchedule } from "@/features/time/data";
import { ScheduleView } from "@/components/time/schedule";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const data = await pageResult(ownSchedule(await getIdentity(), { week: query.week }));
  return <><h1 className="text-3xl font-semibold tracking-tight">My schedule</h1>{data ? <ScheduleView data={data} own path="/me/schedule" /> : <p className="text-muted-foreground">No linked employee profile is available.</p>}</>;
}
