import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { Button, buttonVariants } from "./button";
import { cn } from "@/lib/utils/cn";
/** GET filter form: filters live in the URL so results are shareable, paginated and refresh-safe. */
export function FilterBar({ children, resetHref, className, hidden, columns = 4 }: { children: React.ReactNode; resetHref?: string; className?: string; hidden?: Record<string, string | undefined>; columns?: 3 | 4 | 5 }) {
  return <form method="get" role="search" aria-label="Filters" className={cn("grid items-end gap-3 rounded-xl border bg-surface p-4 shadow-card sm:grid-cols-2", columns === 3 ? "lg:grid-cols-3" : columns === 4 ? "lg:grid-cols-4" : "lg:grid-cols-5", className)}>
    {Object.entries(hidden ?? {}).map(([key, value]) => value ? <input key={key} type="hidden" name={key} value={value} /> : null)}
    {children}
    <div className="flex flex-wrap items-end gap-2 sm:col-span-full lg:col-span-1 lg:col-start-auto lg:justify-start"><Button type="submit"><SlidersHorizontal size={15} aria-hidden="true" />Apply</Button>{resetHref && <Link href={resetHref} className={cn(buttonVariants({ variant: "ghost" }))}>Reset</Link>}</div>
  </form>;
}
