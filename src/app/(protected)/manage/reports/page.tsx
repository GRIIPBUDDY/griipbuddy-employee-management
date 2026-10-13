import Link from "next/link";
import { BarChart3, ChevronRight } from "lucide-react";
import { assertRole } from "@/lib/authorization/policy";
import { pageResult } from "@/lib/auth/page-result";
import { pageActor } from "@/lib/auth/request";
import { reportKinds } from "@/features/insights/validation";
import { reportNames, reportDescriptions } from "@/components/insights/common";
import { PageHeader } from "@/components/ui/page-header";
export default async function Page() {
  const actor = await pageActor(); await pageResult(Promise.resolve().then(() => assertRole(actor, ["ADMIN", "HR_MANAGER"])));
  return <><PageHeader title="Reports" description="Filtered operational reports from official records, with CSV export. Dates are inclusive and use the organization timezone." />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{reportKinds.filter(k => k !== "commissions" || actor.role === "ADMIN" || actor.canManageCommissions).map(k => <Link key={k} href={`/manage/reports/${k}`} className="group flex items-start gap-4 rounded-xl border bg-surface p-5 shadow-card transition-colors hover:border-[#c3cbf5]"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"><BarChart3 size={18} aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="block font-semibold">{reportNames[k]}</span><span className="mt-1 block text-sm text-muted-foreground">{reportDescriptions[k]}</span></span><ChevronRight size={16} aria-hidden="true" className="mt-1 text-slate-400 group-hover:text-primary" /></Link>)}</div></>;
}
