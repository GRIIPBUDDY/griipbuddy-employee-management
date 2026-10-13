import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { assignmentData } from "@/features/people-operations/assets";
import { Assignments } from "@/components/people-operations/assets";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { strings, type Query } from "@/lib/utils/query";
export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const q = strings(await searchParams), { assignmentId, ...query } = q, data = await pageResult(assignmentData(await getIdentity(), { ...query, ...(assignmentId ? { id: assignmentId } : {}) }));
  return <><PageHeader title="My company assets" description="Equipment issued to you and its return history." /><Assignments data={data} staff={false} /><Pagination page={data.page} hasNext={data.hasNext} query={q} /></>;
}
