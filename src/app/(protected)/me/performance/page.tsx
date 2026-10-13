import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { recordData } from "@/features/people-operations/records";
import { organizationSummary } from "@/features/settings/service";
import { RecordWorkspace, PageLinks } from "@/components/people-operations/records";
import { PageHeader } from "@/components/ui/page-header";
import { strings, type Query } from "@/lib/utils/query";
export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const q = strings(await searchParams), identity = await getIdentity(), data = await pageResult(recordData(identity, "performance", q, false)), settings = await pageResult(organizationSummary(identity));
  return <><PageHeader title="My performance reviews" description="Records HR has finalized and released to you." /><RecordWorkspace data={data} kind="performance" staff={false} timezone={settings.timezone} /><PageLinks page={data.page} hasNext={data.hasNext} query={q} /></>;
}
