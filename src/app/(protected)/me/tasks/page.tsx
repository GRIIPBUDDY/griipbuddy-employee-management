import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { taskData } from "@/features/tasks/service";
import { MyTasks } from "@/components/tasks/workspace";
import { PageHeader } from "@/components/ui/page-header";
import { strings, type Query } from "@/lib/utils/query";
export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const raw = await searchParams, q = strings(raw);
  // Open tasks from every date are shown by default so older or overdue work is never hidden.
  const input = { ...q, ...(raw.status === undefined ? { status: "OPEN" } : {}) };
  const data = await pageResult(taskData(await getIdentity(), input, true));
  return <><PageHeader title="My tasks" description="Tasks assigned to you. Starting and completing a task only affects your own assignment." /><MyTasks data={data} query={input} /></>;
}
