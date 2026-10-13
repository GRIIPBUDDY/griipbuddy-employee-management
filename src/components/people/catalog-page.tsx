import { Plus, Building2 } from "lucide-react";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { listCatalog, type CatalogKind } from "@/features/organization/catalogs";
import { createCatalogAction, updateCatalogAction } from "@/features/organization/actions";
import { ActionForm } from "@/components/ui/action-form";
import { Field, CheckboxField } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Dialog } from "@/components/ui/dialog";
import { TableContainer } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
export async function CatalogPage({ kind }: { kind: CatalogKind }) {
  const entries = await pageResult(listCatalog(await getIdentity(), kind));
  const title = kind === "departments" ? "Departments" : "Positions", singular = kind === "departments" ? "department" : "position";
  return <>
    <PageHeader title={title} description={`Names are unique, including inactive entries. Deactivating a ${singular} keeps employment history intact and prevents new assignments.`}
      actions={<Dialog variant="default" trigger={<><Plus size={16} aria-hidden="true" />New {singular}</>} title={`Create ${singular}`} size="sm"><ActionForm action={createCatalogAction} submitLabel={`Create ${singular}`}><input type="hidden" name="kind" value={kind} /><Field label="Name" name="name" maxLength={100} required autoFocus /></ActionForm></Dialog>} />
    {entries.length === 0 ? <EmptyState icon={Building2} title={`No ${kind} yet`} description={`Create the first ${singular} to start assigning employees.`} /> :
    <TableContainer label={title}><table className="data-table"><thead><tr><th>Name</th><th>Status</th><th>Last updated</th><th className="text-right">Actions</th></tr></thead><tbody>{entries.map(entry => <tr key={entry.id}>
      <td className="font-medium">{entry.name}</td><td><StatusBadge status={entry.isActive ? "ACTIVE" : "INACTIVE"} /></td><td className="text-muted-foreground">{entry.updatedAt.toISOString().slice(0, 10)}</td>
      <td className="text-right"><Dialog triggerSize="sm" variant="ghost" trigger="Edit" triggerLabel={`Edit ${entry.name}`} title={`Edit ${singular}`} description="Renaming updates directory names. Employment history keeps the label recorded at the time." size="sm"><ActionForm action={updateCatalogAction} submitLabel="Save changes"><input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={entry.id} /><input type="hidden" name="expectedUpdatedAt" value={entry.updatedAt.toISOString()} /><Field label="Name" name="name" defaultValue={entry.name} maxLength={100} required /><CheckboxField name="isActive" defaultChecked={entry.isActive} label="Active" description="Available for new assignments." /><Field label="Reason for the change" name="reason" required maxLength={500} /></ActionForm></Dialog></td>
    </tr>)}</tbody></table></TableContainer>}
  </>;
}
