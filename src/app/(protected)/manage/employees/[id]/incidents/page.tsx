import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { incidentOverview, incidentFormOptions } from "@/features/people-operations/incidents";
import { employeeProfile } from "@/features/people/data";
import { organizationSummary } from "@/features/settings/service";
import { EmployeeHeader } from "@/components/people/employee-header";
import { NewIncidentButton, IncidentTable, IncidentFilters } from "@/components/people-operations/incidents";
import { Pagination } from "@/components/ui/pagination";
import { strings, type Query } from "@/lib/utils/query";
const keys = ["page", "kind", "category", "severity", "status", "state", "from", "to", "reportedBy"];
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Query> }) {
  const id = (await params).id, identity = await getIdentity(), q = Object.fromEntries(Object.entries(strings(await searchParams)).filter(([k]) => keys.includes(k))) as Record<string, string>;
  const [profile, data, options, settings] = await Promise.all([pageResult(employeeProfile(identity, id)), pageResult(incidentOverview(identity, { ...q, employeeId: id })), pageResult(incidentFormOptions(identity, id)), pageResult(organizationSummary(identity))]);
  const { page: _page, ...filters } = q; void _page;
  return <>
    <EmployeeHeader employee={profile} title="Incidents & performance" actions={<NewIncidentButton employeeId={id} options={options} timezone={settings.timezone} today={data.today} />} />
    <p className="text-sm text-muted-foreground">Newest first. Concerns and positive records with their review decision, employee response, corrective action and resolution. Records awaiting review are not confirmed faults.</p>
    <IncidentFilters query={q} resetHref={`/manage/employees/${id}/incidents`} reporters={data.reporters} showSearch={false} />
    <IncidentTable records={data.records} showEmployee={false} />
    <Pagination page={data.page} pages={data.pages} total={data.total} query={filters} path={`/manage/employees/${id}/incidents`} />
  </>;
}
