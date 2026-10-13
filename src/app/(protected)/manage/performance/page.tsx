import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { recordData, recordOptions } from "@/features/people-operations/records";
import { organizationSummary } from "@/features/settings/service";
import { RecordWorkspace, RecordFilters, PageLinks, NewRecordButton } from "@/components/people-operations/records";
import { PageHeader } from "@/components/ui/page-header";
import { strings, type Query } from "@/lib/utils/query";
export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const q = strings(await searchParams), identity = await getIdentity(), data = await pageResult(recordData(identity, "performance", q, true)), settings = await pageResult(organizationSummary(identity));
  const employeeId = q.employeeId ?? (q.id && data.records[0] && "employeeId" in data.records[0] ? data.records[0].employeeId : undefined), options = await pageResult(recordOptions(identity, employeeId));
  return <><PageHeader title="Performance reviews" description="Draft, finalize and release performance reviews. Private staff notes are never visible to employees." actions={<NewRecordButton kind="performance" options={options} employeeId={employeeId} />} /><RecordFilters options={options} kind="performance" query={q} /><RecordWorkspace data={data} kind="performance" staff options={options} employeeId={employeeId} timezone={settings.timezone} /><PageLinks page={data.page} hasNext={data.hasNext} query={q} /></>;
}
