import { ManagementPicker } from "@/components/people/management-picker";
import { PageHeader } from "@/components/ui/page-header";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  return <><PageHeader title="Schedules" description="Recurring weekly work assignments. Choose an employee to view their week, publish a schedule or change future dates." /><ManagementPicker section="schedule" search={typeof q.search === "string" ? q.search : ""} page={typeof q.page === "string" ? q.page : undefined} path="/manage/schedule" /></>;
}
