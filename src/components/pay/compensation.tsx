import { formatMoney } from "@/features/pay/currency";
import type { rateHistory } from "@/features/pay/rates";
import { dateKey, addDays } from "@/features/time/dates";
import { ActionForm, Field, SelectField, Hidden, payAction, label } from "./common";
import { FieldGrid, TextAreaField } from "@/components/ui/field";
import { Dialog } from "@/components/ui/dialog";
import { TableContainer, Cell2 } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
type Data = Awaited<ReturnType<typeof rateHistory>>;
type Rate = Data["rates"][number];
export function RateForm({ data, selected }: { data: Data; selected?: Rate }) {
  return <ActionForm action={payAction} submitLabel="Save compensation terms" confirmation={{ title: "Save these compensation terms?", description: "Previous versions are kept. Unfinished weekly and monthly calculations in the affected dates must be recalculated before review.", label: "Save terms" }}><Hidden values={{ kind: "rate", employeeId: data.employee.id, ...(selected ? { baseRateId: selected.id, revision: selected.revision } : {}) }} />
    <FieldGrid><SelectField name="employmentPeriodId" label="Employment record" required defaultValue={selected?.employmentPeriodId}>{data.stints.filter(s => !selected || s.id === selected.employmentPeriodId).map(s => <option key={s.id} value={s.id}>{dateKey(s.startDate)} → {s.endDate ? dateKey(s.endDate) : "ongoing"}</option>)}</SelectField><SelectField name="payType" label="Pay type" defaultValue={selected?.payType ?? "MONTHLY"}>{["MONTHLY", "HOURLY", "DAILY"].map(t => <option key={t} value={t}>{label(t)}</option>)}</SelectField></FieldGrid>
    <FieldGrid><Field name="effectiveFrom" label="Effective from" type="date" required defaultValue={selected ? dateKey(selected.effectiveFrom) : undefined} /><Field name="effectiveUntil" label="Ends before (exclusive)" type="date" defaultValue={selected?.effectiveUntil ? dateKey(selected.effectiveUntil) : undefined} hint="Optional. The first date the terms no longer apply." /></FieldGrid>
    <FieldGrid><Field name="baseAmount" label={`Basic amount (${data.currency})`} inputMode="decimal" required defaultValue={selected?.baseAmount} hint="Monthly salary, hourly or daily rate depending on pay type." /><Field name="overtimeHourlyRate" label={`Overtime hourly rate (${data.currency})`} inputMode="decimal" defaultValue={selected?.overtimeHourlyRate ?? ""} hint="Paid for approved overtime only." /></FieldGrid>
    <details className="disclosure rounded-lg border px-3 py-2"><summary>Legacy formula settings</summary><div className="mt-3 grid gap-4 sm:grid-cols-2"><Field name="overtimeHourlyEquivalent" label="Overtime hourly equivalent" inputMode="decimal" defaultValue={selected?.overtimeHourlyEquivalent ?? ""} hint="Leave empty for hourly pay." /><Field name="overtimeMultiplier" label="Overtime multiplier" inputMode="decimal" required defaultValue={selected?.overtimeMultiplier ?? "1"} /></div></details>
    <TextAreaField name="reason" label="Reason for these terms" required maxLength={500} rows={2} />
  </ActionForm>;
}
export function RateHistory({ data, staff }: { data: Data; staff: boolean }) {
  if (!data.rates.length) return <EmptyState title="No compensation terms yet" description={staff ? "Add the employee’s basic salary and overtime hourly rate." : "Your compensation terms will appear here once recorded by HR."} />;
  return <TableContainer label="Compensation history"><table className="data-table min-w-[820px]"><thead><tr><th>Effective dates</th><th>Pay type</th><th className="num">Basic amount</th><th className="num">Overtime hourly rate</th><th>Version</th>{staff && <th className="text-right">Action</th>}</tr></thead><tbody>{data.rates.map(r => <tr key={r.id}>
    <td className="whitespace-nowrap tabular-nums"><Cell2 primary={`${dateKey(r.effectiveFrom)} → ${r.effectiveUntil ? addDays(dateKey(r.effectiveUntil), -1) : "ongoing"}`} secondary={staff && "changeReason" in r ? String(r.changeReason) : undefined} /></td>
    <td>{label(r.payType)}</td><td className="num font-semibold">{formatMoney(r.baseAmount, r.currency, 2)}</td><td className="num">{r.overtimeHourlyRate ? formatMoney(r.overtimeHourlyRate, r.currency, 2) : <span className="text-muted-foreground">Not set</span>}</td>
    <td><StatusBadge status={r.supersededAt ? "SUPERSEDED" : "ACTIVE"} label={r.supersededAt ? "Previous version" : "Current"} /></td>
    {staff && <td className="text-right">{!r.supersededAt && <Dialog triggerSize="sm" variant="ghost" trigger="Change" title="Replace part or all of these terms" description="The original version is retained; unaffected dates keep their terms." size="lg"><RateForm data={data} selected={r} /></Dialog>}</td>}
  </tr>)}</tbody></table></TableContainer>;
}
