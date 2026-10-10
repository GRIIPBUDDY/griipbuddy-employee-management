import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { employeeProfile } from "@/features/people/data";
import { profileChoices } from "@/features/people/service";
import { editEmployeeAction, employmentAction, deactivateAction } from "@/features/people/actions";
import { PersonalFields, EmploymentFields } from "@/components/people/profile-fields";
import { Field } from "@/components/ui/field";
import { ActionForm } from "@/components/ui/action-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
export default async function EditEmployee({ params }: { params: Promise<{ id: string }> }) {
  const identity = await getIdentity(), choices = await pageResult(profileChoices(identity));
  const profile = await pageResult(employeeProfile(identity, (await params).id));
  return <><h1 className="text-3xl font-semibold tracking-tight">Edit {profile.legalName}</h1><Card><CardHeader><CardTitle>Personal information</CardTitle></CardHeader><CardContent><ActionForm action={editEmployeeAction} submitLabel="Save profile"><input type="hidden" name="employeeId" value={profile.id} /><input type="hidden" name="expectedUpdatedAt" value={profile.updatedAt.toISOString()} /><PersonalFields profile={profile} /></ActionForm></CardContent></Card>
    {profile.employmentPeriods.map(period => <Card key={period.id}><CardHeader><CardTitle>Employment — {period.startDate.toISOString().slice(0, 10)}</CardTitle><CardDescription>Changes are audited and revoke existing sessions.</CardDescription></CardHeader><CardContent><ActionForm action={employmentAction} submitLabel="Save employment"><input type="hidden" name="employeeId" value={profile.id} /><input type="hidden" name="periodId" value={period.id} /><input type="hidden" name="revision" value={period.revision} /><EmploymentFields period={period} managers={choices.managers} departments={choices.departments} positions={choices.positions} employeeId={profile.id} /><Field label="Change reason" name="reason" required maxLength={500} /></ActionForm></CardContent></Card>)}
    {profile.user.isActive && <Card><CardHeader><CardTitle>Deactivate employee</CardTitle><CardDescription>Revokes account access immediately and ends employment. Historical records and files are retained. HR cannot deactivate staff accounts.</CardDescription></CardHeader><CardContent><ActionForm action={deactivateAction} submitLabel="Deactivate employee"><input type="hidden" name="employeeId" value={profile.id} /><Field label="Deactivation reason" name="reason" required maxLength={500} /></ActionForm></CardContent></Card>}
  </>;
}
