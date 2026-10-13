import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { assetData, assignmentData } from "@/features/people-operations/assets";
import { recordOptions } from "@/features/people-operations/records";
import { organizationSummary } from "@/features/settings/service";
import { AssetRegister, Assignments, NewAssetButton } from "@/components/people-operations/assets";
import { optionItems } from "@/features/settings/config";
import { SelectField } from "@/components/ui/field";
import { PageHeader, SectionHeading } from "@/components/ui/page-header";
import { FilterBar } from "@/components/ui/filter-bar";
import { Pagination } from "@/components/ui/pagination";
import { localDate } from "@/features/time/dates";
import { strings, type Query } from "@/lib/utils/query";
export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const q = strings(await searchParams), { assignmentId, historyPage, ...filters } = q, identity = await getIdentity();
  const assetFilters = Object.fromEntries(Object.entries(filters).filter(([k]) => ["type", "status", "page", "id"].includes(k)));
  const [data, history, options, settings] = await Promise.all([pageResult(assetData(identity, assetFilters)), pageResult(assignmentData(identity, { ...(assignmentId ? { id: assignmentId } : {}), ...(q.id ? { assetId: q.id } : {}), ...(q.employeeId ? { employeeId: q.employeeId } : {}), page: historyPage ?? 1 }, true)), pageResult(recordOptions(identity)), pageResult(organizationSummary(identity))]);
  const today = localDate(new Date(), settings.timezone);
  return <>
    <PageHeader title="Company assets" description="Inventory of laptops, phones, cards and other equipment, with issue and return history." actions={<NewAssetButton />} />
    <FilterBar resetHref="/manage/assets"><SelectField label="Type" name="type" defaultValue={q.type ?? ""}><option value="">All types</option>{(await optionItems("ASSET_TYPE", undefined, true)).map(t => <option key={t.code} value={t.code}>{t.label}</option>)}</SelectField><SelectField label="Status" name="status" defaultValue={q.status ?? ""}><option value="">All statuses</option>{["AVAILABLE", "ASSIGNED", "RETIRED", "LOST"].map(t => <option key={t} value={t}>{t[0] + t.slice(1).toLowerCase()}</option>)}</SelectField><SelectField label="Assignment history for" name="employeeId" defaultValue={q.employeeId ?? ""}><option value="">All employees</option>{options.employees.map(e => <option key={e.id} value={e.id}>{e.legalName}</option>)}</SelectField></FilterBar>
    <AssetRegister data={data} options={options} today={today} />
    <Pagination page={data.page} hasNext={data.hasNext} query={q} />
    <SectionHeading title="Issue & return history" description="Each assignment keeps the asset identification recorded at the time." />
    <Assignments data={history} staff today={today} />
    <Pagination page={history.page} hasNext={history.hasNext} query={q} pageKey="historyPage" />
  </>;
}
