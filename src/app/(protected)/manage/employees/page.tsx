import Link from "next/link";
import { UserPlus, Users } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { searchEmployees } from "@/features/people/data";
import { Field, SelectField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar } from "@/components/ui/filter-bar";
import { TableContainer, Cell2 } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { Avatar } from "@/components/ui/description-list";
import { RowActions } from "@/components/ui/row-actions";
export default async function Employees({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const search = typeof query.search === "string" ? query.search : "", department = typeof query.department === "string" ? query.department : "", status = typeof query.status === "string" ? query.status : "ALL";
  const result = await pageResult(searchEmployees(await getIdentity(), { search, department, status, page: query.page ?? 1 }));
  return <>
    <PageHeader title="Employees" description="Directory of employee profiles, employment and account access." actions={<Button asChild><Link href="/manage/employees/new"><UserPlus size={16} aria-hidden="true" />Add employee</Link></Button>} />
    <FilterBar resetHref="/manage/employees"><Field label="Search" name="search" type="search" placeholder="Name or employee ID" defaultValue={search} maxLength={150} /><SelectField label="Department" name="department" defaultValue={department}><option value="">All departments</option>{result.departments.map(d => <option key={d.id} value={d.id}>{d.name}{d.isActive ? "" : " (inactive)"}</option>)}</SelectField><SelectField label="Employment status" name="status" defaultValue={status}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="UPCOMING">Upcoming</option></SelectField></FilterBar>
    {result.employees.length === 0 ? <EmptyState icon={Users} title="No matching employees" description="Try a different name, department or employment status." /> :
    <TableContainer label="Employee directory"><table className="data-table min-w-[760px]"><thead><tr><th>Employee</th><th>Department · position</th><th>Employment</th><th>Account</th><th>Joined</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{result.employees.map(e => <tr key={e.id}>
      <td><div className="flex items-center gap-3"><Avatar name={e.legalName} src={e.photoDocumentId ? `/api/employees/${e.id}/documents/${e.photoDocumentId}?view=1` : null} size={34} /><Cell2 primary={<Link href={`/manage/employees/${e.id}`} className="hover:text-primary hover:underline">{e.legalName}</Link>} secondary={`${e.employeeNumber} · ${e.email}`} /></div></td>
      <td><Cell2 primary={e.departmentLabel} secondary={e.positionLabel} /></td><td><StatusBadge status={e.status} /></td><td><StatusBadge status={e.accountStatus} /></td>
      <td className="whitespace-nowrap text-muted-foreground">{e.joinDate?.toISOString().slice(0, 10) ?? "—"}</td>
      <td className="w-12 text-right"><RowActions label={e.legalName} items={[{ label: "View profile", href: `/manage/employees/${e.id}` }, { label: "Edit details", href: `/manage/employees/${e.id}/edit` }, { label: "Schedule", href: `/manage/employees/${e.id}/schedule` }, { label: "Attendance", href: `/manage/employees/${e.id}/attendance` }, { label: "Compensation", href: `/manage/employees/${e.id}/compensation` }]} /></td>
    </tr>)}</tbody></table></TableContainer>}
    <Pagination page={result.page} pages={result.pages} total={result.total} noun="employees" query={query} />
  </>;
}
