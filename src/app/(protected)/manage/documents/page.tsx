import { ManagementPicker } from "@/components/people/management-picker";
import { PageHeader } from "@/components/ui/page-header";
export default async function Documents({ searchParams }: { searchParams: Promise<{ search?: string; page?: string }> }) {
  const q = await searchParams;
  return <><PageHeader title="Employee documents" description="Private contracts, identification and other files. Choose an employee to upload, release or remove documents." /><ManagementPicker section="documents" search={q.search ?? ""} page={q.page} path="/manage/documents" /></>;
}
