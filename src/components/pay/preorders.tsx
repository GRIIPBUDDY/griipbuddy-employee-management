import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Temporal } from "@js-temporal/polyfill";
import { Plus, BadgePercent } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog } from "@/components/ui/dialog";
import { TableContainer, Cell2 } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { TextAreaField, FieldGrid } from "@/components/ui/field";
import { formatMoney } from "@/features/pay/currency";
import type { commissionData, commissionOptions } from "@/features/pay/commissions";
import { displayInstant, dateKey } from "@/features/time/dates";
import { ActionForm, Field, SelectField, Hidden, payAction, PayDecision } from "./common";
type Data = Awaited<ReturnType<typeof commissionData>>;
type Options = Awaited<ReturnType<typeof commissionOptions>>;
type Record = Data["records"][number];
const ruleText = (data: Data) => data.rule.type === "FIXED" ? `${formatMoney(data.rule.value, data.rule.currency)} per verified pre-order` : `${data.rule.value}% of the verified order value`;
const amountText = (r: Record) => r.commissionType === "FIXED" ? `Fixed ${formatMoney(r.commissionValue, r.currency)}` : `${r.commissionValue}% of ${formatMoney(r.orderValue ?? "0", r.currency)}`;
function StaffFields({ data, options, editable }: { data: Data; options: Options; editable?: Record }) {
  const local = (at: Date) => Temporal.Instant.from(at.toISOString()).toZonedDateTimeISO(data.timezone).toPlainDateTime().toString();
  return <><SelectField name="employeeEvidence" label="Employee and eligibility grant" required defaultValue={editable && "eligibilityEvidenceId" in editable ? `${editable.employeeId}|${editable.eligibilityEvidenceId}` : ""} hint="Only employees with retained eligibility at the order time can earn commission."><option value="">Choose employee</option>{options.grants.map(g => <option key={g.id} value={`${g.employeeId}|${g.id}`}>{g.employee.legalName} · eligible since {displayInstant(g.eventTime, data.timezone)}</option>)}</SelectField>
    <FieldGrid><Field name="reference" label="Order reference" required maxLength={100} defaultValue={editable?.reference} /><Field name="orderAt" label="Order date and time" type="datetime-local" step={1} required defaultValue={editable ? local(editable.orderAt) : undefined} hint={data.timezone} /></FieldGrid>
    <FieldGrid columns={3}><SelectField name="commissionType" label="Commission type" defaultValue={editable?.commissionType ?? data.rule.type}><option value="FIXED">Fixed amount</option><option value="PERCENT">Percentage of order</option></SelectField><Field name="commissionValue" label="Amount or percentage" inputMode="decimal" required defaultValue={editable?.commissionValue ?? data.rule.value} /><Field name="orderValue" label={`Order value (${data.rule.currency})`} inputMode="decimal" defaultValue={editable?.orderValue ?? ""} hint="Required for percentage." /></FieldGrid>
    <TextAreaField name="reason" label="Verification evidence" required maxLength={500} rows={2} defaultValue={editable?.reason} /></>;
}
export function RecordPreorderButton({ data, options }: { data: Data; options: Options }) {
  return <Dialog variant="default" trigger={<><Plus size={16} aria-hidden="true" />Record pre-order</>} title="Record a verified pre-order" description={`Current rule: ${ruleText(data)}. The server computes the amount (half-up to two decimals); it needs approval before salary inclusion.`} size="lg"><ActionForm action={payAction} submitLabel="Save for review"><Hidden values={{ kind: "preorderStaff" }} /><StaffFields data={data} options={options} /></ActionForm></Dialog>;
}
export function CommissionRuleButton({ data }: { data: Data }) {
  return <Dialog trigger="Commission rule" title="Publish commission rule" description="Applies to new pre-orders. Existing pre-orders keep their recorded rule and amount." size="sm"><ActionForm action={payAction} submitLabel="Publish rule" confirmation={{ title: "Publish a new commission rule?", description: "New pre-orders will use this rule. Existing records are unchanged.", label: "Publish" }}><Hidden values={{ kind: "commissionPolicy" }} /><SelectField name="type" label="Commission type" defaultValue={data.rule.type}><option value="FIXED">Fixed amount per pre-order</option><option value="PERCENT">Percentage of order value</option></SelectField><Field name="value" label="Amount or percentage" required inputMode="decimal" defaultValue={data.rule.value} /><Field name="reason" label="Reason for the change" required maxLength={500} /></ActionForm></Dialog>;
}
/** Staff management table. Employees use OwnPreorders, which is read-only apart from recheck requests. */
export function Preorders({ data, options }: { data: Data; options: Options }) {
  if (!data.records.length) return <EmptyState icon={BadgePercent} title="No pre-orders recorded" description="Record a verified pre-order for an eligible employee." />;
  return <><TableContainer label="Pre-orders"><table className="data-table min-w-[980px]"><thead><tr><th>Employee</th><th>Reference</th><th>Order time</th><th>Rule</th><th className="num">Commission</th><th>Status</th><th className="text-right">Actions</th></tr></thead><tbody>{data.records.map(r => { const open = !r.includedWeeklyStatementId && ["PENDING", "APPROVED"].includes(r.status); return <tr key={r.id}>
    <td className="whitespace-nowrap font-medium">{r.employee?.legalName}</td><td><Cell2 primary={r.reference} secondary={`Week of ${r.earningWeek}`} /></td><td className="whitespace-nowrap text-[13px]">{displayInstant(r.orderAt, data.timezone)}</td><td className="text-[13px]">{amountText(r)}</td><td className="num font-semibold">{formatMoney(r.commissionAmount, r.currency)}</td>
    <td><StatusBadge status={r.status} />{r.salaryPeriodId && <Link className="mt-1 block text-xs text-primary hover:underline" href={`/manage/salary?id=${r.salaryPeriodId}`}>Salary month</Link>}</td>
    <td><div className="flex flex-wrap justify-end gap-1">
      {r.status === "PENDING" && <Dialog triggerSize="sm" variant="default" trigger="Review" title="Review pre-order" description={`${r.employee?.legalName} · ${r.reference} · ${formatMoney(r.commissionAmount, r.currency)} (${amountText(r)})`} size="sm"><p className="mb-4 rounded-lg bg-subtle px-3 py-2 text-sm">{r.reason}</p><PayDecision kind="preorderDecision" id={r.id} revision={r.revision} /></Dialog>}
      {r.status !== "INCLUDED" && !r.includedWeeklyStatementId && <Dialog triggerSize="sm" variant="ghost" trigger="Edit" title="Edit pre-order" description="Editing returns the record to review." size="lg"><ActionForm action={payAction} submitLabel="Save and resubmit"><Hidden values={{ kind: "preorderStaff", id: r.id, revision: r.revision }} /><StaffFields data={data} options={options} editable={r} /></ActionForm></Dialog>}
      {open && <Dialog triggerSize="sm" variant="ghost" trigger="Assign month" title="Assign to a salary month" description="Assign the commission to an open month, or explicitly defer it." size="sm"><ActionForm action={payAction} submitLabel="Save assignment"><Hidden values={{ kind: "assign", id: r.id, revision: r.revision }} /><SelectField name="periodId" label="Open salary month" required defaultValue={r.salaryPeriodId ?? ""}><option value="">Choose month</option>{data.periods.map(p => <option key={p.id} value={p.id}>{dateKey(p.startDate).slice(0, 7)}</option>)}</SelectField><Field name="reason" label="Reason" required maxLength={500} /></ActionForm></Dialog>}
      {open && <ActionForm compact action={payAction} submitVariant="ghost" submitSize="sm" submitLabel="Cancel" confirmation={{ title: "Cancel this pre-order?", description: `${r.reference} for ${r.employee?.legalName} is cancelled and kept in history. Its reference cannot be reused.`, label: "Cancel pre-order", destructive: true }}><Hidden values={{ kind: "preorderCancel", id: r.id }} /></ActionForm>}
    </div></td></tr>; })}</tbody></table></TableContainer><Pagination page={data.page} hasNext={data.hasNext} query={{}} /></>;
}
export function OwnPreorders({ data }: { data: Data }) {
  return <Card><CardHeader><CardTitle>My pre-orders</CardTitle><CardDescription>Amounts are recorded and verified by authorized staff. If something looks wrong, request a recheck.</CardDescription></CardHeader><CardContent>{!data.records.length ? <EmptyState icon={BadgePercent} title="No pre-orders yet" description="Verified pre-orders recorded for you will appear here." /> :
    <TableContainer label="My pre-orders" flush className="rounded-lg border"><table className="data-table min-w-[720px]"><thead><tr><th>Reference</th><th>Order time</th><th>Rule</th><th className="num">Commission</th><th>Status</th><th className="text-right">Action</th></tr></thead><tbody>{data.records.map(r => <tr key={r.id}><td><Cell2 primary={r.reference} secondary={`Week of ${r.earningWeek}`} /></td><td className="whitespace-nowrap text-[13px]">{displayInstant(r.orderAt, data.timezone)}</td><td className="text-[13px]">{amountText(r)}</td><td className="num font-semibold">{formatMoney(r.commissionAmount, r.currency)}</td><td><StatusBadge status={r.status} /></td>
      <td className="text-right"><Dialog triggerSize="sm" variant="ghost" trigger="Request recheck" title="Request a recheck" description={`${r.reference} · ${formatMoney(r.commissionAmount, r.currency)}. Staff review the request; you cannot change the recorded amount yourself.`} size="sm"><ActionForm action={payAction} submitLabel="Submit request"><Hidden values={{ kind: "recheck", preorderId: r.id, operationKey: randomUUID() }} /><Field name="reason" label="Reason" required maxLength={500} /><TextAreaField name="explanation" label="Details" maxLength={2000} rows={3} hint="Optional. What should the amount be, and why?" /></ActionForm></Dialog></td></tr>)}</tbody></table></TableContainer>}<Pagination className="mt-4" page={data.page} hasNext={data.hasNext} query={{}} /></CardContent></Card>;
}
