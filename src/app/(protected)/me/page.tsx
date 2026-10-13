import { Pencil } from "lucide-react";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { ownProfile } from "@/features/people/data";
import { ProfileDetails } from "@/components/profile";
import { ContactFields } from "@/components/people/profile-fields";
import { ActionForm } from "@/components/ui/action-form";
import { ownContactAction } from "@/features/people/actions";
import { PageHeader } from "@/components/ui/page-header";
import { Dialog } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/description-list";
import { EmptyState } from "@/components/ui/empty-state";
export default async function MyProfile() {
  const identity = await getIdentity(), profile = await pageResult(ownProfile(identity));
  if (!profile) return <><PageHeader title="My profile" /><EmptyState title="No employee profile" description="This staff account is not linked to an employee profile." /></>;
  return <>
    <PageHeader leading={<Avatar name={profile.legalName} src={profile.photoDocumentId ? `/api/me/documents/${profile.photoDocumentId}?view=1` : null} size={52} />} title={profile.preferredName ?? profile.legalName} description={`${profile.employeeNumber} · ${profile.employmentPeriods[0]?.position?.name ?? profile.employmentPeriods[0]?.positionLabel ?? ""}`}
      actions={<Dialog variant="outline" trigger={<><Pencil size={15} aria-hidden="true" />Update contact details</>} title="Update contact details" description="You can update your phone, address and emergency contact. HR maintains everything else."><ActionForm action={ownContactAction} submitLabel="Save contact details"><ContactFields profile={profile} /></ActionForm></Dialog>} />
    <ProfileDetails profile={profile} />
  </>;
}
