import { cn } from "@/lib/utils/cn";
export type DescriptionItem = [label: string, value: React.ReactNode];
export function DescriptionList({ items, columns = 2, className }: { items: DescriptionItem[]; columns?: 1 | 2 | 3; className?: string }) {
  return <dl className={cn("grid gap-x-8 gap-y-4", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-2 lg:grid-cols-3", className)}>{items.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-foreground">{value === null || value === undefined || value === "" ? <span className="font-normal text-slate-400">—</span> : value}</dd></div>)}</dl>;
}
export function Avatar({ name, src, size = 40, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("");
  // Private document URL is same-origin and access-checked; next/image optimization is not used for private files.
  return src ? <img src={src} alt="" width={size} height={size} style={{ width: size, height: size }} className={cn("shrink-0 rounded-full object-cover ring-1 ring-border", className)} /> : <span aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.36 }} className={cn("grid shrink-0 place-items-center rounded-full bg-primary-soft font-semibold text-primary", className)}>{initials || "?"}</span>;
}
