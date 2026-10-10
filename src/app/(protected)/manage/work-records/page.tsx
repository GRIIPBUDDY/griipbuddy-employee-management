import { ManagementPicker } from "@/components/people/management-picker";
export default async function WorkRecords({ searchParams }: { searchParams: Promise<{ search?: string }> }) {
  return <><h1 className="text-3xl font-semibold">Employee work records</h1><ManagementPicker section="timeline" search={(await searchParams).search ?? ""} /></>;
}
