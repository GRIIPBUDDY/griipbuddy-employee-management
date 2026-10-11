import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { weeklyData } from "@/features/pay/weekly";
import { employeeOptions } from "@/features/people/data";
import { ActionForm } from "@/components/ui/action-form";
import { Field } from "@/components/ui/field";
import { payAction } from "@/features/pay/actions";
import { WeeklyStatements } from "@/components/pay/weekly";
export default async function Page(){const i=await getIdentity();return <><h1 className="text-2xl font-semibold">Weekly earnings</h1><WeeklyStatements rows={await pageResult(weeklyData(i))} employees={await pageResult(employeeOptions(i))}/><details className="max-w-xl rounded-lg border bg-white p-5"><summary>Standard weekly target</summary><p>Initial target: 48 hours. This setting is separate from the overtime threshold.</p><ActionForm action={payAction} submitLabel="Append future standard-hours policy"><input type="hidden" name="kind" value="standardHours"/><Field name="effectiveFrom" label="Future workweek start" type="date" required/><Field name="hours" label="Standard hours" type="number" defaultValue={48} min={1} max={168} required/><Field name="reason" label="Policy reason" required/></ActionForm></details></>;}
