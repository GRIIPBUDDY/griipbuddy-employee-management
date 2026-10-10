import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { attendanceHistory } from "@/features/time/data";
import { AttendanceHistory } from "@/components/time/attendance";
import { EmployeeTimeLinks } from "@/components/time/management";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const identity = await getIdentity(), id = (await params).id, query = await searchParams;
  const data = await pageResult(attendanceHistory(identity, id, { page: query.page ?? 1 }));
  
  return <><h1 className="text-3xl font-semibold tracking-tight">{data.employee.legalName} · attendance</h1><EmployeeTimeLinks employeeId={id} /><AttendanceHistory data={data} own={false} path={`/manage/employees/${id}/attendance`} /></>;
}
