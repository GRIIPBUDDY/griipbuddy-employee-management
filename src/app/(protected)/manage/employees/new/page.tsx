import { pageActor, getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { assertRole } from "@/lib/authorization/policy";
import { profileChoices } from "@/features/people/service";
import { createEmployeeAction } from "@/features/people/actions";
import { PersonalFields, EmploymentFields, ContactFields } from "@/components/people/profile-fields";
import { Field, SelectField, FormSection, FieldGrid } from "@/components/ui/field";
import { ActionForm } from "@/components/ui/action-form";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
export default async function NewEmployee() {
  const actor = await pageActor(); await pageResult(Promise.resolve().then(() => assertRole(actor, ["ADMIN", "HR_MANAGER"])));
  const choices = await pageResult(profileChoices(await getIdentity()));
  return <>
    <PageHeader breadcrumbs={[{ label: "Employees", href: "/manage/employees" }, { label: "Add employee" }]} title="Add employee" description="Create the employee profile, first employment record and linked login in one step." />
    <Card><CardContent className="pt-6"><ActionForm action={createEmployeeAction} submitLabel="Create employee"><div className="space-y-6">
      <FormSection title="Personal information" description="Legal identity used on official records."><PersonalFields /></FormSection>
      <FormSection title="Contact & emergency"><ContactFields /></FormSection>
      <FormSection title="Employment" description="Departments and positions come from their catalogs."><EmploymentFields managers={choices.managers} departments={choices.departments} positions={choices.positions} />{(!choices.departments.some(d => d.isActive) || !choices.positions.some(p => p.isActive)) && <Alert tone="warning">Create at least one active department and position before adding an employee.</Alert>}</FormSection>
      <FormSection title="Login account" description={actor.role === "ADMIN" ? "Link an existing account without a profile, or create a new employee login." : "HR can link an account provisioned by an administrator."}>
        <SelectField label="Existing account without a profile" name="userId" defaultValue=""><option value="">{actor.role === "ADMIN" ? "Create a new employee login" : "Choose a provisioned account"}</option>{choices.users.map(user => <option key={user.id} value={user.id}>{user.email}</option>)}</SelectField>
        {actor.role === "ADMIN" && <FieldGrid><Field label="New login email" name="email" type="email" maxLength={254} hint="Used when no existing account is chosen." /><Field label="Temporary password" name="temporaryPassword" type="password" minLength={12} maxLength={128} autoComplete="new-password" hint="At least 12 characters. Must be changed at first sign-in (expires in 24 hours)." /></FieldGrid>}
      </FormSection>
    </div></ActionForm></CardContent></Card>
  </>;
}
