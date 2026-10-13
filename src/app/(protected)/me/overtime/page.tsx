import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { securityBoundary } from "@/lib/authorization/actor";
import { organizationSummary } from "@/features/settings/service";
import { overtimeData } from "@/features/review/overtime";
import { WeeklyOvertime } from "@/components/review/overtime";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { addDays, localDate } from "@/features/time/dates";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const identity = await getIdentity(), actor = await pageResult(securityBoundary(identity, async a => a)), settings = await pageResult(organizationSummary(identity)), q = await searchParams;
  const week = typeof q.week === "string" ? q.week : localDate(new Date(), settings.timezone);
  const data = actor.employeeId ? await pageResult(overtimeData(identity, actor.employeeId, week, true)) : null, nav = buttonVariants({ variant: "outline", size: "sm" });
  return <><PageHeader title="My overtime" description="Potential overtime is reviewed by HR after each week ends. Only approved overtime is paid; working past the scheduled end does not by itself create payable overtime."
    actions={data && <><Link className={nav} href={`?week=${addDays(data.current.week, -7)}`}><ChevronLeft size={15} aria-hidden="true" />Previous week</Link><Link className={nav} href="/me/overtime">This week</Link><Link className={nav} href={`?week=${addDays(data.current.week, 7)}`}>Next week<ChevronRight size={15} aria-hidden="true" /></Link></>} />
    {data ? <WeeklyOvertime data={data} own /> : <EmptyState title="No employee profile" />}</>;
}
