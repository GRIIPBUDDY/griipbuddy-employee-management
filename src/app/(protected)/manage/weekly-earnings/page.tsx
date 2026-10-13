import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { weeklyData } from "@/features/pay/weekly";
import { periodData } from "@/features/pay/periods";
import { employeeOptions } from "@/features/people/data";
import { organizationSummary } from "@/features/settings/service";
import { ActionForm } from "@/components/ui/action-form";
import { Field } from "@/components/ui/field";
import { payAction } from "@/features/pay/actions";
import { WeeklyStatements, CalculateWeeklyButton } from "@/components/pay/weekly";
import { PayNav } from "@/components/pay/common";
import { PageHeader } from "@/components/ui/page-header";
import { Dialog } from "@/components/ui/dialog";
export default async function Page() {
  const i = await getIdentity(), [rows, employees, periods, settings] = await Promise.all([pageResult(weeklyData(i)), pageResult(employeeOptions(i)), pageResult(periodData(i)), pageResult(organizationSummary(i))]);
  return <>
    <PageHeader title="Weekly earnings" description={`Weekly statements in ${settings.currency}: basic earnings, approved overtime and approved adjustments. Finalizing a week is not payment.`}
      actions={<><Dialog trigger="Standard hours policy" title="Standard weekly hours" description="Expected standard hours (initially 48). Separate from the overtime threshold. Changes apply from a future workweek." size="sm"><ActionForm action={payAction} submitLabel="Add future policy"><input type="hidden" name="kind" value="standardHours" /><Field name="effectiveFrom" label="From workweek starting" type="date" required /><Field name="hours" label="Standard hours per week" type="number" defaultValue={48} min={1} max={168} required /><Field name="reason" label="Reason" required maxLength={500} /></ActionForm></Dialog><CalculateWeeklyButton employees={employees} /></>} />
    <PayNav />
    <WeeklyStatements rows={rows} employees={employees} periods={periods.records} />
  </>;
}
