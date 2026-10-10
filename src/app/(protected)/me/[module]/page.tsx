import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { placeholderTitle } from "@/features/people/placeholders";
import { Placeholder } from "@/components/placeholder";
export default async function Module({ params }: { params: Promise<{ module: string }> }) {
  const title = await pageResult(placeholderTitle(await getIdentity(), (await params).module, false));
  return <Placeholder title={title} />;
}
