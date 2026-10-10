import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { ownProfile } from "@/features/people/data";
import { ownTimeline } from "@/features/people/timeline";
import { Timeline } from "@/components/people/records";
export default async function MyRecords() {
  const identity = await getIdentity(), profile = await pageResult(ownProfile(identity));
  const records = await pageResult(ownTimeline(identity));
  return <><h1 className="text-3xl font-semibold">My work records</h1>{profile ? <Timeline records={records} employeeId={profile.id} staff={false} /> : <p>No linked employee profile.</p>}</>;
}
