import { ManagementPicker } from "@/components/people/management-picker";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = (await searchParams).search;
  return <><h1 className="text-3xl font-semibold tracking-tight">Schedule management</h1><ManagementPicker section="schedule" search={typeof search === "string" ? search : ""} /></>;
}
