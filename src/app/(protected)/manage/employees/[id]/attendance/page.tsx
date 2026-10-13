import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { attendanceHistory } from "@/features/time/data";
import { employeeProfile } from "@/features/people/data";
import { AttendanceHistory } from "@/components/time/attendance";
import { EmployeeHeader } from "@/components/people/employee-header";
import { FilterBar } from "@/components/ui/filter-bar";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { Alert } from "@/components/ui/alert";
import { AppError } from "@/lib/utils/errors";
type Query = Record<string, string | string[] | undefined>;
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Query> }) {
  const identity = await getIdentity(), id = (await params).id, query = await searchParams;
  // Date parameters are now honoured (they were previously dropped, so the page always showed today only).
  const dates = Object.fromEntries(["range", "date", "from", "to", "until", "page"].flatMap(key => typeof query[key] === "string" && query[key] ? [[key, query[key]]] : []));
  const result = await pageResult(attendanceHistory(identity, id, dates).then(data => ({ data, error: null as string | null })).catch(async error => { if (error instanceof AppError && error.status === 400) return { data: await attendanceHistory(identity, id, {}), error: error.message }; throw error; }));
  const profile = await pageResult(employeeProfile(identity, id)), data = result.data;
  return <><EmployeeHeader employee={profile} title="Attendance" />
    <FilterBar resetHref={`/manage/employees/${id}/attendance`} columns={4}><DateRangeFilter mode={data.mode} from={data.from} to={data.to} timezone={data.timezone} /></FilterBar>
    {result.error && <Alert tone="warning" role="alert" title="Showing today instead">{result.error}</Alert>}
    <p className="text-sm text-muted-foreground">Sessions touching <span className="font-medium text-foreground">{data.label}</span> · {data.timezone}. Up to 31 dates.</p>
    <AttendanceHistory data={data} own={false} path={`/manage/employees/${id}/attendance`} query={dates} />
  </>;
}
