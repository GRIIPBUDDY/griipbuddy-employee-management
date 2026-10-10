import { pageActor, getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { assertRole } from "@/lib/authorization/policy";
import { profileChoices } from "@/features/people/service";
import { createEmployeeAction } from "@/features/people/actions";
import { PersonalFields, EmploymentFields } from "@/components/people/profile-fields";
import { Field, SelectField } from "@/components/ui/field";
import { ActionForm } from "@/components/ui/action-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
export default async function NewEmployee() {
  const actor = await pageActor(); await pageResult(Promise.resolve().then(() => assertRole(actor, ["ADMIN", "HR_MANAGER"])));
  const choices = await pageResult(profileChoices(await getIdentity()));
  return <><h1 className="text-3xl font-semibold tracking-tight">Create employee</h1><Card><CardHeader><CardTitle>Employee profile and employment</CardTitle><CardDescription>Every employee needs a linked account. HR can link an account provisioned by an administrator; only Admin can create a new login.</CardDescription></CardHeader><CardContent><ActionForm action={createEmployeeAction} submitLabel="Create employee"><PersonalFields /><h2 className="font-semibold">Employment information</h2><p className="text-sm text-muted-foreground">Create departments and positions in their management pages before assigning an employee.</p><EmploymentFields managers={choices.managers} departments={choices.departments} positions={choices.positions} /><h2 className="font-semibold">Linked account</h2><SelectField label="Existing account without a profile" name="userId" defaultValue=""><option value="">{actor.role === "ADMIN" ? "Create a new employee login below" : "Choose a provisioned account"}</option>{choices.users.map(user => <option key={user.id} value={user.id}>{user.email}</option>)}</SelectField>
    {actor.role === "ADMIN" && <div className="grid gap-4 sm:grid-cols-2"><Field label="New login email (when no existing account chosen)" name="email" type="email" maxLength={254} /><Field label="Temporary password (new account only)" name="temporaryPassword" type="password" minLength={12} maxLength={128} autoComplete="new-password" /></div>}
  </ActionForm></CardContent></Card></>;
}
