import type { Identity } from "@/types/auth";
import { employeeControlData } from "@/features/accounts/controls";
import { controlAction } from "@/features/accounts/control-actions";
import { pageResult } from "@/lib/auth/page-result";
import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField, CheckboxField } from "@/components/ui/field";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { DescriptionList } from "@/components/ui/description-list";
import { Alert } from "@/components/ui/alert";
const statusHelp = "Active: normal access. On hold: the employee can view their own records but cannot check in or out, update tasks or perform other operational actions. Suspended: sign-in is blocked and all existing sessions are revoked immediately.";
export async function EmployeeControls({ identity, employeeId }: { identity: Identity | null; employeeId: string }) {
  const d = await pageResult(employeeControlData(identity, employeeId));
  return <Card><CardHeader><CardTitle>Account & access</CardTitle><CardDescription>Login, status and feature access for this employee. Every change is audited.</CardDescription></CardHeader><CardContent className="space-y-5">
    <DescriptionList items={[["Login email", d.user.email], ["Account status", <StatusBadge key="s" status={d.user.accountStatus} />], ...(d.canManage && d.preorderCommissionEnabled !== undefined ? [["Pre-order commission access", d.preorderCommissionEnabled ? "Enabled" : "Not enabled"] as [string, string]] : [])]} />
    {!d.canChangeStatus && <Alert tone="neutral">{d.user.role === "EMPLOYEE" ? "You cannot change your own account." : "Only an administrator can change the status of staff accounts."}</Alert>}
    {d.canChangeStatus && <div className="flex flex-wrap gap-2">
      <Dialog variant="outline" trigger="Change account status" title="Change account status" description={statusHelp}>
        <ActionForm action={controlAction} submitLabel="Change status" confirmation={{ title: "Change this account’s status?", description: "On hold restricts operational actions. Suspension signs the person out everywhere and blocks sign-in until reactivated. Historical records are always preserved.", label: "Confirm status change", destructive: true }}>
          <input type="hidden" name="kind" value="status" /><input type="hidden" name="employeeId" value={d.id} />
          <SelectField name="status" label="New status" defaultValue={d.user.accountStatus}><option value="ACTIVE">Active</option><option value="ON_HOLD">On hold</option><option value="SUSPENDED">Suspended</option></SelectField>
          <Field name="reason" label="Internal reason" required maxLength={500} hint="Recorded in the audit log; the employee is notified of the status only." />
        </ActionForm></Dialog>
      {d.user.role === "EMPLOYEE" && <Dialog variant="outline" trigger="Change login email" title="Change employee login email" description="A verification link is sent to the new address. The current email keeps working until it is confirmed.">
        <ActionForm action={controlAction} submitLabel="Send verification"><input type="hidden" name="kind" value="email" /><input type="hidden" name="employeeId" value={d.id} /><Field label="New employee email" name="newEmail" type="email" required maxLength={254} /><Field label="Your current password" name="currentPassword" type="password" required autoComplete="current-password" hint="Required to confirm this sensitive change." /></ActionForm></Dialog>}
      {d.canManage && <Dialog variant="outline" trigger="Feature access" title="Pre-order commission access" description="Only enabled employees can see their own pre-order commission records and request rechecks.">
        <ActionForm action={controlAction} submitLabel="Save access"><input type="hidden" name="kind" value="eligibility" /><input type="hidden" name="employeeId" value={d.id} /><CheckboxField name="enabled" defaultChecked={d.preorderCommissionEnabled} label="Enable pre-order commission access" /><Field name="reason" label="Reason for the change" required maxLength={500} /></ActionForm></Dialog>}
    </div>}
  </CardContent></Card>;
}
