import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { listAccounts } from "@/features/accounts/service";
import { createAccountAction, securityAction, resetPasswordAction } from "@/features/accounts/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field, SelectField } from "@/components/ui/field";
import { ActionForm } from "@/components/ui/action-form";
function Roles() { return <><option value="EMPLOYEE">Employee</option><option value="HR_MANAGER">HR / Manager</option><option value="ADMIN">Administrator</option></>; }
export default async function Accounts() {
  const accounts = await pageResult(listAccounts(await getIdentity()));
  return <><div><h1 className="text-3xl font-semibold tracking-tight">User accounts</h1><p className="mt-2 text-muted-foreground">Provision accounts and manage access.</p></div>
    <Card><CardHeader><CardTitle>Create account</CardTitle><CardDescription>Temporary passwords expire after 24 hours. Employees must have a linked profile.</CardDescription></CardHeader><CardContent>
      <ActionForm action={createAccountAction} submitLabel="Create account" resetOnSuccess><div className="grid gap-4 sm:grid-cols-2">
        <Field label="Work email" name="email" type="email" required maxLength={254} /><Field label="Staff display name" name="displayName" required maxLength={100} />
        <SelectField label="Role" name="role" defaultValue="EMPLOYEE"><Roles /></SelectField><Field label="Temporary password" name="temporaryPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
      </div><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="createEmployee" defaultChecked />Create a linked employee profile</label>
      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"><Field label="Employee number" name="employeeNumber" maxLength={32} /><Field label="Legal name" name="legalName" maxLength={150} /><Field label="Employment start date" name="startDate" type="date" /><Field label="Department" name="departmentLabel" maxLength={100} /><Field label="Position" name="positionLabel" maxLength={100} /></div>
      </ActionForm>
    </CardContent></Card>
    <div className="space-y-4">{accounts.map(account => <Card key={account.id}><CardHeader><CardTitle>{account.employee?.legalName ?? account.displayName ?? "Staff account"}</CardTitle><CardDescription>{account.email} · {account.mustChangePassword ? "Password change required" : "Password configured"}</CardDescription></CardHeader><CardContent><div className="grid gap-8 xl:grid-cols-2">
      <ActionForm action={securityAction} submitLabel="Save access" confirmation={{title:"Update account access?",description:"Changes to role or active status affect this person’s access and revoke existing sessions. Confirm these settings before saving.",label:"Confirm access change"}}><input type="hidden" name="userId" value={account.id} /><SelectField label="Role" name="role" defaultValue={account.role}><Roles /></SelectField>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={account.isActive} />Active account</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="canManageCommissions" defaultChecked={account.canManageCommissions} />HR commission management grant</label>
        {account.employee && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="preorderCommissionEnabled" defaultChecked={account.employee.preorderCommissionEnabled} />Employee pre-order commission access</label>}
      </ActionForm>
      <ActionForm action={resetPasswordAction} submitLabel="Reset temporary password" confirmation={{title:"Reset this password?",description:"This revokes existing sessions and requires a password change at next login. Share the temporary password through your verified company channel.",label:"Reset password",destructive:true}} resetOnSuccess><input type="hidden" name="userId" value={account.id} /><Field label="New temporary password" name="temporaryPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /><p className="text-sm text-muted-foreground">Distribute through an existing verified company channel. Resetting revokes all sessions.</p></ActionForm>
    </div></CardContent></Card>)}</div>
  </>;
}
