import { UserPlus, ShieldCheck } from "lucide-react";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { listAccounts } from "@/features/accounts/service";
import { createAccountAction, securityAction, resetPasswordAction } from "@/features/accounts/actions";
import { Field, SelectField, CheckboxField, FieldGrid, FormSection } from "@/components/ui/field";
import { ActionForm } from "@/components/ui/action-form";
import { PageHeader } from "@/components/ui/page-header";
import { Dialog } from "@/components/ui/dialog";
import { TableContainer, Cell2 } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar } from "@/components/ui/description-list";
const roleName = (role: string) => role === "ADMIN" ? "Administrator" : role === "HR_MANAGER" ? "HR / Manager" : "Employee";
function Roles() { return <><option value="EMPLOYEE">Employee</option><option value="HR_MANAGER">HR / Manager</option><option value="ADMIN">Administrator</option></>; }
export default async function Accounts() {
  const accounts = await pageResult(listAccounts(await getIdentity()));
  return <>
    <PageHeader title="User accounts" description="Provision logins and manage roles, access and feature grants. Changes revoke the person’s existing sessions."
      actions={<Dialog sheet variant="default" trigger={<><UserPlus size={16} aria-hidden="true" />Create account</>} title="Create account" description="Temporary passwords expire after 24 hours and must be changed at first sign-in.">
        <ActionForm action={createAccountAction} submitLabel="Create account" resetOnSuccess><div className="space-y-6">
          <FormSection title="Login"><FieldGrid><Field label="Work email" name="email" type="email" required maxLength={254} /><Field label="Display name" name="displayName" required maxLength={100} /></FieldGrid><FieldGrid><SelectField label="Role" name="role" defaultValue="EMPLOYEE"><Roles /></SelectField><Field label="Temporary password" name="temporaryPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} hint="At least 12 characters. Share it through a verified company channel." /></FieldGrid></FormSection>
          <FormSection title="Employee profile" description="Required for the Employee role."><CheckboxField name="createEmployee" defaultChecked label="Create a linked employee profile" /><FieldGrid><Field label="Employee ID" name="employeeNumber" maxLength={32} /><Field label="Legal name" name="legalName" maxLength={150} /><Field label="Employment start date" name="startDate" type="date" /><Field label="Department" name="departmentLabel" maxLength={100} /><Field label="Position" name="positionLabel" maxLength={100} /></FieldGrid></FormSection>
        </div></ActionForm></Dialog>} />
    {!accounts.length ? <EmptyState icon={ShieldCheck} title="No accounts" /> :
    <TableContainer label="User accounts"><table className="data-table min-w-[860px]"><thead><tr><th>Person</th><th>Role</th><th>Access</th><th>Grants</th><th>Password</th><th className="text-right">Actions</th></tr></thead><tbody>{accounts.map(account => { const name = account.employee?.legalName ?? account.displayName ?? "Staff account"; return <tr key={account.id}>
      <td><div className="flex items-center gap-3"><Avatar name={name} size={32} /><Cell2 primary={name} secondary={account.email} /></div></td>
      <td>{roleName(account.role)}</td>
      <td><StatusBadge status={!account.isActive ? "INACTIVE" : account.accountStatus} label={!account.isActive && account.accountStatus === "ACTIVE" ? "Inactive" : undefined} /></td>
      <td className="text-[13px] text-muted-foreground">{[account.canManageCommissions && "Commission management", account.employee?.preorderCommissionEnabled && "Pre-order commission"].filter(Boolean).join(" · ") || "—"}</td>
      <td>{account.mustChangePassword ? <StatusBadge status="PENDING" label="Change required" /> : <span className="text-[13px] text-muted-foreground">Set</span>}</td>
      <td><div className="flex justify-end gap-1">
        <Dialog triggerSize="sm" variant="outline" trigger="Manage access" triggerLabel={`Manage access for ${name}`} title={`Access · ${name}`} description="Role and grant changes take effect immediately and revoke existing sessions." size="sm"><ActionForm action={securityAction} submitLabel="Save access" confirmation={{ title: "Update account access?", description: "This changes what the person can see and do, and signs them out of existing sessions.", label: "Confirm change" }}><input type="hidden" name="userId" value={account.id} /><SelectField label="Role" name="role" defaultValue={account.role}><Roles /></SelectField><CheckboxField name="isActive" defaultChecked={account.isActive} label="Account active" description="Inactive accounts cannot sign in. For employees, prefer the account status controls on their profile." /><CheckboxField name="canManageCommissions" defaultChecked={account.canManageCommissions} label="Commission management (HR)" description="Allows an HR / Manager to manage pre-order commissions and grant access." />{account.employee && <CheckboxField name="preorderCommissionEnabled" defaultChecked={account.employee.preorderCommissionEnabled} label="Employee pre-order commission access" />}</ActionForm></Dialog>
        <Dialog triggerSize="sm" variant="ghost" trigger="Reset password" triggerLabel={`Reset password for ${name}`} title={`Reset password · ${name}`} description="Revokes all sessions and requires a password change at next sign-in." size="sm"><ActionForm action={resetPasswordAction} resetOnSuccess submitLabel="Reset password" confirmation={{ title: "Reset this password?", description: "The person is signed out everywhere. Share the temporary password through a verified company channel.", label: "Reset password", destructive: true }}><input type="hidden" name="userId" value={account.id} /><Field label="New temporary password" name="temporaryPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} hint="At least 12 characters; expires in 24 hours." /></ActionForm></Dialog>
      </div></td></tr>; })}</tbody></table></TableContainer>}
  </>;
}
