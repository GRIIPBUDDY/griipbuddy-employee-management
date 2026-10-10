import Link from "next/link";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { searchEmployees } from "@/features/people/data";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
export async function ManagementPicker({ search, section }: { search: string; section: "documents" | "timeline" | "schedule" | "attendance" }) {
  const result = await pageResult(searchEmployees(await getIdentity(), { search }));
  return <div className="space-y-5"><p className="text-muted-foreground">Choose an employee to manage their {section === "documents" ? "private documents" : section === "timeline" ? "work records and timeline" : section}.</p><form className="flex flex-wrap items-end gap-4"><Field label="Search name or employee ID" name="search" defaultValue={search} maxLength={150} /><Button type="submit">Search</Button></form><ul className="divide-y rounded-lg border bg-white">{result.employees.map(e => <li key={e.id} className="p-4"><Link href={["schedule", "attendance"].includes(section) ? `/manage/employees/${e.id}/${section}` : `/manage/employees/${e.id}#${section}`} className="font-medium text-blue-700">{e.legalName} · {e.employeeNumber}</Link></li>)}{result.employees.length === 0 && <li className="p-4 text-muted-foreground">No matching employees.</li>}</ul><Link href="/manage/employees" className="text-sm text-blue-700">Open the full paginated directory</Link></div>;
}
