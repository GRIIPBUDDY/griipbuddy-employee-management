import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { listCatalog, type CatalogKind } from "@/features/organization/catalogs";
import { createCatalogAction, updateCatalogAction } from "@/features/organization/actions";
import { ActionForm } from "@/components/ui/action-form";
import { Field } from "@/components/ui/field";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
export async function CatalogPage({ kind }: { kind: CatalogKind }) {
  const entries = await pageResult(listCatalog(await getIdentity(), kind));
  const title = kind === "departments" ? "Departments" : "Positions";
  return <><h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
    <Card><CardHeader><CardTitle>Create {kind === "departments" ? "department" : "position"}</CardTitle><CardDescription>Names are unique, including inactive entries. Deactivation preserves employment records and prevents new assignments.</CardDescription></CardHeader><CardContent><ActionForm action={createCatalogAction} submitLabel="Create entry"><input type="hidden" name="kind" value={kind} /><Field label="Name" name="name" maxLength={100} required /></ActionForm></CardContent></Card>
    <Card><CardHeader><CardTitle>Manage {kind}</CardTitle><CardDescription>Renaming updates directory names. Employment history retains its original labels.</CardDescription></CardHeader><CardContent><ul className="space-y-4">{entries.map(entry => <li key={entry.id} className="rounded-lg border p-4"><div className="flex items-center justify-between gap-3"><h2 className="font-medium">{entry.name}</h2><span className="text-xs text-muted-foreground">{entry.isActive ? "Active" : "Inactive"}</span></div><details className="mt-3"><summary className="cursor-pointer text-sm font-medium text-blue-700">Edit or deactivate</summary><div className="mt-4"><ActionForm action={updateCatalogAction} submitLabel="Save entry"><input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={entry.id} /><input type="hidden" name="expectedUpdatedAt" value={entry.updatedAt.toISOString()} /><Field label="Name" name="name" defaultValue={entry.name} maxLength={100} required /><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={entry.isActive} />Active — available for new assignments</label><Field label="Change reason" name="reason" required maxLength={500} /></ActionForm></div></details></li>)}{entries.length === 0 && <li className="text-sm text-muted-foreground">No {kind} yet. Create the first entry above.</li>}</ul></CardContent></Card>
  </>;
}
