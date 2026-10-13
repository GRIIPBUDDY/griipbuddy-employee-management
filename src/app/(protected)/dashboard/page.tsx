import Link from "next/link";
import { UserPlus, ClipboardPlus } from "lucide-react";
import { DashboardOverview } from "@/components/insights/dashboard-overview";
import { PersonalDashboard } from "@/components/insights/personal-dashboard";
import { pageActor, getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { managementDashboard, personalDashboard } from "@/features/insights/dashboard";
import { PageHeader, SectionHeading } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { rangeLabel } from "@/lib/utils/date-range";
import { localDate } from "@/features/time/dates";
function greeting(timezone: string) { const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: timezone }).format(new Date())); return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"; }
export default async function Dashboard() {
  const actor = await pageActor(), identity = await getIdentity();
  const management = actor.role !== "EMPLOYEE" ? await pageResult(managementDashboard(identity)) : null;
  const personal = actor.employeeId ? await pageResult(personalDashboard(identity)) : null;
  const timezone = management?.timezone ?? personal?.schedule?.timezone ?? "Asia/Dhaka", today = management?.today ?? personal?.schedule?.today ?? localDate(new Date(), timezone);
  return <>
    <PageHeader title={`${greeting(timezone)}, ${actor.name.split(" ")[0]}`} description={management ? "Today’s workforce at a glance and the approvals waiting for you." : "Your schedule, hours, tasks and pay in one place."} meta={<span>{rangeLabel(today, today)} · {timezone}</span>}
      actions={management && <><Button asChild variant="outline"><Link href="/manage/tasks"><ClipboardPlus size={16} aria-hidden="true" />Assign task</Link></Button><Button asChild><Link href="/manage/employees/new"><UserPlus size={16} aria-hidden="true" />Add employee</Link></Button></>} />
    {management && <DashboardOverview data={management} />}
    {personal && <>{management && <SectionHeading className="pt-2" title="My workspace" description="Your own schedule and records as an employee." />}<PersonalDashboard data={personal} /></>}
    {!management && !personal && <EmptyState title="No employee profile linked" description="This account is not linked to an employee profile. Contact an administrator." />}
  </>;
}
