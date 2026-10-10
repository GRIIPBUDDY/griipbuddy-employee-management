import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { ownProfile } from "@/features/people/data";
import { listDocuments } from "@/features/people/documents";
import { Documents } from "@/components/people/documents";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
export default async function MyDocuments() {
  const identity = await getIdentity(), profile = await pageResult(ownProfile(identity));
  const documents = profile ? await pageResult(listDocuments(identity, profile.id, true)) : [];
  return <><h1 className="text-3xl font-semibold">My documents</h1><Card><CardHeader><CardTitle>Released private documents</CardTitle></CardHeader><CardContent>{profile ? <Documents documents={documents} employeeId={profile.id} staff={false} /> : <p>No linked employee profile.</p>}</CardContent></Card></>;
}
