import { cn } from "@/lib/utils/cn";
/** Owns horizontal overflow so wide tables never widen the page. Use with `<table className="data-table">`. */
export function TableContainer({ children, label, className, flush = false }: { children: React.ReactNode; label: string; className?: string; flush?: boolean }) {
  return <div role="region" aria-label={label} tabIndex={0} className={cn("relative max-w-full overflow-x-auto focus-visible:outline-offset-[-2px]", !flush && "rounded-xl border bg-surface shadow-card", className)}>{children}</div>;
}
export function Cell2({ primary, secondary }: { primary: React.ReactNode; secondary?: React.ReactNode }) {
  return <div className="min-w-0"><div className="font-medium text-foreground">{primary}</div>{secondary && <div className="mt-0.5 text-xs text-muted-foreground">{secondary}</div>}</div>;
}
