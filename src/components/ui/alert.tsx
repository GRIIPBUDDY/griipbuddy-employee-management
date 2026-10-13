import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils/cn";
const styles = { info: ["bg-info-soft text-[#194185] border-[#b2ddff]", Info], warning: ["bg-warning-soft text-[#7a2e0e] border-[#fedf89]", AlertTriangle], danger: ["bg-danger-soft text-[#7a271a] border-[#fecdca]", AlertCircle], success: ["bg-success-soft text-[#054f31] border-[#abefc6]", CheckCircle2], neutral: ["bg-subtle text-foreground border-border", Info] } as const;
export function Alert({ tone = "info", title, children, className, role }: { tone?: keyof typeof styles; title?: string; children?: React.ReactNode; className?: string; role?: "alert" | "status" }) {
  const [style, Icon] = styles[tone];
  return <div role={role} className={cn("flex items-start gap-3 rounded-lg border px-4 py-3 text-sm leading-6", style, className)}><Icon aria-hidden="true" size={17} className="mt-[3px] shrink-0" /><div className="min-w-0">{title && <p className="font-semibold">{title}</p>}{children && <div className={cn(title && "mt-0.5")}>{children}</div>}</div></div>;
}
