import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { employeeProfile } from "@/features/people/data";
import { profileChoices } from "@/features/people/service";
import { editEmployeeAction, employmentAction, deactivateAction } from "@/features/people/actions";
import { PersonalFields, EmploymentFields, ContactFields } from "@/components/people/profile-fields";
import { EmployeeHeader } from "@/components/people/employee-header";
import { Field, FormSection } from "@/components/ui/field";
import { ActionForm } from "@/components/ui/action-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
export default async function EditEmployee({ params }: { params: Promise<{ id: string }> }) {
  const identity = await getIdentity(), choices = await pageResult(profileChoices(identity));
  const profile = await pageResult(employeeProfile(identity, (await params).id));
  return <>
    <EmployeeHeader employee={profile} title="Edit" actions={<></>} />
    <Card><CardHeader><CardTitle>Profile</CardTitle><CardDescription>Personal and contact details. Changes are audited.</CardDescription></CardHeader><CardContent><ActionForm action={editEmployeeAction} submitLabel="Save profile"><input type="hidden" name="employeeId" value={profile.id} /><input type="hidden" name="expectedUpdatedAt" value={profile.updatedAt.toISOString()} />
      <div className="space-y-6"><FormSection title="Personal information" description="Legal identity used on official records."><PersonalFields profile={profile} /></FormSection><FormSection title="Contact & emergency" description="Used by HR to reach the employee."><ContactFields profile={profile} /></FormSection></div></ActionForm></CardContent></Card>
    {profile.employmentPeriods.map(period => <Card key={period.id}><CardHeader><CardTitle>Employment from {period.startDate.toISOString().slice(0, 10)}</CardTitle><CardDescription>Department, position and contract terms. Saving revokes the employee’s existing sessions so access reflects the change.</CardDescription></CardHeader><CardContent><ActionForm action={employmentAction} submitLabel="Save employment"><input type="hidden" name="employeeId" value={profile.id} /><input type="hidden" name="periodId" value={period.id} /><input type="hidden" name="revision" value={period.revision} /><EmploymentFields period={period} managers={choices.managers} departments={choices.departments} positions={choices.positions} employeeId={profile.id} /><Field label="Reason for the change" name="reason" required maxLength={500} /></ActionForm></CardContent></Card>)}
    {profile.user.isActive && <Card className="border-[#fecdca]"><CardHeader><CardTitle>Deactivate employee</CardTitle><CardDescription>Ends employment and revokes account access immediately. Historical records, documents and payroll remain intact. HR cannot deactivate staff accounts.</CardDescription></CardHeader><CardContent><ActionForm action={deactivateAction} submitLabel="Deactivate employee" confirmation={{ title: `Deactivate ${profile.legalName}?`, description: "Their access ends immediately and future schedules are cancelled. All history is preserved. Reactivation requires an administrator.", label: "Deactivate", destructive: true }}><input type="hidden" name="employeeId" value={profile.id} /><Alert tone="warning">Use account status “On hold” or “Suspended” for temporary restrictions instead.</Alert><Field label="Deactivation reason" name="reason" required maxLength={500} /></ActionForm></CardContent></Card>}
  </>;
}
