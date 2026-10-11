import { cn } from "@/lib/utils/cn";
const positive = new Set(["APPROVED", "ACTIVE", "COMPLETED", "FINALIZED", "PAID", "READY"]);
const warning = new Set(["PENDING", "STALE", "INCOMPLETE", "UNREVIEWED", "OVERDUE"]);
const negative = new Set(["REJECTED", "VOIDED", "SUSPENDED"]);
export function StatusBadge({status, className}: {status: string; className?: string}) {
  return <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset", positive.has(status)?"bg-emerald-50 text-emerald-800 ring-emerald-200":warning.has(status)?"bg-amber-50 text-amber-900 ring-amber-200":negative.has(status)?"bg-rose-50 text-rose-800 ring-rose-200":"bg-slate-100 text-slate-700 ring-slate-200",className)}><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current"/>{status.replaceAll("_"," ").toLowerCase().replace(/^./,c=>c.toUpperCase())}</span>;
}
