import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { employeeSchedule } from "@/features/time/data";
import { ScheduleView } from "@/components/time/schedule";
import { EmployeeTimeLinks, ScheduleManagement } from "@/components/time/management";
import { employeeProfile } from "@/features/people/data";
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const identity = await getIdentity(), id = (await params).id, query = await searchParams;
  const data = await pageResult(employeeSchedule(identity, id, { week: query.week }));
  const profile = await pageResult(employeeProfile(identity, id));
  return <><h1 className="text-3xl font-semibold tracking-tight">{data.employee.legalName} · schedule</h1><EmployeeTimeLinks employeeId={id} /><ScheduleView data={data} own={false} path={`/manage/employees/${id}/schedule`} /><ScheduleManagement data={data} profile={profile} /></>;
}
