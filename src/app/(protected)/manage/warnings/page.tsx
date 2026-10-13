import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { recordData, recordOptions } from "@/features/people-operations/records";
import { organizationSummary } from "@/features/settings/service";
import { RecordWorkspace, RecordFilters, PageLinks, NewRecordButton } from "@/components/people-operations/records";
import { PageHeader } from "@/components/ui/page-header";
import { strings, type Query } from "@/lib/utils/query";
export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const q = strings(await searchParams), identity = await getIdentity(), data = await pageResult(recordData(identity, "warnings", q, true)), settings = await pageResult(organizationSummary(identity));
  const employeeId = q.employeeId ?? (q.id && data.records[0] && "employeeId" in data.records[0] ? data.records[0].employeeId : undefined), options = await pageResult(recordOptions(identity, employeeId));
  return <><PageHeader title="Warnings & notices" description="Official notices and warnings. Employees acknowledge receipt only; revoked notices stay in history." actions={<NewRecordButton kind="warnings" options={options} employeeId={employeeId} />} /><RecordFilters options={options} kind="warnings" query={q} /><RecordWorkspace data={data} kind="warnings" staff options={options} employeeId={employeeId} timezone={settings.timezone} /><PageLinks page={data.page} hasNext={data.hasNext} query={q} /></>;
}
