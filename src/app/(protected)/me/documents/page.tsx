import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { ownProfile } from "@/features/people/data";
import { listDocuments } from "@/features/people/documents";
import { Documents } from "@/components/people/documents";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
export default async function MyDocuments() {
  const identity = await getIdentity(), profile = await pageResult(ownProfile(identity));
  const documents = profile ? await pageResult(listDocuments(identity, profile.id, true)) : [];
  return <><PageHeader title="My documents" description="Private documents HR has released to you. Downloads are logged and access-checked." />{profile ? <Documents documents={documents} employeeId={profile.id} staff={false} /> : <EmptyState title="No employee profile" />}</>;
}
