import { randomUUID } from "node:crypto";
import { CalendarRange, Calculator } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog } from "@/components/ui/dialog";
import { TableContainer, Cell2 } from "@/components/ui/table";
import { DescriptionList } from "@/components/ui/description-list";
import { Alert } from "@/components/ui/alert";
import { formatMoney } from "@/features/pay/currency";
import { summarizeBlockers } from "@/features/pay/blockers";
import { addDays } from "@/features/time/dates";
import { rangeLabel } from "@/lib/utils/date-range";
import { weeklyData } from "@/features/pay/weekly";
import { payAction } from "@/features/pay/actions";
import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField } from "@/components/ui/field";
import { hm } from "@/components/time/attendance";
type Row = Awaited<ReturnType<typeof weeklyData>>[number];
const components = (r: Row): [string, string | undefined][] => "baseAmount" in r ? [["Basic / regular", r.baseAmount], ["Approved overtime", r.overtimeAmount], ...("commissionAmount" in r ? [["Approved pre-order commission", r.commissionAmount] as [string, string]] : []), ["Bonuses & allowances", r.bonusAmount], ["Other adjustments", r.otherAmount], ["Deductions", r.deductionAmount]] : [];
export function CalculateWeeklyButton({ employees }: { employees: { id: string; legalName: string }[] }) {
  return <Dialog variant="default" trigger={<><Calculator size={16} aria-hidden="true" />Calculate a week</>} title="Calculate weekly earnings" description="Uses reviewed attendance, approved overtime, approved adjustments and effective compensation terms. Calculation does not finalize or pay anything. If the week already has a statement, use Recalculate on its row." size="sm">
    <ActionForm action={payAction} submitLabel="Calculate"><input type="hidden" name="kind" value="weeklyCalculate" /><SelectField name="employeeId" label="Employee" required><option value="">Choose employee</option>{employees.map(e => <option value={e.id} key={e.id}>{e.legalName}</option>)}</SelectField><Field name="week" label="Workweek start date" type="date" required hint="The first day of the organization’s workweek." /></ActionForm></Dialog>;
}
function Detail({ r, staff }: { r: Row; staff: boolean }) {
  return <Dialog triggerSize="sm" variant="ghost" trigger="Details" title={`${r.employee ? `${r.employee.legalName} · ` : ""}week of ${rangeLabel(r.week, addDays(r.until, -1))}`} description={r.status === "FINALIZED" ? "Finalized statement. Later changes require a separately approved correction." : "Estimate until the statement is finalized."}>
    <div className="space-y-4"><DescriptionList items={[["Status", <StatusBadge key="s" status={r.status} />], ["Total", <span key="t" className="text-base font-semibold">{formatMoney(r.finalAmount, r.currency)}</span>], ["Potential overtime", hm(r.potentialOvertimeSeconds)], ["Approved payable overtime", hm(r.approvedOvertimeSeconds)]]} />
      {components(r).length > 0 ? <dl className="space-y-1.5 rounded-lg border p-4 text-sm">{components(r).map(([k, v]) => <div key={k} className="flex justify-between"><dt className="text-muted-foreground">{k}</dt><dd className="tabular-nums">{v ? `${k === "Deductions" && v !== "0.00" ? "−" : ""}${formatMoney(v, r.currency)}` : "—"}</dd></div>)}<div className="flex justify-between border-t pt-2 font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatMoney(r.finalAmount, r.currency)}</dd></div></dl> : <Alert tone="neutral">{staff ? "Component amounts require the commission-management grant for this statement. The total is shown." : "Only the total is available for this statement."}</Alert>}
      {"blockers" in r && r.blockers?.length ? <Alert tone="warning" title="Resolve before review">{summarizeBlockers(r.blockers).join(" · ")}</Alert> : null}
    </div></Dialog>;
}
export function WeeklyStatements({ rows, employees, periods = [] }: { rows: Awaited<ReturnType<typeof weeklyData>>; employees?: { id: string; legalName: string }[]; periods?: { id: string; startDate: Date; status: string }[] }) {
  const staff = !!employees;
  if (!rows.length) return <EmptyState icon={CalendarRange} title="No weekly statements yet" description={staff ? "Calculate a completed week to create a reviewable statement." : "Your weekly statements appear here after HR calculates them."} />;
  return <TableContainer label="Weekly earning statements"><table className="data-table min-w-[860px]"><thead><tr>{staff && <th>Employee</th>}<th>Week</th><th>Status</th><th className="num">Overtime (potential / approved)</th><th className="num">Total</th><th className="text-right">Actions</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}>
    {staff && <td><Cell2 primary={r.employee?.legalName ?? "—"} /></td>}
    <td className="whitespace-nowrap tabular-nums">{rangeLabel(r.week, addDays(r.until, -1))}</td>
    <td><StatusBadge status={r.status} label={r.status === "REVIEWED" ? "Reviewed" : undefined} />{"blockers" in r && r.blockers?.length ? <span className="ml-2 text-xs text-warning">{r.blockers.length} to resolve</span> : null}</td>
    <td className="num text-[13px]">{hm(r.potentialOvertimeSeconds)} / <span className="font-medium">{hm(r.approvedOvertimeSeconds)}</span></td>
    <td className="num font-semibold">{formatMoney(r.finalAmount, r.currency)}{r.status !== "FINALIZED" && <span className="block text-xs font-normal text-muted-foreground">estimate</span>}</td>
    <td><div className="flex flex-wrap justify-end gap-1.5"><Detail r={r} staff={staff} />
      {staff && r.status !== "FINALIZED" && <ActionForm compact action={payAction} submitVariant="ghost" submitSize="sm" submitLabel="Recalculate"><input type="hidden" name="kind" value="weeklyCalculate" /><input type="hidden" name="employeeId" value={r.employeeId} /><input type="hidden" name="week" value={r.week} /><input type="hidden" name="revision" value={r.revision} /></ActionForm>}
      {staff && r.status !== "FINALIZED" && <ActionForm compact action={payAction} submitVariant={r.status === "REVIEWED" ? "default" : "outline"} submitSize="sm" submitLabel={r.status === "REVIEWED" ? "Finalize" : "Mark reviewed"} confirmation={{ title: r.status === "REVIEWED" ? "Finalize weekly earnings?" : "Mark as reviewed?", description: r.status === "REVIEWED" ? `This freezes ${r.employee?.legalName ?? "the employee"}’s statement at ${formatMoney(r.finalAmount, r.currency)}. Finalization is not payment; month-end payment is recorded separately.` : "Confirm that the calculation and supporting records are ready for finalization.", label: r.status === "REVIEWED" ? "Finalize" : "Mark reviewed" }}><input type="hidden" name="kind" value="weeklyTransition" /><input type="hidden" name="id" value={r.id} /><input type="hidden" name="revision" value={r.revision} /><input type="hidden" name="status" value={r.status === "REVIEWED" ? "FINALIZED" : "REVIEWED"} /></ActionForm>}
      {staff && r.status === "FINALIZED" && <Dialog triggerSize="sm" variant="ghost" trigger="Correct" title="Propose a controlled correction" description="The finalized statement stays unchanged. A signed difference is proposed for a later open month and needs separate approval.">
        <ActionForm action={payAction} submitLabel="Propose correction"><input type="hidden" name="kind" value="weeklyCorrection" /><input type="hidden" name="originalStatementId" value={r.id} /><input type="hidden" name="operationKey" value={randomUUID()} />
          <SelectField name="targetPeriodId" label="Later open salary month" required><option value="">Choose a month</option>{periods.filter(p => p.status !== "FINALIZED" && p.startDate.toISOString().slice(0, 7) >= r.until.slice(0, 7)).map(p => <option key={p.id} value={p.id}>{p.startDate.toISOString().slice(0, 7)}</option>)}</SelectField>
          <Field name="amount" label={`Signed difference (${r.currency})`} inputMode="decimal" required placeholder="e.g. -250.00" hint="Negative to reduce, positive to add. Up to two decimals." /><Field name="reason" label="Correction reason" required maxLength={500} /></ActionForm></Dialog>}
    </div></td></tr>)}</tbody></table></TableContainer>;
}
