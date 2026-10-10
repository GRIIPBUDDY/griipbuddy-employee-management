import { ManagementPicker } from "@/components/people/management-picker";
export default async function Documents({ searchParams }: { searchParams: Promise<{ search?: string }> }) {
  return <><h1 className="text-3xl font-semibold">Employee documents</h1><ManagementPicker section="documents" search={(await searchParams).search ?? ""} /></>;
}
