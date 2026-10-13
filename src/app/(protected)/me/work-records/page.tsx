import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { ownProfile } from "@/features/people/data";
import { ownTimeline } from "@/features/people/timeline";
import { Timeline } from "@/components/people/records";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
export default async function MyRecords() {
  const identity = await getIdentity(), profile = await pageResult(ownProfile(identity)), records = await pageResult(ownTimeline(identity));
  return <><PageHeader title="Work records" description="Your timeline: achievements, training, schedule changes and other released events." />{profile ? <Timeline records={records} employeeId={profile.id} staff={false} /> : <EmptyState title="No employee profile" />}</>;
}
