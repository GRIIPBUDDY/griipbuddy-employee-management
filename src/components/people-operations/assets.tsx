import { Boxes, Plus } from "lucide-react";
import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField, FieldGrid } from "@/components/ui/field";
import { Dialog } from "@/components/ui/dialog";
import { TableContainer, Cell2 } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Hidden } from "@/components/review/forms";
import { peopleOperationsAction } from "@/features/people-operations/actions";
import type { assetData, assignmentData } from "@/features/people-operations/assets";
import type { recordOptions } from "@/features/people-operations/records";
import { localDate } from "@/features/time/dates";
import { TextArea } from "./records";
import { optionItems, optionLabels } from "@/features/settings/config";
type AssetRow = Awaited<ReturnType<typeof assetData>>["records"][number];
const words = (v: string) => v[0] + v.slice(1).toLowerCase().replaceAll("_", " ");
async function AssetFields({ r }: { r?: AssetRow }) {
  const types = (await optionItems("ASSET_TYPE", undefined, true)).filter(t => t.isActive || t.code === r?.type);
  return <><FieldGrid><Field label="Asset ID" name="assetCode" required maxLength={50} defaultValue={r?.assetCode} hint="Unique inventory code." /><SelectField label="Type" name="type" defaultValue={r?.type ?? types[0]?.code}>{types.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}</SelectField></FieldGrid>
    <Field label="Name / description" name="name" required maxLength={150} defaultValue={r?.name} />
    <FieldGrid columns={3}><Field label="Serial number" name="serialNumber" maxLength={100} defaultValue={r?.serialNumber} /><Field label="Condition" name="condition" required maxLength={200} defaultValue={r?.condition} /><SelectField label="Inventory status" name="status" defaultValue={r?.status === "ASSIGNED" ? "AVAILABLE" : r?.status ?? "AVAILABLE"}>{["AVAILABLE", "RETIRED", "LOST"].map(t => <option key={t} value={t}>{words(t)}</option>)}</SelectField></FieldGrid>
    <TextArea label="Private inventory notes" name="notes" value={r?.notes} /></>;
}
export function NewAssetButton() { return <Dialog variant="default" trigger={<><Plus size={16} aria-hidden="true" />Add asset</>} title="Add company asset"><ActionForm action={peopleOperationsAction} submitLabel="Add asset"><Hidden values={{ kind: "assetCreate" }} /><AssetFields /></ActionForm></Dialog>; }
export async function AssetRegister({ data, options, today }: { data: Awaited<ReturnType<typeof assetData>>; options: Awaited<ReturnType<typeof recordOptions>>; today: string }) {
  const labels = await optionLabels("ASSET_TYPE");
  if (!data.records.length) return <EmptyState icon={Boxes} title="No assets match" description="Add laptops, phones, access cards and other company equipment." />;
  return <TableContainer label="Asset register"><table className="data-table min-w-[860px]"><thead><tr><th>Asset</th><th>Type</th><th>Condition</th><th>Status</th><th>Holder</th><th className="text-right">Actions</th></tr></thead><tbody>{data.records.map(r => <tr key={r.id}>
    <td><Cell2 primary={`${r.assetCode} · ${r.name}`} secondary={r.serialNumber ? `Serial ${r.serialNumber}` : "No serial number"} /></td><td>{labels[r.type] ?? words(r.type)}</td><td className="text-[13px]">{r.condition}</td>
    <td><StatusBadge status={r.displayStatus === "ASSIGNED" ? "INFO" : r.displayStatus} tone={r.displayStatus === "ASSIGNED" ? "info" : undefined} label={words(r.displayStatus)} /></td>
    <td className="text-[13px]">{r.holder ? <Cell2 primary={r.holder.employee.legalName} secondary={r.holder.outstandingOffboarding ? "Return outstanding (left or inactive)" : "Return outstanding"} /> : <span className="text-muted-foreground">—</span>}</td>
    <td><div className="flex justify-end gap-1">
      {!r.holder && r.status === "AVAILABLE" && <Dialog triggerSize="sm" variant="default" trigger="Assign" title={`Assign ${r.assetCode}`} description={r.name} size="sm"><ActionForm action={peopleOperationsAction} submitLabel="Record issue"><Hidden values={{ kind: "assetAssign", assetId: r.id }} /><SelectField label="Employee" name="employeeId" required><option value="">Choose employee</option>{options.employees.map(e => <option key={e.id} value={e.id}>{e.legalName}</option>)}</SelectField><Field label="Issue date" name="assignedDate" type="date" required defaultValue={today} /><Field label="Condition on issue" name="conditionOut" defaultValue={r.condition} required maxLength={200} /><TextArea label="Private notes" name="notes" /></ActionForm></Dialog>}
      <Dialog triggerSize="sm" variant="ghost" trigger="Edit" title={`Edit ${r.assetCode}`} description="Changes are audited; assignment history is never rewritten."><ActionForm action={peopleOperationsAction} submitLabel="Save changes"><Hidden values={{ kind: "assetEdit", id: r.id, revision: r.revision }} /><AssetFields r={r} /><Field label="Reason for the change" name="reason" required maxLength={500} /></ActionForm></Dialog>
    </div></td></tr>)}</tbody></table></TableContainer>;
}
export function Assignments({ data, staff, today }: { data: Awaited<ReturnType<typeof assignmentData>>; staff: boolean; today?: string }) {
  if (!data.records.length) return <EmptyState icon={Boxes} title={staff ? "No assignments" : "No company assets"} description={staff ? "Issued assets and returns appear here." : "Equipment issued to you will appear here."} />;
  return <TableContainer label="Asset assignments"><table className="data-table min-w-[820px]"><thead><tr><th>Asset</th>{staff && <th>Employee</th>}<th>Issued</th><th>Returned</th><th>Status</th>{staff && <th className="text-right">Action</th>}</tr></thead><tbody>{data.records.map(r => { const snapshot = r.identificationSnapshot as { assetCode: string; name: string; type: string; serialNumber: string }; return <tr key={r.id}>
    <td><Cell2 primary={`${snapshot.assetCode} · ${snapshot.name}`} secondary={`${words(snapshot.type)}${snapshot.serialNumber ? ` · ${snapshot.serialNumber}` : ""}`} /></td>
    {staff && <td className="whitespace-nowrap font-medium">{r.employee?.legalName}</td>}
    <td><Cell2 primary={localDate(r.assignedAt, data.timezone)} secondary={`Condition: ${r.conditionOut}`} /></td>
    <td>{r.returnedAt ? <Cell2 primary={localDate(r.returnedAt, data.timezone)} secondary={`Condition: ${r.conditionIn}`} /> : <span className="text-muted-foreground">—</span>}</td>
    <td><StatusBadge status={r.returnedAt ? "COMPLETED" : "PENDING"} label={r.returnedAt ? "Returned" : "With employee"} /></td>
    {staff && <td className="text-right">{!r.returnedAt && "revision" in r ? <Dialog triggerSize="sm" variant="outline" trigger="Record return" title={`Return ${snapshot.assetCode}`} description={`From ${r.employee?.legalName ?? "employee"}`} size="sm"><ActionForm action={peopleOperationsAction} submitLabel="Record return"><Hidden values={{ kind: "assetReturn", id: r.id, revision: r.revision }} /><Field label="Return date" name="returnDate" type="date" required defaultValue={today} /><Field label="Condition on return" name="conditionIn" required maxLength={200} /><TextArea label="Private notes" name="notes" /></ActionForm></Dialog> : null}</td>}
  </tr>; })}</tbody></table></TableContainer>;
}
