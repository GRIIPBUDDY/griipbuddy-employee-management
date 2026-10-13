import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
export type Crumb = { label: string; href?: string };
export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}><ol className="flex min-w-0 flex-wrap items-center gap-1 text-[13px] text-muted-foreground">{items.map((item, index) => <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">{index > 0 && <ChevronRight aria-hidden="true" size={14} className="shrink-0 text-slate-400" />}{item.href && index < items.length - 1 ? <Link href={item.href} className="truncate hover:text-foreground">{item.label}</Link> : <span aria-current={index === items.length - 1 ? "page" : undefined} className="truncate font-medium text-foreground">{item.label}</span>}</li>)}</ol></nav>;
}
/** Every page starts with one PageHeader: breadcrumbs, a single h1, optional description, meta and actions. */
export function PageHeader({ title, description, breadcrumbs, actions, meta, leading }: { title: React.ReactNode; description?: React.ReactNode; breadcrumbs?: Crumb[]; actions?: React.ReactNode; meta?: React.ReactNode; leading?: React.ReactNode }) {
  return <div className="space-y-3">{breadcrumbs && breadcrumbs.length > 1 && <Breadcrumbs items={breadcrumbs} />}<div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4"><div className="flex min-w-0 items-center gap-4">{leading}<div className="min-w-0"><h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-[1.65rem]">{title}</h1>{description && <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>}{meta && <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{meta}</div>}</div></div>{actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}</div></div>;
}
export function SectionHeading({ title, description, actions, className }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}><div><h2 className="text-base font-semibold">{title}</h2>{description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}</div>{actions && <div className="flex flex-wrap gap-2">{actions}</div>}</div>;
}
