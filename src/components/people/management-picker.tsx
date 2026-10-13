import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { searchEmployees } from "@/features/people/data";
import { Field } from "@/components/ui/field";
import { FilterBar } from "@/components/ui/filter-bar";
import { TableContainer, Cell2 } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar } from "@/components/ui/description-list";
import { Pagination } from "@/components/ui/pagination";
/** Employee chooser for modules managed per employee (documents, timeline, schedules). */
export async function ManagementPicker({ search, section, page = "1", path }: { search: string; section: "documents" | "timeline" | "schedule" | "attendance"; page?: string; path: string }) {
  const result = await pageResult(searchEmployees(await getIdentity(), { search, page }));
  const href = (id: string) => ["schedule", "attendance"].includes(section) ? `/manage/employees/${id}/${section}` : `/manage/employees/${id}#${section}`;
  const action = { documents: "Open documents", timeline: "Open timeline", schedule: "Manage schedule", attendance: "View attendance" }[section];
  return <>
    <FilterBar resetHref={path} columns={3}><Field label="Search employees" name="search" type="search" placeholder="Name or employee ID" defaultValue={search} maxLength={150} /></FilterBar>
    {result.employees.length === 0 ? <EmptyState icon={Users} title="No matching employees" description="Try another name or employee ID." /> :
    <TableContainer label="Employees"><table className="data-table min-w-[620px]"><thead><tr><th>Employee</th><th>Department · position</th><th>Status</th><th className="text-right">Action</th></tr></thead><tbody>{result.employees.map(e => <tr key={e.id}>
      <td><div className="flex items-center gap-3"><Avatar name={e.legalName} size={32} /><Cell2 primary={e.legalName} secondary={e.employeeNumber} /></div></td><td><Cell2 primary={e.departmentLabel} secondary={e.positionLabel} /></td><td><StatusBadge status={e.accountStatus !== "ACTIVE" ? e.accountStatus : e.status} /></td>
      <td className="text-right"><Link href={href(e.id)} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">{action}<span className="sr-only"> for {e.legalName}</span><ChevronRight size={15} aria-hidden="true" /></Link></td></tr>)}</tbody></table></TableContainer>}
    <Pagination page={result.page} pages={result.pages} total={result.total} noun="employees" query={{ search }} path={path} />
  </>;
}
