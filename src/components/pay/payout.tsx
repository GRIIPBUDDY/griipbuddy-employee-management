import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField, FieldGrid } from "@/components/ui/field";
import { DescriptionList } from "@/components/ui/description-list";
import { Hidden } from "@/components/review/forms";
import { configAction } from "@/features/settings/config-actions";
import { payoutMethods, type payoutData } from "@/features/pay/payout";
/** Where salary is paid; used by the payment register and the bank / mobile payment export. */
export function PayoutCard({ employeeId, data }: { employeeId: string; data: Awaited<ReturnType<typeof payoutData>> }) {
  const p = data.payout;
  return <Card><CardHeader actions={data.canEdit && <Dialog trigger={p ? "Change" : "Add payment details"} title="Salary payment details" description="Used for the salary payment register and the bulk payment file. Changes are audited with the account number masked." size="md">
    <ActionForm action={configAction} submitLabel="Save payment details"><Hidden values={{ kind: "payout", employeeId }} />
      <SelectField label="Payment method" name="method" defaultValue={p?.method ?? "BANK"} required>{Object.entries(payoutMethods).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectField>
      <FieldGrid><Field label="Account name" name="accountName" maxLength={100} defaultValue={p?.accountName} hint="Not needed for cash." /><Field label="Account / wallet number" name="accountNumber" maxLength={34} defaultValue={p?.accountNumber} autoComplete="off" /></FieldGrid>
      <FieldGrid columns={3}><Field label="Bank name" name="bankName" maxLength={100} defaultValue={p?.bankName} hint="For bank transfers." /><Field label="Branch" name="branch" maxLength={100} defaultValue={p?.branch} /><Field label="Routing number" name="routingNumber" maxLength={20} defaultValue={p?.routingNumber} /></FieldGrid>
      <Field label="Reason for the change" name="reason" required maxLength={500} />
    </ActionForm></Dialog>}><CardTitle>Salary payment details</CardTitle><CardDescription>{data.canEdit ? "Visible to pay staff only. Employees see a masked account on their payslip." : "An administrator must change your own payment details."}</CardDescription></CardHeader>
    <CardContent>{p ? <DescriptionList items={[["Method", payoutMethods[p.method]], ...(p.method === "CASH" ? [] : [["Account name", p.accountName], ["Account number", p.accountNumber], ["Bank", p.bankName || "—"], ["Branch", p.branch || "—"], ["Routing number", p.routingNumber || "—"]] as [string, string][])]} /> : <p className="text-sm text-muted-foreground">No payment details recorded. They appear as “Not recorded” in the payment export.</p>}</CardContent></Card>;
}
