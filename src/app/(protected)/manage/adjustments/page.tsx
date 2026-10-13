import { randomUUID } from "node:crypto";
import Link from "next/link";
import { SlidersHorizontal, Plus } from "lucide-react";
import { formatMoney } from "@/features/pay/currency";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { adjustmentData, adjustmentOptions } from "@/features/pay/adjustments";
import { periodData } from "@/features/pay/periods";
import { dateKey } from "@/features/time/dates";
import { ActionForm, Field, SelectField, Hidden, payAction, PayNav, PayDecision, label } from "@/components/pay/common";
import { monthName } from "@/components/pay/statement";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar } from "@/components/ui/filter-bar";
import { Dialog } from "@/components/ui/dialog";
import { TableContainer, Cell2 } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { TextAreaField } from "@/components/ui/field";
import { optionItems, enabledModules } from "@/features/settings/config";
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string; id?: string; periodId?: string }> }) {
  const q = await searchParams, identity = await getIdentity(), data = await pageResult(adjustmentData(identity, q.id ? { id: q.id } : { page: q.page ?? 1 })), periods = await pageResult(periodData(identity)), options = q.periodId ? await pageResult(adjustmentOptions(identity, q.periodId)) : null;
  const categories = await optionItems("ADJUSTMENT_CATEGORY", undefined, true), categoryLabels = Object.fromEntries(categories.map(c => [c.code, c.label])) as Record<string, string>, weekly = (await enabledModules()).weeklyEarnings;
  const open = periods.records.filter(p => p.status !== "FINALIZED");
  return <>
    <PageHeader title="Salary adjustments" description="Bonuses, allowances, deductions and other proposals. Each needs approval by another authorized reviewer before inclusion." actions={options && !options.finalized ? <Dialog variant="default" defaultOpen trigger={<><Plus size={16} aria-hidden="true" />New adjustment</>} title={`New adjustment · ${monthName(dateKey(open.find(p => p.id === options.id)?.startDate ?? new Date()))}`} description="Bonuses, allowances and deductions use positive amounts; “Other” may be signed.">
      <ActionForm action={payAction} submitLabel="Submit for review"><Hidden values={{ kind: "adjustment", periodId: options.id, operationKey: randomUUID() }} /><SelectField name="employeeId" label="Employee" required>{options.employees.map(e => <option key={e.id} value={e.id}>{e.legalName}</option>)}</SelectField><SelectField name="type" label="Type" hint="Manage types in Settings → Lists.">{categories.filter(c => c.isActive).map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</SelectField>{weekly && <Field name="earningWeekDate" label="Workweek start" type="date" hint="Optional. Only for months that use legacy weekly statements." />}<Field name="amount" label={`Amount (${options.currency})`} inputMode="decimal" required placeholder="0.00" /><TextAreaField name="reason" label="Reason and evidence" required maxLength={500} rows={2} /></ActionForm></Dialog> : undefined} />
    <PayNav />
    <FilterBar columns={3}><SelectField name="periodId" label="Propose an adjustment for" defaultValue={q.periodId ?? ""}><option value="">Choose an open month</option>{open.map(p => <option key={p.id} value={p.id}>{monthName(dateKey(p.startDate))}</option>)}</SelectField></FilterBar>
    {!data.records.length ? <EmptyState icon={SlidersHorizontal} title="No adjustments" description="Choose an open salary month above to propose one." /> :
    <TableContainer label="Salary adjustments"><table className="data-table min-w-[900px]"><thead><tr><th>Employee</th><th>Type</th><th className="num">Amount</th><th>Reason</th><th>Month</th><th>Status</th><th className="text-right">Actions</th></tr></thead><tbody>{data.records.map(r => { const editable = !r.correctsSalaryCalculationId && !r.correctsWeeklyStatementId && !r.includedWeeklyStatementId && !r.includedSalaryCalculationId; return <tr key={r.id}>
      <td className="whitespace-nowrap font-medium">{r.employee.legalName}</td><td><Cell2 primary={(r.category && categoryLabels[r.category]) || label(r.type)} secondary={r.correctsSalaryCalculationId || r.correctsWeeklyStatementId ? "Correction" : undefined} /></td><td className="num font-semibold">{formatMoney(r.amount, r.salaryPeriod.currency)}</td>
      <td className="max-w-72 text-[13px]"><span className="line-clamp-2">{r.reason}</span>{r.correctsSalaryCalculationId && <Link className="link text-xs" href={`/manage/salary/${r.correctsSalaryCalculationId}`}>Original statement</Link>}</td>
      <td><Link className="link text-[13px]" href={`/manage/salary?id=${r.salaryPeriodId}`}>Open month</Link></td>
      <td><StatusBadge status={r.status} label={label(r.status)} />{r.includedSalaryCalculationId && <span className="block text-xs text-muted-foreground">In finalized salary</span>}</td>
      <td><div className="flex flex-wrap justify-end gap-1">
        {r.status === "PENDING" && !r.includedSalaryCalculationId && (r.canDecide ? <Dialog triggerSize="sm" variant="default" trigger="Review" title="Review adjustment" description={`${r.employee.legalName} · ${label(r.type)} · ${formatMoney(r.amount, r.salaryPeriod.currency)}`} size="sm"><p className="mb-4 rounded-lg bg-subtle px-3 py-2 text-sm">{r.reason}</p>{r.reconciliationSnapshot ? <p className="mb-4 text-sm text-muted-foreground">Reconciliation: desired {formatMoney((r.reconciliationSnapshot as { desiredTotal: string }).desiredTotal, r.salaryPeriod.currency)}; earlier corrections {formatMoney((r.reconciliationSnapshot as { alreadyFinalizedDelta: string }).alreadyFinalizedDelta, r.salaryPeriod.currency)}.</p> : null}<PayDecision kind="adjustmentDecision" id={r.id} revision={r.revision} /></Dialog> : <span className="text-xs text-muted-foreground">Needs another reviewer</span>)}
        {editable && <Dialog triggerSize="sm" variant="ghost" trigger="Edit" title="Edit adjustment" description="Editing returns the proposal to review." size="sm"><ActionForm action={payAction} submitLabel="Save and resubmit"><Hidden values={{ kind: "adjustmentEdit", id: r.id, revision: r.revision }} /><Field name="amount" label="Amount" required inputMode="decimal" defaultValue={r.amount} /><TextAreaField name="reason" label="Reason and evidence" required maxLength={500} rows={2} defaultValue={r.reason} /></ActionForm></Dialog>}
        {r.correctsSalaryCalculationId && !r.includedSalaryCalculationId && r.status !== "REJECTED" && <Dialog triggerSize="sm" variant="ghost" trigger="Refresh" title="Refresh computed reconciliation" description="Recomputes the difference from current source facts." size="sm"><ActionForm action={payAction} submitLabel="Refresh reconciliation"><Hidden values={{ kind: "reconcile", originalCalculationId: r.correctsSalaryCalculationId, targetPeriodId: r.salaryPeriodId, operationKey: r.operationKey, revision: r.revision }} /><Field name="reason" label="Reason" required maxLength={500} defaultValue={r.reason} />{r.commissionRelated && <><SelectField name="preorderId" label="Pre-order to correct (optional)"><option value="">Recompute current source facts</option>{r.commissionSources.map(c => <option key={c.id} value={c.id}>{c.reference}</option>)}</SelectField><Field name="commissionAmount" label="Verified replacement commission amount" inputMode="decimal" /></>}</ActionForm></Dialog>}
      </div></td></tr>; })}</tbody></table></TableContainer>}
    <Pagination page={data.page} hasNext={data.hasNext} query={{}} />
  </>;
}
