import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { ownProfile } from "@/features/people/data";
import { ProfileDetails } from "@/components/profile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmployeeWorkspace } from "@/components/people/workspace";
import { ContactFields } from "@/components/people/profile-fields";
import { ActionForm } from "@/components/ui/action-form";
import { ownContactAction } from "@/features/people/actions";
export default async function MyProfile() {
  const identity = await getIdentity(), profile = await pageResult(ownProfile(identity));
  return <><div className="flex items-center gap-4">{profile?.photoDocumentId && <img src={`/api/me/documents/${profile.photoDocumentId}?view=1`} alt={`${profile.legalName} profile`} width={64} height={64} className="h-16 w-16 rounded-full object-cover" />}<h1 className="text-3xl font-semibold tracking-tight">My profile</h1></div><Card><CardHeader><CardTitle>Employee details</CardTitle></CardHeader><CardContent>{profile ? <ProfileDetails profile={profile} /> : <p>This staff account has no employee profile.</p>}</CardContent></Card>{profile && <><Card><CardHeader><CardTitle>Update your contact information</CardTitle></CardHeader><CardContent><ActionForm action={ownContactAction} submitLabel="Save contact information"><ContactFields profile={profile} /></ActionForm></CardContent></Card><EmployeeWorkspace identity={identity} employeeId={profile.id} staff={false} /></>}</>;
}
