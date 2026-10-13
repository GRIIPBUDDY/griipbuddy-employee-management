import { EmployeeControls } from "@/components/accounts/employee-controls";
import { getIdentity, pageActor } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { employeeProfile } from "@/features/people/data";
import { ProfileDetails } from "@/components/profile";
import { EmployeeHeader } from "@/components/people/employee-header";
import { DocumentsPanel, TimelinePanel, workspaceData } from "@/components/people/workspace";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
export default async function Employee({ params }: { params: Promise<{ id: string }> }) {
  const identity = await getIdentity(), actor = await pageActor(), staff = actor.role !== "EMPLOYEE";
  // Employees may open only their own ID here (scoped by the service); they get the personal view without staff controls.
  const profile = await pageResult(employeeProfile(identity, (await params).id));
  const { documents, records } = await workspaceData(identity, profile.id, staff);
  if (!staff) return <><PageHeader title={profile.legalName} description="Your employee profile." /><ProfileDetails profile={profile} /><DocumentsPanel documents={documents} employeeId={profile.id} staff={false} /><TimelinePanel records={records} employeeId={profile.id} staff={false} /></>;
  return <>
    <EmployeeHeader employee={profile} />
    <Tabs label="Profile sections" items={[
      { id: "overview", label: "Details", content: <ProfileDetails profile={profile} /> },
      { id: "account", label: "Account & access", content: <EmployeeControls identity={identity} employeeId={profile.id} /> },
      { id: "documents", label: "Documents", count: documents.length, content: <DocumentsPanel documents={documents} employeeId={profile.id} staff /> },
      { id: "timeline", label: "Timeline", count: records.length, content: <TimelinePanel records={records} employeeId={profile.id} staff /> },
    ]} />
  </>;
}
