import { cn } from "@/lib/utils/cn";
export function Skeleton({ className }: { className?: string }) { return <div aria-hidden="true" className={cn("animate-pulse rounded-lg bg-muted", className)} />; }
/** Page-level loading placeholder announced to assistive technology. */
export function PageSkeleton({ label, rows = 4 }: { label: string; rows?: number }) {
  return <div role="status" aria-live="polite" className="space-y-6"><span className="sr-only">{label}</span><div className="space-y-2"><Skeleton className="h-8 w-64" /><Skeleton className="h-4 w-96 max-w-full" /></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}</div><div className="space-y-2 rounded-xl border bg-surface p-4">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-10" />)}</div></div>;
}
