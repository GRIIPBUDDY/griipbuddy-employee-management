import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
export function Placeholder({ title }: { title: string }) {
  return <><PageHeader title={title} /><EmptyState title="Nothing here yet" description="This area has no records or workflows. Use the navigation to open an available section." /></>;
}
