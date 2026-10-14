import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
const tones = { neutral: "bg-muted text-[#344054]", primary: "bg-primary-soft text-primary", success: "bg-success-soft text-success", warning: "bg-warning-soft text-warning", danger: "bg-danger-soft text-danger" };
export function StatCard({ label, value, hint, href, icon: Icon, tone = "neutral", className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string; icon?: LucideIcon; tone?: keyof typeof tones; className?: string }) {
  const body = <><div className="flex items-start justify-between gap-3"><p className="text-[13px] font-medium leading-5 text-muted-foreground">{label}</p>{Icon && <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", tones[tone])}><Icon aria-hidden="true" size={16} /></span>}</div><p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>{(hint || href) && <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">{hint}{href && <ArrowUpRight aria-hidden="true" size={13} className="ml-auto text-slate-400 transition-colors group-hover:text-primary" />}</p>}</>;
  const shell = "group block min-w-0 rounded-xl border bg-card p-4 shadow-card";
  return href ? <Link href={href} className={cn(shell, "transition-colors hover:border-primary/40", className)}>{body}</Link> : <div className={cn(shell, className)}>{body}</div>;
}
/** Compact key figure inside a card, e.g. scheduled vs actual time. */
export function Metric({ label, value, hint, className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return <div className={cn("min-w-0 rounded-lg border bg-subtle px-4 py-3", className)}><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>{hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}</div>;
}
