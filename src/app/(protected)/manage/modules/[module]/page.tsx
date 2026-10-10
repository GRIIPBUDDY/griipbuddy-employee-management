import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { placeholderTitle } from "@/features/people/placeholders";
import { Placeholder } from "@/components/placeholder";
import { redirect } from "next/navigation";
export default async function Module({ params }: { params: Promise<{ module: string }> }) {
  const module = (await params).module;
  const title = await pageResult(placeholderTitle(await getIdentity(), module, true));
  if (["documents", "work-records", "schedule", "attendance", "performance", "assets"].includes(module)) redirect(`/manage/${module}`);
  return <Placeholder title={title} />;
}
