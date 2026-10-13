import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { taskData } from "@/features/tasks/service";
import { employeeOptions } from "@/features/people/data";
import { StaffTasks, AssignTaskButton } from "@/components/tasks/workspace";
import { PageHeader } from "@/components/ui/page-header";
import { strings, type Query } from "@/lib/utils/query";
export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const identity = await getIdentity(), q = strings(await searchParams), data = await pageResult(taskData(identity, q)), employees = await pageResult(employeeOptions(identity));
  return <><PageHeader title="Tasks" description="Assign one-off tasks to one or several employees and follow each person’s progress independently." actions={<AssignTaskButton employees={employees} today={data.today} />} /><StaffTasks data={data} employees={employees} query={q} /></>;
}
