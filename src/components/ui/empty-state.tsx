import { Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
export function EmptyState({ title, description, children, icon: Icon = Inbox, className }: { title: string; description?: string; children?: React.ReactNode; icon?: LucideIcon; className?: string }) {
  return <div className={cn("flex flex-col items-center rounded-xl border border-dashed bg-subtle px-6 py-10 text-center", className)}><span className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-surface text-muted-foreground shadow-xs ring-1 ring-border"><Icon aria-hidden="true" size={18} /></span><p className="text-sm font-semibold">{title}</p>{description && <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>}{children && <div className="mt-4">{children}</div>}</div>;
}
