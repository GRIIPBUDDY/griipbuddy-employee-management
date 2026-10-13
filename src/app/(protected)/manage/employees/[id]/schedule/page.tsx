import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { employeeSchedule } from "@/features/time/data";
import { TodayPanel, WeekGrid } from "@/components/time/schedule";
import { ScheduleManagement } from "@/components/time/management";
import { EmployeeHeader } from "@/components/people/employee-header";
import { employeeProfile } from "@/features/people/data";
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const identity = await getIdentity(), id = (await params).id, query = await searchParams;
  const data = await pageResult(employeeSchedule(identity, id, { week: query.week }));
  const profile = await pageResult(employeeProfile(identity, id));
  return <><EmployeeHeader employee={profile} title="Schedule" /><ScheduleManagement data={data} profile={profile} /><WeekGrid data={data} path={`/manage/employees/${id}/schedule`} /><TodayPanel data={data} own={false} /></>;
}
