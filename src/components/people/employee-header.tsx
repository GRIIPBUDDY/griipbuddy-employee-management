import Link from "next/link";
import { Pencil } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { TabNav } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { Avatar } from "@/components/ui/description-list";
import { Button } from "@/components/ui/button";
type Subject = { id: string; legalName: string; employeeNumber: string; photoDocumentId?: string | null; employmentStatus?: string; user?: { accountStatus: string; role: string } };
/** Consistent identity header and section tabs for every staff employee page. */
export function EmployeeHeader({ employee, title, description, actions }: { employee: Subject; title?: string; description?: string; actions?: React.ReactNode }) {
  const base = `/manage/employees/${employee.id}`;
  return <div className="space-y-5">
    <PageHeader breadcrumbs={[{ label: "Employees", href: "/manage/employees" }, { label: employee.legalName, href: base }, ...(title ? [{ label: title }] : [])]}
      leading={<Avatar name={employee.legalName} src={employee.photoDocumentId ? `/api/employees/${employee.id}/documents/${employee.photoDocumentId}?view=1` : null} size={52} />}
      title={employee.legalName} description={description}
      meta={<><span className="font-medium text-foreground">{employee.employeeNumber}</span>{employee.employmentStatus && <StatusBadge status={employee.employmentStatus} label={`Employment: ${employee.employmentStatus.toLowerCase()}`} />}{employee.user && employee.user.accountStatus !== "ACTIVE" && <StatusBadge status={employee.user.accountStatus} />}{employee.user && employee.user.role !== "EMPLOYEE" && <StatusBadge status="INFO" tone="info" label={employee.user.role === "ADMIN" ? "Administrator" : "HR / Manager"} />}</>}
      actions={actions ?? <Button asChild variant="outline"><Link href={`${base}/edit`}><Pencil size={15} aria-hidden="true" />Edit details</Link></Button>} />
    <TabNav label="Employee sections" items={[{ label: "Overview", href: base, exact: true }, { label: "Schedule", href: `${base}/schedule` }, { label: "Attendance", href: `${base}/attendance` }, { label: "Compensation", href: `${base}/compensation` }, { label: "Edit", href: `${base}/edit` }]} />
  </div>;
}
