import { cn } from "@/lib/utils/cn";
type Tone = "success" | "warning" | "danger" | "info" | "neutral";
const tones: Record<Tone, string[]> = {
  success: ["APPROVED", "ACTIVE", "COMPLETED", "FINALIZED", "PAID", "READY", "INCLUDED", "CONFIRMED", "WORKED", "VALID", "AVAILABLE", "PUBLISHED", "FINAL"],
  warning: ["PENDING", "STALE", "INCOMPLETE", "UNREVIEWED", "OVERDUE", "ON_HOLD", "UNPAID", "AWAITING_PARTNER", "LATE", "EARLY", "APPROACHING", "PENDING_CORRECTION", "DRAFT_PENDING", "HIGH"],
  danger: ["REJECTED", "VOIDED", "SUSPENDED", "ABSENT", "MISSING", "EXPIRED", "LOST", "REVOKED", "DECLINED"],
  info: ["IN_PROGRESS", "CALCULATED", "REVIEWED", "ACCEPTED", "UPCOMING", "UNREAD", "CURRENTLY_WORKING", "SCHEDULED", "CORRECTED", "ASSIGNED", "ESTIMATE"],
  neutral: [],
};
const toneClass: Record<Tone, string> = {
  success: "bg-success-soft text-success ring-[#abefc6]", warning: "bg-warning-soft text-warning ring-[#fedf89]", danger: "bg-danger-soft text-danger ring-[#fecdca]",
  info: "bg-info-soft text-info ring-[#b2ddff]", neutral: "bg-muted text-[#344054] ring-border",
};
export function toneFor(status: string): Tone { return (Object.keys(tones) as Tone[]).find(t => tones[t].includes(status)) ?? "neutral"; }
export const statusText = (status: string) => ({ REVIEWED: "Under review", NOT_REQUIRED: "Not required", AWAITING_PARTNER: "Awaiting partner", ON_HOLD: "On hold", PENDING_CORRECTION: "Correction pending", NO_SCHEDULE: "No schedule", IN_PROGRESS: "In progress" } as Record<string, string>)[status]
  ?? status.replaceAll("_", " ").toLowerCase().replace(/^./, c => c.toUpperCase());
export function StatusBadge({ status, label, tone, className }: { status: string; label?: string; tone?: Tone; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", toneClass[tone ?? toneFor(status)], className)}><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />{label ?? statusText(status)}</span>;
}
