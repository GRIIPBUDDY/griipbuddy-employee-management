import { ManagementPicker } from "@/components/people/management-picker";
import { PageHeader } from "@/components/ui/page-header";
export default async function WorkRecords({ searchParams }: { searchParams: Promise<{ search?: string; page?: string }> }) {
  const q = await searchParams;
  return <><PageHeader title="Work records" description="Achievements, training, onboarding notes and other timeline events. Choose an employee to view or add records." /><ManagementPicker section="timeline" search={q.search ?? ""} page={q.page} path="/manage/work-records" /></>;
}
