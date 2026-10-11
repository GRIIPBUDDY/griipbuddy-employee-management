import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { searchEmployees } from "@/features/people/data";
import { Field, SelectField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
export default async function Employees({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const search = typeof query.search === "string" ? query.search : "", department = typeof query.department === "string" ? query.department : "", status = typeof query.status === "string" ? query.status : "ALL";
  const result = await pageResult(searchEmployees(await getIdentity(), { search, department, status, page: query.page ?? 1 }));
  const link = (page: number) => `/manage/employees?${new URLSearchParams({ search, department, status, page: String(page) })}`;
  return <><div className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-3xl font-semibold tracking-tight">Employees</h1><Button asChild><Link href="/manage/employees/new">Create employee</Link></Button></div>
    <Card><CardHeader><CardTitle>Employee directory</CardTitle><CardDescription>{result.total} matching employees</CardDescription></CardHeader><CardContent><form className="mb-6 grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-4"><Field label="Search name or employee ID" name="search" defaultValue={search} maxLength={150} /><SelectField label="Department" name="department" defaultValue={department}><option value="">All departments</option>{result.departments.map(d => <option key={d.id} value={d.id}>{d.name}{d.isActive ? "" : " (inactive)"}</option>)}</SelectField><SelectField label="Employment status" name="status" defaultValue={status}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="UPCOMING">Upcoming</option></SelectField><Button type="submit">Search</Button></form>
    <div className="overflow-x-auto rounded-xl border"><table className="w-full text-left text-sm"><thead><tr className="border-b text-muted-foreground">{["Employee", "Employee ID", "Department / position", "Status", "Join date"].map(label => <th key={label} className="py-3 pr-4">{label}</th>)}</tr></thead><tbody>{result.employees.map(e => <tr key={e.id} className="border-b"><td className="py-4 pr-4"><div className="flex items-center gap-3">{e.photoDocumentId ? <img src={`/api/employees/${e.id}/documents/${e.photoDocumentId}?view=1`} alt="" width={40} height={40} className="h-10 w-10 rounded-full object-cover" /> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-50 font-semibold text-blue-700">{e.legalName[0]}</span>}<Link href={`/manage/employees/${e.id}`} className="font-medium text-blue-700 hover:underline">{e.legalName}</Link></div></td><td className="py-4 pr-4">{e.employeeNumber}</td><td className="py-4 pr-4">{e.departmentLabel} / {e.positionLabel}</td><td className="py-4 pr-4"><StatusBadge status={e.status}/></td><td className="whitespace-nowrap py-4">{e.joinDate?.toISOString().slice(0, 10) ?? "—"}</td></tr>)}</tbody></table>{result.employees.length === 0 && <EmptyState title="No matching employees" description="Try a different name, department or employment status."/>}</div>
    <nav aria-label="Employee pagination" className="mt-5 flex items-center gap-5 text-sm"><span>Page {result.page} of {result.pages}</span>{result.page > 1 && <Link href={link(result.page - 1)} className="text-blue-700">Previous</Link>}{result.page < result.pages && <Link href={link(result.page + 1)} className="text-blue-700">Next</Link>}</nav></CardContent></Card>
  </>;
}
